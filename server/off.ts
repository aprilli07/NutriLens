/**
 * Live Open Food Facts lookup, used when a scanned barcode is newer than our imported snapshot.
 */
import type { Product } from '../lib/types';
import { offApiToProduct } from './products';

const FIELDS = [
  'code', 'product_name', 'product_name_en', 'brands', 'ingredients_text', 'ingredients_text_en', 'allergens_tags',
  'traces_tags', 'labels_tags', 'nutriscore_grade', 'image_front_url', 'image_url', 'nutriments',
].join(',');

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<any>;
}>;

export async function fetchFromOpenFoodFacts(code: string, fetchImpl: FetchLike = fetch, timeoutMs = 3000): Promise<Product | null> {
  if (!/^\d{6,14}$/.test(code)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NutriLens/1.0 (open-source student project)' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`);
    const body = await res.json();
    if (body.status !== 1 || !body.product) return null;
    return offApiToProduct({ ...body.product, code });
  } finally {
    clearTimeout(timer);
  }
}
