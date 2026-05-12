// src/handlers/seller_products.ts
import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types.js';
import { addProductConversation } from '../fsm/product.js';
import prisma from '../prisma.js';
import { sendOrEditMessage } from '../utils/messageManager.js';

const PRODUCTS_PAGE_SIZE = 10;

// Показ списка товаров продавца с пагинацией
export async function showMyProducts(ctx: MyContext, page = 1) {
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

  const total = await prisma.product.count({
    where: { magazineId: user.magazine.id },
  });
  const totalPages = Math.ceil(total / PRODUCTS_PAGE_SIZE) || 1;
  
  const products = await prisma.product.findMany({
    where: { magazineId: user.magazine.id },
    orderBy: { id: 'desc' },
    skip: (page - 1) * PRODUCTS_PAGE_SIZE,
    take: PRODUCTS_PAGE_SIZE,
  });

  if (products.length === 0 && page === 1) {
    await ctx.reply('У вас пока нет товаров. Добавьте первый через /add_product');
    return;
  }

  let text = '📦 <b>Ваши товары</b>\n\n';
  if (products.length === 0) {
    text += 'На этой странице товаров нет.';
  } else {
    products.forEach((p, idx) => {
      const statusEmoji = {
        PENDING: '🟡',
        ACTIVE: '🟢',
        MODERATION: '🔵',
        REJECTED: '🔴',
        DRAFT: '⚪',
        DELETED: '⚫',
      }[p.status] || '❓';
      text += `${(page - 1) * PRODUCTS_PAGE_SIZE + idx + 1}. ${statusEmoji} <b>${p.name}</b> — ${p.price}₽ (${p.stockCount} шт.)\n`;
    });
  }

  const keyboard = new InlineKeyboard();
  
  // Пагинация
  if (totalPages > 1) {
    if (page > 1) keyboard.text('⬅️', `my_products:page_${page - 1}`);
    keyboard.text(`${page}/${totalPages}`, 'my_products:noop');
    if (page < totalPages) keyboard.text('➡️', `my_products:page_${page + 1}`);
    keyboard.row();
  }
  
  keyboard.text('➕ Добавить товар', 'go_add_product');
  keyboard.row().text('🔙 В главное меню', 'menu_back');
  
  await sendOrEditMessage(ctx, text, { parse_mode: 'HTML', reply_markup: keyboard });
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
  
  // Пагинация товаров
  bot.callbackQuery(/my_products:page_(\d+)/, async (ctx) => {
    const page = Number(ctx.match[1]);
    await showMyProducts(ctx, page);
    await ctx.answerCallbackQuery();
  });
  
  bot.callbackQuery('my_products:noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });
}
