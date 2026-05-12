// src/handlers/statistics.ts
import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { sendOrEditMessage } from '../utils/messageManager.js';

// Простой кэш: Map<magazineId, { data, timestamp }>
const statsCache = new Map<number, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

/**
 * Собрать статистику магазина (с кэшированием)
 */
async function getMagazineStatistics(magazineId: number) {
  const now = Date.now();
  const cached = statsCache.get(magazineId);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Свежий запрос
  const [salesCount, revenueAgg, magazine, topProducts] = await Promise.all([
    prisma.purchase.count({
      where: { magazineId, status: 'DELIVERED' },
    }),
    prisma.purchase.aggregate({
      _sum: { priceAtPurchase: true },
      where: { magazineId, status: 'DELIVERED' },
    }),
    prisma.magazine.findUnique({
      where: { id: magazineId },
      select: { avgRating: true },
    }),
    prisma.product.findMany({
      where: { magazineId },
      select: {
        id: true,
        name: true,
        _count: { select: { purchases: true } },
      },
      orderBy: { purchases: { _count: 'desc' } },
      take: 3,
    }),
  ]);

  const data = {
    salesCount,
    revenue: revenueAgg._sum.priceAtPurchase ?? 0,
    avgRating: magazine?.avgRating ?? 0,
    topProducts: topProducts.map((p: any) => ({
      name: p.name,
      sales: p._count.purchases,
    })),
  };

  statsCache.set(magazineId, { data, timestamp: now });
  return data;
}

/**
 * Показать статистику продавцу
 */
export async function showStatistics(ctx: MyContext) {
  if (ctx.session.userRole !== 'SELLER') {
    await ctx.reply('Эта функция доступна только продавцам.');
    return;
  }

  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { tgId },
    include: { magazine: true },
  });
  if (!user?.magazine) {
    await ctx.reply('У вас ещё нет магазина.');
    return;
  }

  const stats = await getMagazineStatistics(user.magazine.id);

  let text = '📊 <b>Статистика магазина</b>\n\n';
  text += `📦 Продаж: <b>${stats.salesCount}</b>\n`;
  text += `💰 Выручка: <b>${stats.revenue.toFixed(2)}₽</b>\n`;
  text += `⭐ Рейтинг: <b>${stats.avgRating.toFixed(1)}/5</b>\n`;

  if (stats.topProducts.length > 0) {
    text += '🏆 <b>Топ-3 товара:</b>\n';
    stats.topProducts.forEach((tp: any, idx: number) => {
      text += `  ${idx + 1}. ${tp.name} — ${tp.sales} продаж\n`;
    });
  } else {
    text += '\nПока нет данных о продажах.';
  }

  const keyboard = new InlineKeyboard().text('🔙 В главное меню', 'menu_main');
  await sendOrEditMessage(ctx, text, { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Регистрация обработчиков статистики
 */
export function setupStatisticsHandlers(bot: Bot<MyContext>) {
  bot.command('stats', showStatistics);
}
