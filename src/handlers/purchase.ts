// src/handlers/purchase.ts
import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { decodeFilterState, FilterState, encodeFilterState } from '../utils/filterState.js';

async function contactSellerHandler(
  ctx: MyContext,
  productId: number,
  backState: FilterState,
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { magazine: { include: { owner: true } } },
  });
  if (!product || !product.magazine) {
    await ctx.answerCallbackQuery('Товар не найден.');
    return;
  }

  const username = product.magazine.owner?.username
    ? '@' + product.magazine.owner.username
    : 'продавцом';

  const keyboard = new InlineKeyboard()
    .text(
      '✅ Да, я купил',
      `purchase:confirm_${productId}:${encodeFilterState(backState)}`,
    )
    .text(
      '❌ Нет, отмена',
      `purchase:cancel_${productId}:${encodeFilterState(backState)}`,
    );

  await ctx.reply(
    `Вы хотите связаться с магазином ${username}?\nТовар: <b>${product.name}</b>`,
    { parse_mode: 'HTML', reply_markup: keyboard },
  );
  await ctx.answerCallbackQuery();
}

async function confirmPurchase(
  ctx: MyContext,
  productId: number,
  backState: FilterState,
) {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  await ctx.answerCallbackQuery();

  const user = await prisma.user.findUnique({ where: { tgId } });
  if (!user) {
    await ctx.reply('Сначала зарегистрируйтесь через /start.');
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { magazine: true },
  });
  if (!product?.magazine) {
    await ctx.reply('Товар или магазин не найден.');
    return;
  }

  let purchase;
  try {
    purchase = await prisma.purchase.create({
      data: {
        buyerId: user.id,
        productId: product.id,
        magazineId: product.magazineId,
        priceAtPurchase: product.price,
        status: 'DELIVERED',
      },
    });
  } catch (e) {
    console.error('Ошибка создания покупки:', e);
    await ctx.reply('Не удалось зафиксировать покупку. Попробуйте позже.');
    return;
  }

  ctx.session.reviewData = {
    purchaseId: purchase.id,
    productId: product.id,
    magazineId: product.magazineId,
    productName: product.name,
    magazineName: product.magazine.name,
    ownerTgId: product.magazine.ownerId,
  };

  await ctx.conversation.enter('leaveReview');
}

async function cancelPurchaseFlow(
  ctx: MyContext,
  productId: number,
  backState: FilterState,
) {
  await ctx.answerCallbackQuery();
  const { showProductCard } = await import('./buy.js');
  await showProductCard(ctx, { ...backState, productId } as any);
}

export function setupPurchaseHandlers(bot: Bot<MyContext>) {
  bot.callbackQuery(/purchase:contact_(\d+):(.+)/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    const encodedState = ctx.match[2];
    const backState = decodeFilterState(encodedState) || { page: 1 };
    await contactSellerHandler(ctx, productId, backState);
  });

  bot.callbackQuery(/purchase:confirm_(\d+):(.+)/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    const encodedState = ctx.match[2];
    const backState = decodeFilterState(encodedState) || { page: 1 };
    await confirmPurchase(ctx, productId, backState);
  });

  bot.callbackQuery(/purchase:cancel_(\d+):(.+)/, async (ctx) => {
    const productId = Number(ctx.match[1]);
    const encodedState = ctx.match[2];
    const backState = decodeFilterState(encodedState) || { page: 1 };
    await cancelPurchaseFlow(ctx, productId, backState);
  });
}
