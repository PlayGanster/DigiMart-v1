// src/handlers/history.ts
import { InlineKeyboard } from 'grammy';
import { Bot } from 'grammy';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { sendOrEditMessage } from '../utils/messageManager.js';

const HISTORY_PAGE_SIZE = 5;

export async function showPurchaseHistory(ctx: MyContext, page = 1) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({ where: { tgId } });
  if (!user) {
    await ctx.reply('Сначала зарегистрируйтесь через /start.');
    return;
  }

  const total = await prisma.purchase.count({ where: { buyerId: user.id } });
  const totalPages = Math.ceil(total / HISTORY_PAGE_SIZE) || 1;
  const purchases = await prisma.purchase.findMany({
    where: { buyerId: user.id },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
    include: {
      product: { select: { name: true } },
      review: { select: { rating: true, comment: true, isApproved: true } },
    },
  });

  let text = '📜 <b>История покупок</b>\n\n';
  if (purchases.length === 0) {
    text += 'У вас пока нет покупок.';
  } else {
    purchases.forEach((p, idx) => {
      const date = p.createdAt.toLocaleDateString('ru-RU');
      text += `${(page - 1) * HISTORY_PAGE_SIZE + idx + 1}. <b>${
        p.product.name
      }</b>\n`;
      text += `   💰 ${p.priceAtPurchase}₽ | 📅 ${date}\n`;
      if (p.review && p.review.isApproved) {
        text += `   ⭐ ${p.review.rating}/5`;
        if (p.review.comment) text += ` — "${p.review.comment}"`;
        text += '\n';
      } else {
        text += `   (без отзыва)\n`;
      }
      text += '\n';
    });
  }

  const keyboard = new InlineKeyboard();
  if (totalPages > 1) {
    if (page > 1) keyboard.text('⬅️', `history:page_${page - 1}`);
    keyboard.text(`${page}/${totalPages}`, 'history:noop');
    if (page < totalPages) keyboard.text('➡️', `history:page_${page + 1}`);
  }
  
  // Кнопка "Назад в меню"
  keyboard.row().text('🔙 В главное меню', 'menu_main');

  await sendOrEditMessage(ctx, text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export function setupHistoryHandlers(bot: Bot<MyContext>) {
  bot.command('history', async (ctx) => {
    await showPurchaseHistory(ctx);
  });

  bot.callbackQuery(/history:page_(\d+)/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await showPurchaseHistory(ctx, page);
    await ctx.answerCallbackQuery();
  });
  
  bot.callbackQuery('history:noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });
}
