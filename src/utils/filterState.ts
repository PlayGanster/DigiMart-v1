// src/utils/filterState.ts
export interface FilterState {
  page: number;
  category_slug?: string;
  sort?: 'price_asc' | 'price_desc';
  search?: string;
  productId?: number; // используется только в callback'ах продукта
}

export function encodeFilterState(state: FilterState): string {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

export function decodeFilterState(data: string): FilterState | null {
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}
