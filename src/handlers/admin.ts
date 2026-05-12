// src/handlers/admin.ts
import {
  Bot,
  InlineKeyboard,
  InputMediaBuilder,
  Api,
  RawApi,
} from 'grammy';
import { Conversation, createConversation } from '@grammyjs/conversations';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { moderationButtons } from '../keyboards/moderation.js';

const QUEUE_PAGE_SIZE = 5;

// ---------- Вспомогательная функция уведомления продавца ----------
async function notifySeller(
  api: Api<RawApi>,
  ownerTgId: bigint | number,
  text: string,
  replyMarkup?: InlineKeyboard,
) {
  try {
    await api.sendMessage(Number(ownerTgId), text, {
      reply_markup: replyMarkup,
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.error(`Уведомить продавца tg=${ownerTgId} не удалось:`, e);
  }
}

// ---------- Очередь модерации ----------
export async function showModerationQueue(ctx: MyContext, page = 1) {
  if (!ctx.session.isAdmin && ctx.session.userRole !== 'ADMIN') {
    await ctx.reply('⛔ Недостаточно прав.');
    return;
  }

  const total = await prisma.product.count({ where: { status: 'PENDING' } });
  const totalPages = Math.ceil(total / QUEUE_PAGE_SIZE) || 1;
  const products = await prisma.product.findMany({
    where: { status: 'PENDING' },
    include: { magazine: { include: { owner: true } }, category: true },
    orderBy: { id: 'asc' },
    skip: (page - 1) * QUEUE_PAGE_SIZE,
    take: QUEUE_PAGE_SIZE,
  });

  if (total === 0) {
    await ctx.reply('✅ Очередь модерации пуста.');
    return;
  }

  let text = `🛡 <b>Товары на модерации</b> (стр. ${page}/${totalPages})\n\n`;
  const keyboard = new InlineKeyboard();

  products.forEach((p) => {
    text += `🆕 <b>${p.name}</b> (#${p.id})\n💰 ${p.price}₽ | 📂 ${p.category?.name ?? '—'}\n🏪 ${p.magazine?.name ?? '—'} (Tg: ${p.magazine?.owner.tgId})\n\n`;
    keyboard.text(`⚡ ${p.name}`, `moderate:select_${p.id}`).row();
  });

  // Пагинация
  if (page > 1) keyboard.text('⬅️ Назад', `mod_queue:page_${page - 1}`);
  keyboard.text(`${page}/${totalPages}`, 'mod_queue:noop');
  if (page < totalPages) keyboard.text('➡️ Вперёд', `mod_queue:page_${page + 1}`);

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

// ---------- Детальный просмотр товара ----------
async function showProductDetail(ctx: MyContext, productId: number) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { magazine: { include: { owner: true } }, category: true },
  });

  if (!product) {
    await ctx.answerCallbackQuery('Товар не найден.');
    return;
  }

  const desc =
    product.description?.substring(0, 200) +
    (product.description && product.description.length > 200 ? '...' : '');

  const text = [
    `🆕 <b>${product.name}</b> (#${product.id})`,
    `💰 Цена: ${product.price}₽`,
    `📦 Остаток: ${product.stockCount}`,
    `🏪 Магазин: ${product.magazine?.name}`,
    `👤 Продавец: tg://user?id=${product.magazine?.owner.tgId}`,
    `📂 Категория: ${product.category?.name ?? '—'}`,
    desc ? `📝 Описание: ${desc}` : '',
  ].join('\n');

  const keyboard = moderationButtons(product.id);
  const photos = product.photoFileIds;

  try {
    if (photos.length === 1) {
      await ctx.replyWithPhoto(photos[0], {
        caption: text,
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    } else if (photos.length > 1) {
      const media = photos.map((id, idx) =>
        InputMediaBuilder.photo(id, {
          caption: idx === 0 ? text : undefined,
          parse_mode: 'HTML',
        }),
      );
      await ctx.replyWithMediaGroup(media);
      await ctx.reply('Выберите действие:', { reply_markup: keyboard });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    }
  } catch {
    await ctx.reply(text + '\n\n(фото не загрузилось)', { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

// ---------- Conversation для ввода причины отклонения / правок ----------
export async function moderationReasonConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
) {
  const { productId, action } = ctx.session.tempModeration ?? {};
  if (!productId || !action) {
    await ctx.reply('Ошибка: недостаточно данных.');
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { magazine: { include: { owner: true } } },
  });

  if (!product || product.status !== 'PENDING') {
    await ctx.reply('Товар уже обработан.');
    delete ctx.session.tempModeration;
    return;
  }

  const actionText = action === 'reject' ? 'отклонения' : 'правки';
  await ctx.reply(`✏️ Введите причину ${actionText} для товара «${product.name}»:`);
  const reasonCtx = await conversation.wait();
  const reason = reasonCtx.message?.text?.trim() || 'Причина не указана';

  const statusValue = action === 'reject' ? 'REJECTED' : 'MODERATION';

  await prisma.product.update({
    where: { id: productId },
    data: {
      status: statusValue as any,
      rejectionReason: reason,
    },
  });

  const adminId = ctx.from?.id;
  console.log(
    `[${new Date().toISOString()}] ADMIN ${adminId} ${action} product #${productId}, reason: ${reason}`,
  );

  // Уведомить продавца
  if (product.magazine?.owner.tgId) {
    const msg =
      action === 'reject'
        ? `❌ Ваш товар «${product.name}» отклонён.\n📝 Причина: ${reason}`
        : `✏️ Ваш товар «${product.name}» требует правок.\n📝 Причина: ${reason}`;
    const editKeyboard = new InlineKeyboard().text('✏️ Редактировать', `edit_product:${productId}`);
    await notifySeller(ctx.api, product.magazine.owner.tgId, msg, editKeyboard);
  }

  // Обновить сообщение админа (если возможно)
  try {
    await ctx.editMessageText?.(
      `Товар #${productId}: ${action === 'reject' ? '❌ отклонён' : '✏️ требует правок'}\nПричина: ${reason}`,
    );
  } catch {}

  delete ctx.session.tempModeration;
  await ctx.reply('✅ Действие выполнено.');
}

// ---------- Регистрация обработчиков ----------
export function setupModerationHandlers(bot: Bot<MyContext>) {
  // Команда /moderation_queue
  bot.command('moderation_queue', async (ctx) => {
    await showModerationQueue(ctx);
  });

  // Кнопки очереди
  bot.callbackQuery(/mod_queue:page_(\d+)/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await showModerationQueue(ctx, page);
  });

  bot.callbackQuery(/moderate:select_(\d+)/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const productId = Number(ctx.match[1]);
    await showProductDetail(ctx, productId);
  });

  // Кнопки одобрения / отклонения / правок
  bot.callbackQuery(/moderate:(approve|reject|revise)_(\d+)/, async (ctx) => {
    if (!ctx.session.isAdmin && ctx.session.userRole !== 'ADMIN') {
      await ctx.answerCallbackQuery('⛔ Недостаточно прав.');
      return;
    }

    const action = ctx.match[1];
    const productId = Number(ctx.match[2]);

    // Race condition: проверить, не обработан ли товар
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { magazine: { include: { owner: true } } },
    });
    if (!product || product.status !== 'PENDING') {
      await ctx.answerCallbackQuery('Товар уже обработан.');
      try {
        await ctx.editMessageReplyMarkup(undefined);
      } catch {}
      return;
    }

    if (action === 'approve') {
      await prisma.product.update({
        where: { id: productId },
        data: { status: 'ACTIVE' },
      });

      console.log(
        `[${new Date().toISOString()}] ADMIN ${ctx.from?.id} APPROVED product #${productId}`,
      );
      await ctx.answerCallbackQuery('✅ Одобрено');

      if (product.magazine?.owner.tgId) {
        await notifySeller(
          ctx.api,
          product.magazine.owner.tgId,
          `✅ Ваш товар «${product.name}» опубликован!`,
        );
      }

      try {
        await ctx.editMessageText(
          `✅ Товар #${productId} «${product.name}» одобрен.\nОпубликован в магазине ${product.magazine?.name}.`,
        );
      } catch {}
    } else {
      // Отклонение или правки — сохраняем данные и запускаем conversation
      ctx.session.tempModeration = { productId, action };
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter('moderationReason');
    }
  });

  // Conversation для причины
  bot.use(createConversation(moderationReasonConversation, 'moderationReason'));
}
