// src/fsm/register.ts
import { Conversation } from '@grammyjs/conversations';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { InlineKeyboard } from 'grammy';
import { sendMainMenu } from '../utils/menu.js';
import { ADMIN_IDS } from '../config.js';

type MyConversation = Conversation<MyContext>;

export async function sellerRegistration(conversation: MyConversation, ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) {
    await ctx.reply('Не удалось определить пользователя.');
    return;
  }

  // 1. Пользователь
  const user = await prisma.user.upsert({
    where: { tgId },
    update: { username: ctx.from?.username ?? null },
    create: { tgId, username: ctx.from?.username ?? null, role: 'USER' },
  });

  if (await prisma.magazine.findUnique({ where: { ownerId: user.id } })) {
    await ctx.reply('У вас уже есть магазин. Вы не можете создать ещё один.');
    return;
  }

  // 2. Название
  await ctx.reply('Введите название магазина (3–50 символов):');
  const nameCtx = await conversation.wait();
  const name = nameCtx.message?.text?.trim();
  if (!name || name.length < 3 || name.length > 50) {
    await ctx.reply('❌ Название должно быть от 3 до 50 символов. Регистрация отменена.');
    return;
  }

  // 3. Описание
  await ctx.reply('Краткое описание (до 500 символов, /skip чтобы пропустить):');
  const descCtx = await conversation.wait();
  let description: string | null = null;
  if (descCtx.message?.text && descCtx.message.text !== '/skip') {
    const desc = descCtx.message.text.trim();
    if (desc.length > 500) {
      await ctx.reply('❌ Описание длиннее 500 символов. Регистрация отменена.');
      return;
    }
    description = desc;
  }

  // 4. Фото (сохраняем только file_id)
  await ctx.reply('Отправьте фото магазина (или любой текст, чтобы пропустить):');
  const photoCtx = await conversation.wait();
  let photoFileId: string | null = null;
  if (photoCtx.message?.photo) {
    photoFileId = photoCtx.message.photo[photoCtx.message.photo.length - 1].file_id;
  }

  // 5. Подтверждение
  const summary = [
    '📋 **Подтверждение:**',
    `Название: ${name}`,
    `Описание: ${description || '—'}`,
    `Фото: ${photoFileId ? '✅ загружено' : '❌ не загружено'}`,
  ].join('\n');

  const confirmKeyboard = new InlineKeyboard()
    .text('✅ Создать магазин', 'shop_confirm_yes')
    .text('❌ Отмена', 'shop_confirm_no');

  await ctx.reply(summary, { parse_mode: 'Markdown', reply_markup: confirmKeyboard });
  const confirmCtx = await conversation.waitForCallbackQuery(['shop_confirm_yes', 'shop_confirm_no']);

  if (confirmCtx.callbackQuery.data === 'shop_confirm_no') {
    await confirmCtx.editMessageText('Регистрация отменена.');
    return;
  }

  // 6. Сохранение магазина с file_id
  try {
    await prisma.magazine.upsert({
      where: { ownerId: user.id },
      create: {
        ownerId: user.id,
        name,
        description,
        photoFileId, // строка file_id или null
        isActive: true,
      },
      update: {},
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'SELLER' },
    });
  } catch (dbError) {
    console.error('Ошибка БД при создании магазина:', dbError);
    await confirmCtx.editMessageText('Произошла ошибка при сохранении данных.');
    return;
  }

  // 7. Сессия и финал
  ctx.session.userRole = 'SELLER';
  ctx.session.isAdmin = ADMIN_IDS.includes(tgId);

  try {
    await confirmCtx.editMessageText('🎉 Магазин успешно создан!');
  } catch (e) {
    console.warn('Не удалось отредактировать:', e);
  }
  await sendMainMenu(ctx);
}
