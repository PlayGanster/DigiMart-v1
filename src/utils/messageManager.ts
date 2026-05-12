// src/utils/messageManager.ts
import { MyContext } from '../types.js';

/**
 * Универсальная функция для отправки/редактирования сообщения
 * Если есть callbackQuery.message - редактируем, иначе отправляем новое
 */
export async function sendOrEditMessage(
  ctx: MyContext,
  text: string,
  options?: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    reply_markup?: any;
    disable_web_page_preview?: boolean;
  }
) {
  try {
    if (ctx.callbackQuery?.message) {
      // Пытаемся отредактировать существующее сообщение
      await ctx.editMessageText(text, options);
    } else {
      // Отправляем новое сообщение
      await ctx.reply(text, options);
    }
  } catch (error: any) {
    // Если редактирование не удалось (например, сообщение слишком старое), отправляем новое
    if (error.description?.includes('edit') || error.error_code === 400) {
      await ctx.reply(text, options);
    } else {
      throw error;
    }
  }
}

/**
 * Функция для отправки/редактирования с фото
 */
export async function sendOrEditPhoto(
  ctx: MyContext,
  photo: string,
  caption: string,
  options?: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    reply_markup?: any;
  }
) {
  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageMedia(
        { type: 'photo', media: photo, caption, parse_mode: options?.parse_mode },
        { reply_markup: options?.reply_markup }
      );
    } else {
      await ctx.replyWithPhoto(photo, { caption, parse_mode: options?.parse_mode, reply_markup: options?.reply_markup });
    }
  } catch (error: any) {
    if (error.description?.includes('edit') || error.error_code === 400) {
      await ctx.replyWithPhoto(photo, { caption, parse_mode: options?.parse_mode, reply_markup: options?.reply_markup });
    } else {
      throw error;
    }
  }
}

/**
 * Очистить клавиатуру (удалить inline кнопки)
 */
export async function clearInlineKeyboard(ctx: MyContext) {
  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageReplyMarkup(undefined);
    }
  } catch {
    // Игнорируем ошибки
  }
}

/**
 * Удалить сообщение, если возможно
 */
export async function tryDeleteMessage(ctx: MyContext) {
  try {
    if (ctx.callbackQuery?.message) {
      await ctx.deleteMessage();
    }
  } catch {
    // Игнорируем ошибки
  }
}
