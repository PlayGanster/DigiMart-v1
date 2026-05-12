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

  await ctx.reply(
    'Напишите отзыв (или нажмите /skip, чтобы пропустить):',
    { reply_markup: { remove_keyboard: true } },
  );
  const commentCtx = await conversation.wait();
  let comment: string | null = null;
  if (commentCtx.message?.text && commentCtx.message.text !== '/skip') {
    comment = commentCtx.message.text.trim().slice(0, 500);
  }

  const confirmKeyboard = new InlineKeyboard().text(
    '📤 Отправить отзыв',
    'review:submit',
  );
  await ctx.reply(
    `Ваш отзыв:\n⭐ ${rating}/5` +
      (comment ? `\n📝 ${comment}` : '') +
      '\n\nОтправить?',
    { reply_markup: confirmKeyboard },
  );

  const submitCtx = await conversation.waitForCallbackQuery('review:submit');
  await submitCtx.answerCallbackQuery();

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
        },
      });

      const agg = await tx.review.aggregate({
        _avg: { rating: true },
        where: { magazineId },
      });
      const newAvg = agg._avg.rating ?? 0;
      await tx.magazine.update({
        where: { id: magazineId },
        data: { avgRating: Math.round(newAvg * 10) / 10 },
      });
    });

    await ctx.reply('🎉 Спасибо за отзыв! Он поможет другим покупателям.');
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
