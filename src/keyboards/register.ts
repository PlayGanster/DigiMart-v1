import { InlineKeyboard } from 'grammy';

export const languageKeyboard = new InlineKeyboard()
  .text('🇷🇺 Русский', 'lang_ru');

export const roleKeyboard = new InlineKeyboard()
  .text('👤 Покупатель', 'role_user')
  .text('🏪 Продавец', 'role_seller');
