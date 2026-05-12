// src/keyboards/product_edit.ts
import { InlineKeyboard } from 'grammy';
import prisma from '../prisma.js';

/**
 * Клавиатура для выбора категории, включая кнопку создания новой.
 */
export async function categoryPicker() {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const keyboard = new InlineKeyboard();
  categories.forEach((cat, idx) => {
    keyboard.text(cat.name, `add_product:cat_${cat.id}`);
    if (idx % 2 === 1) keyboard.row();
  });
  // Кнопка создания новой категории
  keyboard.row().text('➕ Создать категорию', 'add_product:new_category');
  return keyboard;
}

/**
 * Кнопки подтверждения публикации
 */
export function confirmProductKeyboard() {
  return new InlineKeyboard()
    .text('✅ Опубликовать', 'add_product:confirm')
    .text('❌ Отменить', 'add_product:cancel');
}
