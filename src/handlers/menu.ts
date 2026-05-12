// src/handlers/menu.ts
import { Bot } from 'grammy';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { sendMainMenu } from '../utils/menu.js';
import { showCatalog } from './buy.js';
import { showMyProducts } from './seller_products.js';
import { showModerationList } from './moderation.js';
import { showModerationQueue } from './admin.js';
import { showPurchaseHistory } from './history.js';
import { showSettings } from './magazine_settings.js';
import { showStatistics } from './statistics.js';

export const buyHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  await showCatalog(ctx, { page: 1 });
};

export const historyHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  await showPurchaseHistory(ctx);
};

export const supportHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('❓ Поддержка: @digimartsupport');
};

export const shopSettingsHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  await showSettings(ctx);
};

export const myProductsHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  await showMyProducts(ctx)
};

export const statsHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  await showStatistics(ctx);
};

export const moderationHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  await showModerationQueue(ctx, 1);
};

export const reviewModerationHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  // Импортируем функцию showReviewQueue из reviewModeration.ts
  const { showReviewQueue } = await import('./reviewModeration.js');
  await showReviewQueue(ctx, 1);
};

export const mainMenuHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  const { sendMainMenu } = await import('../utils/menu.js');
  await sendMainMenu(ctx);
};

export const resetAccountHandler = async (ctx: MyContext) => {
  await ctx.answerCallbackQuery();
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const user = await prisma.user.findUnique({ where: { tgId: userId } });
    if (!user) {
      await ctx.reply('Аккаунт не найден.');
      return;
    }

    // Полное удаление пользователя и всех связанных данных (Cascade)
    await prisma.user.delete({ where: { id: user.id } });

    // Очистка сессии
    ctx.session.userRole = undefined;
    ctx.session.isAdmin = false;

    await ctx.reply(
      '🗑 Аккаунт полностью удалён. Введите /start, чтобы начать регистрацию заново.',
      { reply_markup: { remove_keyboard: true } }
    );
  } catch (error) {
    console.error('Ошибка удаления аккаунта:', error);
    await ctx.reply('Ошибка при удалении аккаунта.');
  }
};

export function setupMenuHandlers(bot: Bot<MyContext>) {
  bot.callbackQuery('menu_buy', buyHandler);
  bot.callbackQuery('menu_history', historyHandler);
  bot.callbackQuery('menu_support', supportHandler);
  bot.callbackQuery('menu_shop_settings', shopSettingsHandler);
  bot.callbackQuery('menu_my_products', myProductsHandler);
  bot.callbackQuery('menu_stats', statsHandler);
  bot.callbackQuery('menu_moderation', moderationHandler);
  bot.callbackQuery('menu_review_moderation', reviewModerationHandler);
  bot.callbackQuery('menu_main', mainMenuHandler);
  bot.callbackQuery('menu_reset_account', resetAccountHandler);
}
