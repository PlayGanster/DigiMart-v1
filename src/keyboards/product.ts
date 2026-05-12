// src/keyboards/product.ts
import { InlineKeyboard } from 'grammy';
import { encodeFilterState, FilterState } from '../utils/filterState.js';

/**
 * Кнопки в карточке товара:
 * - Написать продавцу (запускает флоу покупки)
 * - Назад к каталогу
 */
export function productCardButtons(
  productId: number,
  ownerTgId: bigint,
  backState: FilterState,
): InlineKeyboard {
  return new InlineKeyboard()
    .text(
      '✉️ Написать продавцу',
      `purchase:contact_${productId}:${encodeFilterState(backState)}`,
    )
    .row()
    .text('🔙 Назад', 'catalog:back:' + encodeFilterState(backState));
}
