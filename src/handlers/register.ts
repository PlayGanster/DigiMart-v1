// src/handlers/register.ts
import { Bot } from 'grammy';
import { languageKeyboard, roleKeyboard } from '../keyboards/register.js';
import { MyContext } from '../types.js';
import prisma from '../prisma.js';
import { ADMIN_IDS } from '../config.js';
import { sendMainMenu } from '../utils/menu.js';

export function setupRegisterHandlers(bot: Bot<MyContext>) {
  bot.command('start', async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) return ctx.reply('Ошибка.');

    const existingUser = await prisma.user.findUnique({ where: { tgId } });
    if (existingUser) {
      ctx.session.userRole = existingUser.role;
      ctx.session.isAdmin = ADMIN_IDS.includes(ctx.from?.id ?? 0) || existingUser.role === 'ADMIN';
      await sendMainMenu(ctx);
      return;
    }

    // Новичок – выбор языка (отправляем новым сообщением)
    await ctx.reply('Привет! Я DigiMart. Выберите язык:', { reply_markup: languageKeyboard });
  });

  bot.callbackQuery('lang_ru', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Всегда отвечаем новым сообщением, чтобы точно сработало
    await ctx.reply('Язык: Русский. Теперь выберите роль:', { reply_markup: roleKeyboard });
  });

  bot.callbackQuery('role_user', async (ctx) => {
    const tgId = ctx.from?.id;
    if (!tgId) {
      await ctx.answerCallbackQuery('Ошибка идентификации.');
      return;
    }
    await ctx.answerCallbackQuery();

    try {
      await prisma.user.upsert({
        where: { tgId },
        update: { username: ctx.from?.username ?? null, role: 'USER' },
        create: { tgId, username: ctx.from?.username ?? null, role: 'USER' },
      });

      ctx.session.userRole = 'USER';
      ctx.session.isAdmin = ADMIN_IDS.includes(ctx.from.id);

      await sendMainMenu(ctx);
    } catch (error) {
      console.error('Ошибка регистрации покупателя:', error);
      await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
  });

  bot.callbackQuery('role_seller', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Отправляем сообщение о запуске регистрации
    await ctx.reply('Запуск регистрации магазина...');
    await ctx.conversation.enter('sellerRegistration');
  });
}
