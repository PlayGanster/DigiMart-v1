// src/utils/menu.ts
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { buildMainMenu } from '../keyboards/main.js';

/**
 * Отправляет или редактирует главное меню
 * Использует редактирование сообщения для избежания спама
 */
export async function sendMainMenu(ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const keyboard = buildMainMenu(ctx);

  try {
    const user = await prisma.user.findUnique({
      where: { tgId: userId },
      include: { magazine: true },
    });
    const photoFileId = user?.magazine?.photoFileId;
    const text = '👋 Добро пожаловать в DigiMart!\n\nВыберите действие:';

    // Пытаемся отредактировать текущее сообщение
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } else {
      // Отправляем новое сообщение
      if (photoFileId) {
        await ctx.replyWithPhoto(photoFileId, { caption: text, reply_markup: keyboard });
      } else {
        await ctx.reply(text, { reply_markup: keyboard });
      }
    }
  } catch {
    // Если редактирование не удалось, отправляем новое
    const user = await prisma.user.findUnique({
      where: { tgId: userId },
      include: { magazine: true },
    });
    const photoFileId = user?.magazine?.photoFileId;
    const text = '👋 Добро пожаловать в DigiMart!\n\nВыберите действие:';

    if (photoFileId) {
      await ctx.replyWithPhoto(photoFileId, { caption: text, reply_markup: keyboard });
    } else {
      await ctx.reply(text, { reply_markup: keyboard });
    }
  }
}
