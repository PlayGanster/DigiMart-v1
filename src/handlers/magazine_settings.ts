// src/handlers/magazine_settings.ts
import { Bot, InlineKeyboard } from 'grammy';
import { Conversation } from '@grammyjs/conversations';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { settingsKeyboard } from '../keyboards/settings.js';
import { sendMainMenu } from '../utils/menu.js';

/**
 * Вспомогательная функция: получить магазин текущего продавца
 */
async function getSellerMagazine(ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return null;
  const user = await prisma.user.findUnique({
    where: { tgId },
    include: { magazine: true },
  });
  return user?.magazine ?? null;
}

/**
 * Показать панель настроек магазина
 */
export async function showSettings(ctx: MyContext) {
  if (ctx.session.userRole !== 'SELLER') {
    await ctx.reply('Эта функция доступна только продавцам.');
    return;
  }

  const magazine = await getSellerMagazine(ctx);
  if (!magazine) {
    await ctx.reply('У вас ещё нет магазина. Создайте его через /start.');
    return;
  }

  const keyboard = settingsKeyboard(magazine.isActive);
  await ctx.reply(
    `⚙️ <b>Настройки магазина</b>\n\n` +
    `Название: ${magazine.name}\n` +
    `Статус: ${magazine.isActive ? '🟢 Активен' : '🔴 Остановлен'}`,
    { parse_mode: 'HTML', reply_markup: keyboard },
  );
}

/**
 * Обработчики кнопок в настройках
 */
export function setupMagazineSettingsHandlers(bot: Bot<MyContext>) {
  // Команда /settings
  bot.command('settings', showSettings);

  // Переключение активности магазина
  bot.callbackQuery(/magazine:toggle_(on|off)/, async (ctx) => {
    if (ctx.session.userRole !== 'SELLER') {
      await ctx.answerCallbackQuery('⛔ Только для продавцов');
      return;
    }
    const magazine = await getSellerMagazine(ctx);
    if (!magazine) {
      await ctx.answerCallbackQuery('Магазин не найден');
      return;
    }

    const newActive = ctx.match[1] === 'on'; // toggle_on → включить (true)

    await prisma.magazine.update({
      where: { id: magazine.id },
      data: { isActive: newActive },
    });

    // Обновим сообщение с настройками
    const keyboard = settingsKeyboard(newActive);
    await ctx.editMessageText(
      `⚙️ <b>Настройки магазина</b>\n\n` +
      `Название: ${magazine.name}\n` +
      `Статус: ${newActive ? '🟢 Активен' : '🔴 Остановлен'}`,
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
    await ctx.answerCallbackQuery(`Магазин ${newActive ? 'запущен' : 'остановлен'}`);
  });

  // Запуск conversation редактирования информации
  bot.callbackQuery('magazine:edit_info', async (ctx) => {
    if (ctx.session.userRole !== 'SELLER') {
      await ctx.answerCallbackQuery('⛔ Только для продавцов');
      return;
    }
    const magazine = await getSellerMagazine(ctx);
    if (!magazine) {
      await ctx.answerCallbackQuery('Магазин не найден');
      return;
    }
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('editMagazine');
  });

  // Кнопка «Назад» из настроек возвращает в главное меню
  bot.callbackQuery('menu_main', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMainMenu(ctx);
  });
}

// ----- Conversation редактирования магазина -----
async function editMagazineConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { tgId },
    include: { magazine: true },
  });
  if (!user?.magazine) {
    await ctx.reply('Магазин не найден.');
    return;
  }

  const magazine = user.magazine;

  // Шаг 1: Название
  await ctx.reply(`Текущее название: <b>${magazine.name}</b>\nВведите новое название (или /skip, чтобы оставить):`, {
    parse_mode: 'HTML',
  });
  const nameCtx = await conversation.wait();
  let name = magazine.name;
  if (nameCtx.message?.text && nameCtx.message.text !== '/skip') {
    const val = nameCtx.message.text.trim();
    if (val.length < 3 || val.length > 50) {
      await ctx.reply('❌ Название должно быть от 3 до 50 символов. Оставлено прежнее.');
    } else {
      name = val;
    }
  }

  // Шаг 2: Описание
  await ctx.reply(
    `Текущее описание: ${magazine.description || '—'}\nВведите новое (или /skip):`,
  );
  const descCtx = await conversation.wait();
  let description = magazine.description;
  if (descCtx.message?.text && descCtx.message.text !== '/skip') {
    const val = descCtx.message.text.trim();
    if (val.length > 500) {
      await ctx.reply('❌ Описание длиннее 500 символов. Оставлено прежнее.');
    } else {
      description = val || null;
    }
  }

  // Шаг 3: Фото
  await ctx.reply('Отправьте новое фото магазина (или /skip):');
  const photoCtx = await conversation.wait();
  let photoFileId = magazine.photoFileId;
  if (photoCtx.message?.photo && photoCtx.message.text !== '/skip') {
    const photos = photoCtx.message.photo;
    photoFileId = photos[photos.length - 1].file_id;
  }

  // Обновление БД
  try {
    await prisma.magazine.update({
      where: { id: magazine.id },
      data: { name, description, photoFileId },
    });

    await ctx.reply('✅ Информация о магазине обновлена.');
    // Возвращаемся в настройки
    await showSettings(ctx);
  } catch (e) {
    console.error('Ошибка обновления магазина:', e);
    await ctx.reply('Произошла ошибка при обновлении.');
  }
}

export { editMagazineConversation };
