// src/utils/slug.ts
export function generateSlug(name: string): string {
  // Транслитерация кириллицы (упрощённая)
  const translitMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  let slug = '';
  for (const ch of name.toLowerCase()) {
    slug += translitMap[ch] ?? ch;
  }
  // Заменяем всё, кроме букв, цифр и дефисов, на дефисы
  slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'category'; // fallback
}
