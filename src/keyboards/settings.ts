// src/keyboards/settings.ts
import { InlineKeyboard } from 'grammy';

/**
 * Клавиатура настроек магазина
 * @param isActive – текущий статус магазина
 */
export function settingsKeyboard(isActive: boolean): InlineKeyboard {
  const toggleText = isActive ? '⏸ Остановить магазин' : '▶️ Запустить магазин';
  const toggleData = isActive ? 'magazine:toggle_off' : 'magazine:toggle_on';

  return new InlineKeyboard()
    .text(toggleText, toggleData)
    .row()
    .text('✏️ Редактировать инфо', 'magazine:edit_info')
    .row()
    .text('🔙 Назад', 'menu_back'); // вернём в главное меню
}
