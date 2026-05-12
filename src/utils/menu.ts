// src/utils/menu.ts
import { MyContext } from '../types.js';
import { buildMainMenu } from '../keyboards/main.js';
import prisma from '../prisma.js';

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

    if (photoFileId) {
      await ctx.replyWithPhoto(photoFileId, {
        caption: 'Добро пожаловать в DigiMart!',
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply('Добро пожаловать в DigiMart!', { reply_markup: keyboard });
    }
  } catch {
    await ctx.reply('Добро пожаловать в DigiMart!', { reply_markup: keyboard });
  }
}
