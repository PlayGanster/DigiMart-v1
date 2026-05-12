// src/keyboards/main.ts
import { InlineKeyboard } from 'grammy';
import { MyContext } from '../types.js';
import { IS_DEV } from '../config.js';

export function buildMainMenu(ctx: MyContext): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text('🛒 Купить', 'menu_buy')
    .row()
    .text('📜 История', 'menu_history')
    .text('❓ Поддержка', 'menu_support')
    .row();

  const role = ctx.session.userRole;

  if (role === 'SELLER') {
    keyboard.text('⚙️ Настройки магазина', 'menu_shop_settings')
      .text('📦 Мои товары', 'menu_my_products')
      .text('📊 Статистика', 'menu_stats')
      .row();
  }

  if (role === 'ADMIN' || ctx.session.isAdmin) {
    keyboard.text('🔍 Модерация товаров', 'menu_moderation')
      .text('📝 Модерация отзывов', 'menu_review_moderation')
      .row();
  }

  if (IS_DEV) {
    keyboard.text('🔄 Сбросить аккаунт', 'menu_reset_account');
  }

  return keyboard;
}
