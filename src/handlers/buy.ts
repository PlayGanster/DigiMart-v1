// src/handlers/buy.ts
import { Bot, InlineKeyboard, InputMediaBuilder } from 'grammy';
import { createConversation } from '@grammyjs/conversations';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { productCardButtons } from '../keyboards/product.js';
import {
  decodeFilterState,
  FilterState,
  encodeFilterState,
} from '../utils/filterState.js';

const ITEMS_PER_PAGE = 5;

let categoriesCache: { name: string; slug: string }[] | null = null;

async function getCategories() {
  if (!categoriesCache) {
    categoriesCache = await prisma.category.findMany({
      select: { name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }
  return categoriesCache;
}

/**
 * Основная функция отображения каталога.
 */
export async function showCatalog(ctx: MyContext, state: FilterState) {
  const { page, category_slug, sort, search } = state;

  const where: any = {
    status: 'ACTIVE',
    magazine: { isActive: true },
  };

  if (category_slug) {
    where.category = { slug: category_slug };
  }

  if (search?.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { magazine: { name: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const orderBy: any = sort
    ? { price: sort === 'price_asc' ? 'asc' : 'desc' }
    : { id: 'asc' };

  const [totalCount, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
      include: {
        magazine: {
          select: {
            name: true,
            avgRating: true,
            owner: { select: { tgId: true } },
          },
        },
        category: { select: { name: true, slug: true } },
      },
    }),
  ]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  let text = '🛒 <b>Каталог товаров</b>\n';
  if (search) text += `🔍 Поиск: "${search}"\n`;
  if (category_slug) {
    const cat = (await getCategories()).find((c) => c.slug === category_slug);
    text += `📂 Категория: ${cat?.name || category_slug}\n`;
  }
  text += `📄 Страница ${page} из ${totalPages}\n`;

  const keyboard = new InlineKeyboard();

  // Категории
  const categories = await getCategories();
  categories.forEach((cat) => {
    const isActive = category_slug === cat.slug;
    keyboard.text(
      isActive ? `✅ ${cat.name}` : cat.name,
      'catalog:filter:' +
        encodeFilterState({ ...state, page: 1, category_slug: isActive ? undefined : cat.slug }),
    );
  });
  keyboard.row();

  // Сортировка и сброс
  if (sort === 'price_asc') {
    keyboard.text(
      '🔽 Цена по убыванию',
      'catalog:sort:' + encodeFilterState({ ...state, page: 1, sort: 'price_desc' }),
    );
  } else {
    keyboard.text(
      '🔼 Цена по возрастанию',
      'catalog:sort:' + encodeFilterState({ ...state, page: 1, sort: 'price_asc' }),
    );
  }
  keyboard.text('🔄 Сброс', 'catalog:filter:' + encodeFilterState({ page: 1 }));
  keyboard.row();

  // Поиск
  keyboard.text('🔍 Поиск', 'catalog:search_prompt:' + encodeFilterState(state));
  keyboard.row();

  // Список товаров
  if (products.length === 0) {
    text += '\n❌ Товаров не найдено.';
  } else {
    products.forEach((p) => {
      const rating = p.magazine.avgRating.toFixed(1);
      const price = p.price.toFixed(2);
      const stock = p.stockCount > 0 ? ` (${p.stockCount} шт.)` : ' (нет)';
      text += `\n<b>${p.name}</b> — ${price}₽${stock}\n⭐${rating} · ${p.magazine.name}`;
      keyboard.text(
        p.name,
        'catalog:product:' + encodeFilterState({ ...state, productId: p.id }),
      );
      keyboard.row();
    });
  }

  // Пагинация
  const paginationStart = Math.max(1, page - 2);
  const paginationEnd = Math.min(totalPages, paginationStart + 4);
  if (page > 1) {
    keyboard.text('⬅️', 'catalog:page:' + encodeFilterState({ ...state, page: page - 1 }));
  } else {
    keyboard.text('⬅️', 'catalog:noop');
  }
  for (let i = paginationStart; i <= paginationEnd; i++) {
    const label = i === page ? `·${i}·` : String(i);
    keyboard.text(label, 'catalog:page:' + encodeFilterState({ ...state, page: i }));
  }
  if (page < totalPages) {
    keyboard.text('➡️', 'catalog:page:' + encodeFilterState({ ...state, page: page + 1 }));
  } else {
    keyboard.text('➡️', 'catalog:noop');
  }

  const opts = { reply_markup: keyboard, parse_mode: 'HTML' as const };
  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(text, opts);
    } else {
      await ctx.reply(text, opts);
    }
  } catch {
    await ctx.reply(text, opts);
  }

  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
}

/**
 * Карточка товара
 */
export async function showProductCard(
  ctx: MyContext,
  state: FilterState & { productId: number },
) {
  const product = await prisma.product.findUnique({
    where: { id: state.productId },
    include: {
      magazine: { include: { owner: true } },
      category: true,
    },
  });

  if (!product) {
    await ctx.answerCallbackQuery('Товар не найден');
    return;
  }

  const rating = product.magazine.avgRating.toFixed(1);
  const desc =
    product.description?.substring(0, 200) +
    (product.description && product.description.length > 200 ? '...' : '');

  const text = [
    `<b>${product.name}</b>`,
    `💰 Цена: ${product.price}₽`,
    `📦 Остаток: ${product.stockCount} шт.`,
    `🏪 Магазин: ${product.magazine.name} (⭐${rating})`,
    `🏷️ Категория: ${product.category.name}`,
    desc ? `\n📝 ${desc}` : '',
  ].join('\n');

  const backState: FilterState = {
    page: state.page,
    category_slug: state.category_slug,
    sort: state.sort,
    search: state.search,
  };
  const keyboard = productCardButtons(
    product.id,
    product.magazine.owner.tgId,
    backState,
  );

  const photos = product.photoFileIds;
  if (photos.length === 1) {
    await ctx.replyWithPhoto(photos[0], {
      caption: text,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } else if (photos.length > 1) {
    const media = photos.map((id, idx) =>
      InputMediaBuilder.photo(id, {
        caption: idx === 0 ? text : undefined,
        parse_mode: 'HTML',
      }),
    );
    await ctx.replyWithMediaGroup(media);
    await ctx.reply('Выберите действие:', { reply_markup: keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  await ctx.answerCallbackQuery();
}

// Conversation для поиска
async function searchProductConversation(conversation: any, ctx: MyContext) {
  const state: FilterState = conversation.session.state ?? { page: 1 };
  await ctx.reply('Введите текст для поиска:');
  const response = await conversation.wait();
  const searchText = response.message?.text?.trim() || '';
  state.search = searchText;
  state.page = 1;
  await showCatalog(ctx, state);
}

// Регистрация обработчиков каталога
export function setupBuyHandlers(bot: Bot<MyContext>) {
  bot.command('buy', async (ctx) => {
    await showCatalog(ctx, { page: 1 });
  });

  bot.use(async (ctx, next) => {
    const data = ctx.callbackQuery?.data;
    if (!data?.startsWith('catalog:')) return next();

    const payload = data.slice('catalog:'.length);
    const colonIdx = payload.indexOf(':');
    if (colonIdx === -1) return next();

    const command = payload.substring(0, colonIdx);
    const encoded = payload.substring(colonIdx + 1);

    if (command === 'noop') {
      await ctx.answerCallbackQuery();
      return;
    }

    if (command === 'search_prompt') {
      const state = decodeFilterState(encoded);
      if (!state) return;
      await ctx.answerCallbackQuery();
      await ctx.conversation.enter('searchProduct', { state } as any);
      return;
    }

    const state = decodeFilterState(encoded);
    if (!state) return;

    switch (command) {
      case 'page':
      case 'filter':
      case 'sort':
        await showCatalog(ctx, state);
        break;
      case 'product':
        if (state.productId) {
          await showProductCard(ctx, state as FilterState & { productId: number });
        }
        break;
      case 'back':
        await showCatalog(ctx, state);
        break;
    }
  });

  bot.use(createConversation(searchProductConversation, 'searchProduct'));
}
