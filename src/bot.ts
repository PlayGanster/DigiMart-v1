// src/bot.ts (замена обработчика callback_query:data)
import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { BOT_TOKEN, NEKORAY_PORT, ADMIN_IDS } from './config.js';
import prisma from './prisma.js';
import { MyContext, SessionData } from './types.js';
import { addProductConversation } from './fsm/product.js';
import { sellerRegistration } from './fsm/register.js';
import { setupRegisterHandlers } from './handlers/register.js';
import { setupBuyHandlers } from './handlers/buy.js';
import { setupSellerProductHandlers } from './handlers/seller_products.js';
import { setupModerationHandlers } from './handlers/moderation.js';
import { sendMainMenu } from './utils/menu.js';
import { setupPurchaseHandlers } from './handlers/purchase.js';
import { leaveReviewConversation } from './handlers/review.js';
import { setupHistoryHandlers } from './handlers/history.js';
import { moderationReasonConversation } from './handlers/admin.js';
import { setupMagazineSettingsHandlers, editMagazineConversation } from './handlers/magazine_settings.js';
import { setupStatisticsHandlers } from './handlers/statistics.js';
import { setupReviewModerationHandlers } from './handlers/reviewModeration.js';
import {
  buyHandler,
  historyHandler,
  supportHandler,
  shopSettingsHandler,
  myProductsHandler,
  statsHandler,
  moderationHandler,
  resetAccountHandler,
} from './handlers/menu.js';

const agent = new SocksProxyAgent(`socks5://127.0.0.1:${NEKORAY_PORT}`);
agent.keepAlive = true;

const bot = new Bot<MyContext>(BOT_TOKEN, {
  client: {
    baseFetchConfig: {
      agent: () => agent,
      timeoutSeconds: 30,
    },
  },
});

bot.use(session({ initial: (): SessionData => ({}) }));
bot.use(conversations());
bot.use(createConversation(sellerRegistration, 'sellerRegistration'));
bot.use(createConversation(addProductConversation, 'addProduct'));
bot.use(createConversation(moderationReasonConversation, 'moderationReason'));
bot.use(createConversation(leaveReviewConversation, 'leaveReview'));
bot.use(createConversation(editMagazineConversation, 'editMagazine'));
setupPurchaseHandlers(bot);
setupHistoryHandlers(bot);
setupMagazineSettingsHandlers(bot);
setupStatisticsHandlers(bot);
setupReviewModerationHandlers(bot);

bot.use(async (ctx, next) => {
  const now = new Date().toISOString();
  if (ctx.message) {
    console.log(`[${now}] Message from ${ctx.from?.id}: ${ctx.message.text ?? 'non-text'}`);
  } else if (ctx.callbackQuery) {
    console.log(`[${now}] Callback from ${ctx.from?.id}: ${ctx.callbackQuery.data}`);
  } else {
    console.log(`[${now}] Update type: ${Object.keys(ctx.update)[0]}`);
  }
  await next();
});

// Автозаполнение сессии
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (userId && (!ctx.session.userRole || ctx.session.isAdmin === undefined)) {
    const user = await prisma.user.findUnique({ where: { tgId: userId } });
    if (user) {
      ctx.session.userRole = user.role;
      ctx.session.isAdmin = ADMIN_IDS.includes(userId) || user.role === 'ADMIN';
    }
  }
  await next();
});

// Обработчик ошибок
bot.catch(async (err) => {
  const ctx = err.ctx;
  console.error(`[${new Date().toISOString()}] Error for ${ctx.from?.id}:`, err.error);
  if (ctx.chat) {
    try { await ctx.reply('Произошла ошибка. Попробуйте позже.'); } catch {}
  }
});

// ---------- Обработка callback_query (главное меню + передача дальше) ----------
bot.use(async (ctx, next) => {
  const data = ctx.callbackQuery?.data;
  if (!data) return next();

  // Сначала обрабатываем главное меню (menu_*)
  switch (data) {
    case 'menu_buy': return buyHandler(ctx);
    case 'menu_history': return historyHandler(ctx);
    case 'menu_support': return supportHandler(ctx);
    case 'menu_shop_settings': return shopSettingsHandler(ctx);
    case 'menu_my_products': return myProductsHandler(ctx);
    case 'menu_stats': return statsHandler(ctx);
    case 'menu_moderation': return moderationHandler(ctx);
    case 'menu_reset_account': return resetAccountHandler(ctx);
  }

  // Все остальные колбэки (catalog:*, moderate:*, go_add_product и др.)
  // передаём следующим middleware/обработчикам
  return next();
});

// Регистрируем обработчики разделов
setupRegisterHandlers(bot);
setupBuyHandlers(bot);            // каталог (catalog:*)
setupSellerProductHandlers(bot);  // товары продавца
setupModerationHandlers(bot);     // модерация (moderate:*)

bot.command('help', async (ctx) => {
  await ctx.reply('DigiMart — маркетплейс цифровых товаров.');
});
bot.command('menu', async (ctx) => {
  await sendMainMenu(ctx);
});

export default bot;
