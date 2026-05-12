// src/fsm/product.ts
import { Conversation } from '@grammyjs/conversations';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { categoryPicker, confirmProductKeyboard } from '../keyboards/product_edit.js';
import { ADMIN_IDS } from '../config.js';
import { generateSlug } from '../utils/slug.js';
import { InlineKeyboard } from 'grammy';

type MyConversation = Conversation<MyContext>;

const TIMEOUT_MS = 10 * 60 * 1000;

export async function addProductConversation(conversation: MyConversation, ctx: MyContext) {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const user = await prisma.user.findUnique({
    where: { tgId },
    include: { magazine: true },
  });
  if (!user?.magazine) {
    await ctx.reply('Сначала создайте магазин.');
    return;
  }
  const magazineId = user.magazine.id;

  // Шаг 1: Название
  await ctx.reply('Введите название товара (3–100 символов):');
  let nameCtx: any;
  try { nameCtx = await conversation.wait({ maxMilliseconds: TIMEOUT_MS }); }
  catch { await ctx.reply('⏰ Время вышло.'); return; }
  const name = nameCtx.message?.text?.trim();
  if (!name || name.length < 3 || name.length > 100) {
    await ctx.reply('❌ Неверная длина названия.');
    return;
  }

  // Шаг 2: Описание
  await ctx.reply('Описание (до 1000 символов, /skip):');
  let descCtx: any;
  try { descCtx = await conversation.wait({ maxMilliseconds: TIMEOUT_MS }); }
  catch { await ctx.reply('⏰ Время вышло.'); return; }
  let description: string | null = null;
  if (descCtx.message?.text && descCtx.message.text !== '/skip') {
    const desc = descCtx.message.text.trim();
    if (desc.length > 1000) { await ctx.reply('❌ Слишком длинное описание.'); return; }
    description = desc;
  }

  // Шаг 3: Цена
  await ctx.reply('Цена (положительное число, до 2 знаков):');
  let priceCtx: any;
  try { priceCtx = await conversation.wait({ maxMilliseconds: TIMEOUT_MS }); }
  catch { await ctx.reply('⏰ Время вышло.'); return; }
  const priceStr = priceCtx.message?.text?.trim();
  if (!priceStr || isNaN(Number(priceStr)) || Number(priceStr) <= 0) {
    await ctx.reply('❌ Некорректная цена.'); return;
  }
  const price = parseFloat(parseFloat(priceStr).toFixed(2));
  if ((priceStr.split('.')[1] || '').length > 2) {
    await ctx.reply('❌ Не более двух знаков после запятой.'); return;
  }

  // Шаг 4: Фото
  await ctx.reply(
    'Отправьте фото товара (до 5 шт.). По одному, затем любой текст или /skip.'
  );
  const photoIds: string[] = [];
  let donePhotos = false;
  while (!donePhotos) {
    let photoMsg: any;
    try { photoMsg = await conversation.wait({ maxMilliseconds: TIMEOUT_MS }); }
    catch { await ctx.reply('⏰ Время вышло.'); break; }
    // Проверяем, что это фото и массив не пуст
    if (photoMsg.message?.photo && photoMsg.message.photo.length > 0) {
      const lastPhoto = photoMsg.message.photo[photoMsg.message.photo.length - 1];
      if (lastPhoto?.file_id) {
        photoIds.push(lastPhoto.file_id);
        await ctx.reply(`Фото ${photoIds.length} добавлено.`);
        if (photoIds.length >= 5) {
          await ctx.reply('Достигнут максимум (5 фото).');
          donePhotos = true;
        }
      } else {
        await ctx.reply('Не удалось обработать фото, попробуйте ещё раз.');
      }
    } else {
      // любое сообщение без фото или текст /skip завершает приём
      donePhotos = true;
    }
  }

  // Шаг 5: Категория (с возможностью создания новой)
  let categoryId: number | null = null;
  let catKeyboard = await categoryPicker();
  await ctx.reply('Выберите категорию или создайте новую:', { reply_markup: catKeyboard });

  while (categoryId === null) {
    let catCtx: any;
    try {
      catCtx = await conversation.waitForCallbackQuery(
        /^add_product:(cat_\d+|new_category)$/,
        { maxMilliseconds: TIMEOUT_MS },
      );
    } catch {
      await ctx.reply('⏰ Время вышло.'); return;
    }

    const data = catCtx.callbackQuery.data;
    if (data.startsWith('add_product:cat_')) {
      const idFromData = Number(data.split('_').pop());
      if (isNaN(idFromData)) {
        await catCtx.answerCallbackQuery('Ошибка в данных категории.');
        continue;
      }
      // Проверяем существование категории в БД
      const catExists = await prisma.category.findUnique({ where: { id: idFromData } });
      if (!catExists) {
        await catCtx.answerCallbackQuery('Категория не найдена, выберите другую.');
        catKeyboard = await categoryPicker();
        await ctx.reply('Выберите категорию заново:', { reply_markup: catKeyboard });
        continue;
      }
      categoryId = idFromData;
      await catCtx.answerCallbackQuery('Категория выбрана');
    } else if (data === 'add_product:new_category') {
      await catCtx.answerCallbackQuery();
      await ctx.reply('Введите название новой категории (3–50 символов):');

      let newCatCtx: any;
      try { newCatCtx = await conversation.wait({ maxMilliseconds: 120000 }); }
      catch { await ctx.reply('⏰ Превышен лимит ожидания.'); return; }

      const catName = newCatCtx.message?.text?.trim();
      if (!catName || catName.length < 3 || catName.length > 50) {
        await ctx.reply('❌ Название должно быть от 3 до 50 символов.');
        continue;
      }

      let slug = generateSlug(catName);
      let existingSlug = await prisma.category.findUnique({ where: { slug } });
      let suffix = 1;
      while (existingSlug) {
        slug = generateSlug(catName) + '-' + suffix;
        suffix++;
        existingSlug = await prisma.category.findUnique({ where: { slug } });
      }

      try {
        await prisma.category.create({ data: { name: catName, slug } });
        await ctx.reply(`✅ Категория «${catName}» создана.`);
        catKeyboard = await categoryPicker();
        await ctx.reply('Теперь выберите категорию из списка:', { reply_markup: catKeyboard });
      } catch (err) {
        console.error('Ошибка создания категории:', err);
        await ctx.reply('❌ Не удалось создать категорию. Попробуйте другое название.');
      }
    }
  }

  // Шаг 6: Остаток
  await ctx.reply('Количество на складе (целое ≥ 0):');
  let stockCtx: any;
  try { stockCtx = await conversation.wait({ maxMilliseconds: TIMEOUT_MS }); }
  catch { await ctx.reply('⏰ Время вышло.'); return; }
  const stockStr = stockCtx.message?.text?.trim();
  const stockCount = parseInt(stockStr, 10);
  if (isNaN(stockCount) || stockCount < 0 || !Number.isInteger(stockCount)) {
    await ctx.reply('❌ Некорректное число.'); return;
  }

  // Шаг 7: Подтверждение
  const cat = await prisma.category.findUnique({ where: { id: categoryId! } });
  const summary = [
    '📋 **Подтверждение товара:**',
    `Название: ${name}`,
    `Описание: ${description || '—'}`,
    `Цена: ${price.toFixed(2)}₽`,
    `Фото: ${photoIds.length} шт.`,
    `Категория: ${cat?.name || '—'}`,
    `Остаток: ${stockCount}`,
  ].join('\n');

  await ctx.reply(summary, { parse_mode: 'Markdown', reply_markup: confirmProductKeyboard() });
  let confirmCtx: any;
  try {
    confirmCtx = await conversation.waitForCallbackQuery(
      ['add_product:confirm', 'add_product:cancel'],
      { maxMilliseconds: TIMEOUT_MS },
    );
  } catch {
    await ctx.reply('⏰ Время вышло.'); return;
  }
  if (confirmCtx.callbackQuery.data === 'add_product:cancel') {
    await confirmCtx.editMessageText('Создание товара отменено.');
    return;
  }

  // Сохранение
  try {
    const product = await prisma.product.create({
      data: {
        magazineId,
        categoryId: categoryId!,
        name,
        description,
        price,
        stockCount,
        photoFileIds: photoIds,
        status: 'PENDING',
      },
    });

    const adminText = `🛑 Новый товар на модерации:\n\n📦 <b>${product.name}</b>\n💰 ${product.price}₽\n🏪 Магазин ID: ${magazineId}\n#ID: ${product.id}`;
    const adminKeyboard = new InlineKeyboard()
      .text('✅ Одобрить', `moderate:approve_${product.id}`)
      .text('❌ Отклонить', `moderate:reject_${product.id}`);

    for (const adminId of ADMIN_IDS) {
      try {
        await ctx.api.sendMessage(adminId, adminText, {
          parse_mode: 'HTML',
          reply_markup: adminKeyboard,
        });
      } catch (e) {
        console.error(`Не удалось уведомить админа ${adminId}:`, e);
      }
    }

    await confirmCtx.editMessageText('✅ Товар отправлен на модерацию. Статус можно проверить в /my_products.');
  } catch (error) {
    console.error('Ошибка сохранения товара:', error);
    await confirmCtx.editMessageText('Произошла ошибка при сохранении.');
  }
}
