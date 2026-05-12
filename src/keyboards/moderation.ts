// src/keyboards/moderation.ts
import { InlineKeyboard } from 'grammy';

export function moderationButtons(productId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Одобрить', `moderate:approve_${productId}`)
    .text('❌ Отклонить', `moderate:reject_${productId}`)
    .row()
    .text('✏️ На правки', `moderate:revise_${productId}`);
}
