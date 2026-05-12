// src/handlers/review.ts
import { Conversation } from '@grammyjs/conversations';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { InlineKeyboard } from 'grammy';

async function leaveReviewConversation(
  conversation: Conversation<MyContext>,
  ctx: MyContext,
) {
  const data = ctx.session.reviewData;
  if (!data) {
    await ctx.reply('Ошибка: нет данных о покупке.');
    return;
  }

  const { purchaseId, productId, magazineId, productName } = data;

  // Шаг 1: Выбор рейтинга
  const ratingKeyboard = new InlineKeyboard();
  for (let i = 1; i <= 5; i++) {
    ratingKeyboard.text('⭐'.repeat(i), `review:rate_${i}`);
  }
  await ctx.reply(`Оцените товар «${productName}»:`, {
    reply_markup: ratingKeyboard,
  });

  let rating: number;
  const rateCtx = await conversation.waitForCallbackQuery(/review:rate_(\d)/);
  rating = Number(rateCtx.match?.[1] ?? 5);
  await rateCtx.answerCallbackQuery(`Вы выбрали ${rating} ⭐`);
  
  // Удаляем сообщение с рейтингом
  try {
    await rateCtx.deleteMessage();
  } catch {}

  // Шаг 2: Ввод комментария
  await ctx.reply(
    'Напишите отзыв (или нажмите /skip, чтобы пропустить):',
    { reply_markup: { remove_keyboard: true } },
  );
  const commentCtx = await conversation.wait();
  let comment: string | null = null;
  if (commentCtx.message?.text && commentCtx.message.text !== '/skip') {
    comment = commentCtx.message.text.trim().slice(0, 500);
  }
  
  // Удаляем сообщение с просьбой ввести комментарий
  try {
    await ctx.deleteMessage();
  } catch {}

  // Шаг 3: Подтверждение
  const confirmKeyboard = new InlineKeyboard()
    .text('📤 Отправить на модерацию', 'review:submit');
    
  const previewText = 
    `Ваш отзыв:\n⭐ ${rating}/5` +
    (comment ? `\n📝 ${comment}` : '') +
    '\n\n⚠️ Отзыв появится после проверки администратором.\n\nОтправить?';
    
  await ctx.reply(previewText, { reply_markup: confirmKeyboard });

  const submitCtx = await conversation.waitForCallbackQuery('review:submit');
  await submitCtx.answerCallbackQuery();
  
  // Удаляем сообщение с подтверждением
  try {
    await submitCtx.deleteMessage();
  } catch {}

  const tgId = ctx.from?.id;
  const user = await prisma.user.findUnique({ where: { tgId } });
  const reviewerId = user?.id;
  if (!reviewerId) {
    await ctx.reply('Пользователь не найден.');
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.review.findUnique({ where: { purchaseId } });
      if (existing) throw new Error('ALREADY_REVIEWED');

      await tx.review.create({
        data: {
          purchaseId,
          reviewerId,
          magazineId,
          productId,
          rating,
          comment,
          isApproved: false, // Требует модерации
        },
      });
    });

    await ctx.reply('🎉 Спасибо за отзыв! Он появится после проверки администратором.');
  } catch (err: any) {
    if (err.message === 'ALREADY_REVIEWED' || err.code === 'P2002') {
      await ctx.reply('Вы уже оставили отзыв на этот товар.');
    } else {
      console.error('Ошибка сохранения отзыва:', err);
      await ctx.reply('Произошла ошибка. Отзыв не сохранён.');
    }
  }

  delete ctx.session.reviewData;
}

export { leaveReviewConversation };
