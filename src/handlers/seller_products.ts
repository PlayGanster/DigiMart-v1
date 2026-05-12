// src/handlers/seller_products.ts
import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types.js';
import { addProductConversation } from '../fsm/product.js';
import prisma from '../prisma.js';

// Показ списка товаров продавца
export async function showMyProducts(ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId || ctx.session.userRole !== 'SELLER') {
    await ctx.reply('Эта функция доступна только продавцам.');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { tgId: userId },
    include: { magazine: true },
  });

  if (!user?.magazine) {
    await ctx.reply('У вас ещё нет магазина.');
    return;
  }

  const products = await prisma.product.findMany({
    where: { magazineId: user.magazine.id },
    orderBy: { id: 'desc' },
    take: 10, // первые 10, без пагинации пока
  });

  if (products.length === 0) {
    await ctx.reply('У вас пока нет товаров. Добавьте первый через /add_product');
    return;
  }

  let text = '📦 <b>Ваши товары:</b>\n\n';
  products.forEach((p, idx) => {
    const statusEmoji = {
      PENDING: '🟡',
      ACTIVE: '🟢',
      MODERATION: '🔵',
      REJECTED: '🔴',
      DRAFT: '⚪',
      DELETED: '⚫',
    }[p.status] || '❓';
    text += `${idx + 1}. ${statusEmoji} <b>${p.name}</b> — ${p.price}₽ (${p.stockCount} шт.)\n`;
  });

  const keyboard = new InlineKeyboard().text('➕ Добавить товар', 'go_add_product');
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export function setupSellerProductHandlers(bot: Bot<MyContext>) {
  // Команда /add_product
  bot.command('add_product', async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (ctx.session.userRole !== 'SELLER') {
      await ctx.reply('Только продавцы могут добавлять товары.');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { tgId: userId },
      include: { magazine: true },
    });
    if (!user?.magazine) {
      await ctx.reply('Сначала создайте магазин через /start.');
      return;
    }

    await ctx.conversation.enter('addProduct');
  });

  // Команда /my_products
  bot.command('my_products', async (ctx) => {
    await showMyProducts(ctx);
  });

  // Коллбэк из меню "Мои товары"
  bot.callbackQuery('menu_my_products', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMyProducts(ctx);
  });

  // Коллбэк "Добавить товар" (из списка товаров)
  bot.callbackQuery('go_add_product', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('addProduct');
  });
}
