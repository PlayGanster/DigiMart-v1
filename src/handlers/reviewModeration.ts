// src/handlers/reviewModeration.ts
import { Bot, InlineKeyboard } from 'grammy';
import { Conversation, createConversation } from '@grammyjs/conversations';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';

const REVIEWS_PER_PAGE = 5;

// Показать очередь отзывов на модерацию
export async function showReviewQueue(ctx: MyContext, page = 1) {
  if (!ctx.session.isAdmin && ctx.session.userRole !== 'ADMIN') {
    await ctx.reply('⛔ Недостаточно прав.');
    return;
  }

  const total = await prisma.review.count({ where: { isApproved: false } });
  const totalPages = Math.ceil(total / REVIEWS_PER_PAGE) || 1;
  
  const reviews = await prisma.review.findMany({
    where: { isApproved: false },
    include: { 
      reviewer: true, 
      product: true, 
      magazine: { include: { owner: true } } 
    },
    orderBy: { id: 'asc' },
    skip: (page - 1) * REVIEWS_PER_PAGE,
    take: REVIEWS_PER_PAGE,
  });

  if (total === 0) {
    const keyboard = new InlineKeyboard().text('🔙 В главное меню', 'menu_main');
    await ctx.reply('✅ Все отзывы проверены.', { reply_markup: keyboard });
    return;
  }

  let text = `📝 <b>Отзывы на модерации</b> (стр. ${page}/${totalPages})\n\n`;
  const keyboard = new InlineKeyboard();

  for (const review of reviews) {
    const stars = '⭐'.repeat(review.rating);
    text += `<b>#${review.id}</b> | ${stars} (${review.rating}/5)\n`;
    text += `📦 Товар: ${review.product?.name}\n`;
    text += `🏪 Магазин: ${review.magazine?.name}\n`;
    text += `👤 Автор: tg://user?id=${review.reviewer.tgId}\n`;
    if (review.comment) {
      text += `💬 "${review.comment.substring(0, 100)}${review.comment.length > 100 ? '...' : ''}"\n`;
    }
    text += '\n';
    
    keyboard.text(`⚡ Отзыв #${review.id}`, `review_mod:select_${review.id}`).row();
  }

  // Пагинация и кнопка назад в меню
  if (page > 1) keyboard.text('⬅️ Назад', `review_mod_queue:page_${page - 1}`);
  keyboard.text(`${page}/${totalPages}`, 'review_mod_queue:noop');
  if (page < totalPages) keyboard.text('➡️ Вперёд', `review_mod_queue:page_${page + 1}`);
  keyboard.row().text('🔙 В главное меню', 'menu_main');

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

// Детальный просмотр отзыва
async function showReviewDetail(ctx: MyContext, reviewId: number) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { 
      reviewer: true, 
      product: { include: { magazine: { include: { owner: true } } } }, 
      magazine: { include: { owner: true } } 
    },
  });

  if (!review) {
    await ctx.answerCallbackQuery('Отзыв не найден.');
    return;
  }

  const stars = '⭐'.repeat(review.rating);
  const text = [
    `📝 <b>Отзыв #${review.id}</b>`,
    `${stars} (${review.rating}/5)`,
    ``,
    `📦 Товар: ${review.product?.name} (#${review.product?.id})`,
    `🏪 Магазин: ${review.magazine?.name}`,
    `👤 Автор: tg://user?id=${review.reviewer.tgId}`,
    `📅 Дата: ${new Date(review.createdAt).toLocaleString('ru-RU')}`,
    review.comment ? `💬 Комментарий:\n"${review.comment}"` : '',
  ].filter(Boolean).join('\n');

  const keyboard = new InlineKeyboard()
    .text('✅ Одобрить', `review_mod:approve_${review.id}`)
    .text('❌ Отклонить', `review_mod:reject_${review.id}`)
    .row()
    .text('🔙 Назад к списку', 'review_mod:back_to_queue')
    .row()
    .text('🔙 В главное меню', 'menu_main');

  try {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } catch {
    await ctx.reply(text + '\n\n(ошибка форматирования)', { reply_markup: keyboard });
  }
}

// Conversation для ввода причины отклонения
export async function reviewRejectReasonConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
) {
  const reviewId = ctx.session.tempReviewModeration?.reviewId;
  if (!reviewId) {
    await ctx.reply('Ошибка: нет данных.');
    return;
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { reviewer: true, product: true },
  });

  if (!review) {
    await ctx.reply('Отзыв уже обработан.');
    delete ctx.session.tempReviewModeration;
    return;
  }

  await ctx.reply(`✏️ Введите причину отклонения отзыва #${reviewId}:`);
  const reasonCtx = await conversation.wait();
  const reason = reasonCtx.message?.text?.trim() || 'Причина не указана';

  // Удаляем отзыв
  await prisma.review.delete({ where: { id: reviewId } });

  console.log(
    `[${new Date().toISOString()}] ADMIN ${ctx.from?.id} REJECTED review #${reviewId}, reason: ${reason}`,
  );

  // Уведомить автора
  if (review.reviewer.tgId) {
    try {
      await ctx.api.sendMessage(Number(review.reviewer.tgId), 
        `❌ Ваш отзыв на товар «${review.product?.name}» отклонён.\n📝 Причина: ${reason}`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      console.error(`Не удалось уведомить автора отзыва tg=${review.reviewer.tgId}:`, e);
    }
  }

  // Обновить сообщение админа
  try {
    await ctx.editMessageText?.(
      `Отзыв #${reviewId}: ❌ отклонён\nПричина: ${reason}`,
    );
  } catch {}

  delete ctx.session.tempReviewModeration;
  await ctx.reply('✅ Отзыв отклонён.');
}

// Обработка одобрения/отклонения
async function handleReviewAction(ctx: MyContext, reviewId: number, action: 'approve' | 'reject') {
  if (!ctx.session.isAdmin && ctx.session.userRole !== 'ADMIN') {
    await ctx.answerCallbackQuery('⛔ Недостаточно прав.');
    return;
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { magazine: true, product: true },
  });

  if (!review || review.isApproved) {
    await ctx.answerCallbackQuery('Отзыв уже обработан.');
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {}
    return;
  }

  if (action === 'approve') {
    await prisma.$transaction(async (tx) => {
      // Одобрить отзыв
      await tx.review.update({
        where: { id: reviewId },
        data: { isApproved: true },
      });

      // Пересчитать средний рейтинг магазина
      const agg = await tx.review.aggregate({
        _avg: { rating: true },
        where: { magazineId: review.magazineId, isApproved: true },
      });
      const newAvg = agg._avg.rating ?? 0;
      await tx.magazine.update({
        where: { id: review.magazineId },
        data: { avgRating: Math.round(newAvg * 10) / 10 },
      });
    });

    console.log(
      `[${new Date().toISOString()}] ADMIN ${ctx.from?.id} APPROVED review #${reviewId}`,
    );
    await ctx.answerCallbackQuery('✅ Одобрено');

    // Уведомить автора
    if (review.reviewerId) {
      const reviewer = await prisma.user.findUnique({ where: { id: review.reviewerId } });
      if (reviewer?.tgId) {
        try {
          await ctx.api.sendMessage(Number(reviewer.tgId), 
            `✅ Ваш отзыв на товар «${review.product?.name}» опубликован!`,
            { parse_mode: 'HTML' }
          );
        } catch (e) {
          console.error(`Не удалось уведомить автора tg=${reviewer.tgId}:`, e);
        }
      }
    }

    try {
      await ctx.editMessageText(
        `✅ Отзыв #${reviewId} одобрен и опубликован.`,
      );
    } catch {}
  } else {
    // Отклонение — запускаем conversation для ввода причины
    ctx.session.tempReviewModeration = { reviewId };
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('reviewRejectReason');
  }
}

// Регистрация обработчиков
export function setupReviewModerationHandlers(bot: Bot<MyContext>) {
  // Команда /review_moderation
  bot.command('review_moderation', async (ctx) => {
    await showReviewQueue(ctx);
  });

  // Пагинация очереди
  bot.callbackQuery(/review_mod_queue:page_(\d+)/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await showReviewQueue(ctx, page);
  });

  // Выбор отзыва из списка
  bot.callbackQuery(/review_mod:select_(\d+)/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const reviewId = Number(ctx.match[1]);
    await showReviewDetail(ctx, reviewId);
  });

  // Действия с отзывом (одобрить/отклонить)
  bot.callbackQuery(/review_mod:(approve|reject)_(\d+)/, async (ctx) => {
    const action = ctx.match[1] as 'approve' | 'reject';
    const reviewId = Number(ctx.match[2]);
    await handleReviewAction(ctx, reviewId, action);
  });

  // Назад к списку
  bot.callbackQuery('review_mod:back_to_queue', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showReviewQueue(ctx, 1);
  });

  // Conversation для причины отклонения
  bot.use(createConversation(reviewRejectReasonConversation, 'reviewRejectReason'));
}
