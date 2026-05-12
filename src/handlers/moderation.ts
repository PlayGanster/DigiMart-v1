// src/handlers/moderation.ts
import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';

/**
 * Показать список товаров на модерации
 */
export async function showModerationList(ctx: MyContext) {
  if (!ctx.session.isAdmin && ctx.session.userRole !== 'ADMIN') {
    await ctx.reply('⛔ Доступ запрещён.');
    return;
  }

  const pendingProducts = await prisma.product.findMany({
    where: { status: 'PENDING' },
    include: { magazine: { include: { owner: true } }, category: true },
    orderBy: { id: 'desc' },
    take: 20, // ограничим вывод
  });

  if (pendingProducts.length === 0) {
    await ctx.reply('✅ Нет товаров, ожидающих модерации.');
    return;
  }

  const text = pendingProducts
    .map(
      (p) =>
        `📦 <b>${p.name}</b> (#${p.id})\n` +
        `💰 ${p.price}₽ | 📂 ${p.category?.name || '—'}\n` +
        `🏪 ${p.magazine?.name || '—'} (ID: ${p.magazineId})\n`,
    )
    .join('\n');

  const keyboard = new InlineKeyboard();
  pendingProducts.forEach((p) => {
    keyboard
      .text(`✅ ${p.name}`, `moderate:approve_${p.id}`)
      .text(`❌`, `moderate:reject_${p.id}`)
      .row();
  });

  await ctx.reply(
    '🛡 <b>Товары на модерации:</b>\n\n' + text,
    { parse_mode: 'HTML', reply_markup: keyboard },
  );
}

/**
 * Обработчики кнопок модерации (approve/reject)
 */
export function setupModerationHandlers(bot: Bot<MyContext>) {
  bot.command('moderation', async (ctx) => {
    await showModerationList(ctx);
  });

  // Middleware для moderate: колбэков с next
  bot.use(async (ctx, next) => {
    const data = ctx.callbackQuery?.data;
    if (!data?.startsWith('moderate:')) return next();

    if (!ctx.session.isAdmin && ctx.session.userRole !== 'ADMIN') {
      await ctx.answerCallbackQuery('⛔ Недостаточно прав.');
      return;
    }

    const payload = data.slice('moderate:'.length);
    const [action, rawId] = payload.split('_');
    const productId = Number(rawId);
    if (isNaN(productId)) {
      await ctx.answerCallbackQuery('Неверный ID.');
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { magazine: { include: { owner: true } } },
    });
    if (!product || !product.magazine?.owner) {
      await ctx.answerCallbackQuery('Товар или владелец не найден.');
      return;
    }

    const ownerTgId = product.magazine.owner.tgId;

    try {
      if (action === 'approve') {
        await prisma.product.update({ where: { id: productId }, data: { status: 'ACTIVE' } });
        await ctx.api.sendMessage(Number(ownerTgId), `✅ Ваш товар «${product.name}» одобрен.`);
        await ctx.editMessageText(`✅ Товар #${product.id} одобрен.\n${product.name}\nЦена: ${product.price}₽`);
      } else if (action === 'reject') {
        await prisma.product.update({ where: { id: productId }, data: { status: 'REJECTED' } });
        await ctx.api.sendMessage(Number(ownerTgId), `❌ Ваш товар «${product.name}» отклонён.`);
        await ctx.editMessageText(`❌ Товар #${product.id} отклонён.\n${product.name}\nЦена: ${product.price}₽`);
      }
      await showModerationList(ctx); // обновляем список
    } catch (e) {
      console.error('Ошибка модерации:', e);
      await ctx.answerCallbackQuery('Ошибка.');
    }
  });
}
