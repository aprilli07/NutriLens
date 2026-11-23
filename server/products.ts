/**
 * Mapping between database rows / Open Food Facts payloads and the shared Product type.
 */
import type { Nutrition, Product } from '../lib/types';

export interface ProductRow {
  code: string;
  name: string;
  brands: string | null;
  ingredients_text: string | null;
  allergen_tags: string | null;
  trace_tags: string | null;
  label_tags: string | null;
  nutriscore: string | null;
  image_url: string | null;
  energy_kcal: number | null;
  fat: number | null;
  saturated_fat: number | null;
  carbohydrates: number | null;
  sugars: number | null;
  fiber: number | null;
  proteins: number | null;
  salt: number | null;
  sodium: number | null;
}

export const PRODUCT_COLUMNS =
  'code, name, brands, ingredients_text, allergen_tags, trace_tags, label_tags, nutriscore, image_url, ' +
  'energy_kcal, fat, saturated_fat, carbohydrates, sugars, fiber, proteins, salt, sodium';

export function splitTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

export function rowToProduct(row: ProductRow): Product {
  return {
    code: row.code,
    name: row.name,
    brands: row.brands,
    ingredientsText: row.ingredients_text,
    allergenTags: splitTags(row.allergen_tags),
    traceTags: splitTags(row.trace_tags),
    labelTags: splitTags(row.label_tags),
    nutriscore: row.nutriscore,
    imageUrl: row.image_url,
    nutrition: {
      energyKcal: row.energy_kcal,
      fat: row.fat,
      saturatedFat: row.saturated_fat,
      carbohydrates: row.carbohydrates,
      sugars: row.sugars,
      fiber: row.fiber,
      proteins: row.proteins,
      salt: row.salt,
      sodium: row.sodium,
    },
  };
}

/** Parse a per-100 g value, rejecting the impossible values that appear in crowd-sourced data. */
export function per100g(value: unknown, max = 100): number | null {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function joinTags(tags: unknown): string | null {
  return Array.isArray(tags) && tags.length ? tags.join(',') : null;
}

/** Convert a product from the Open Food Facts v2 API (used when a barcode is not in our database yet). */
export function offApiToProduct(p: any): Product {
  const n = p.nutriments ?? {};
  const nutrition: Nutrition = {
    energyKcal: per100g(n['energy-kcal_100g'], 1000),
    fat: per100g(n.fat_100g),
    saturatedFat: per100g(n['saturated-fat_100g']),
    carbohydrates: per100g(n.carbohydrates_100g),
    sugars: per100g(n.sugars_100g),
    fiber: per100g(n.fiber_100g),
    proteins: per100g(n.proteins_100g),
    salt: per100g(n.salt_100g),
    sodium: per100g(n.sodium_100g),
  };
  return {
    code: String(p.code),
    name: p.product_name_en || p.product_name || 'Unknown product',
    brands: p.brands ?? null,
    ingredientsText: p.ingredients_text_en || p.ingredients_text || null,
    allergenTags: p.allergens_tags ?? [],
    traceTags: p.traces_tags ?? [],
    labelTags: p.labels_tags ?? [],
    nutriscore: typeof p.nutriscore_grade === 'string' && p.nutriscore_grade.length === 1 ? p.nutriscore_grade : null,
    imageUrl: p.image_front_url || p.image_url || null,
    nutrition,
  };
}

export function productToRowValues(p: Product, extra: { analysisTags?: string | null; countries?: string | null; scans?: number }) {
  const n = p.nutrition ?? {};
  return {
    code: p.code,
    name: p.name.slice(0, 255),
    brands: p.brands ? p.brands.slice(0, 255) : null,
    ingredients_text: p.ingredientsText || null,
    allergen_tags: joinTags(p.allergenTags)?.slice(0, 512) ?? null,
    trace_tags: joinTags(p.traceTags)?.slice(0, 512) ?? null,
    label_tags: joinTags(p.labelTags)?.slice(0, 1024) ?? null,
    analysis_tags: extra.analysisTags?.slice(0, 255) ?? null,
    countries: extra.countries?.slice(0, 255) ?? null,
    nutriscore: p.nutriscore ?? null,
    image_url: p.imageUrl && p.imageUrl.length <= 512 ? p.imageUrl : null,
    energy_kcal: n.energyKcal ?? null,
    fat: n.fat ?? null,
    saturated_fat: n.saturatedFat ?? null,
    carbohydrates: n.carbohydrates ?? null,
    sugars: n.sugars ?? null,
    fiber: n.fiber ?? null,
    proteins: n.proteins ?? null,
    salt: n.salt ?? null,
    sodium: n.sodium ?? null,
    scans: extra.scans ?? 0,
  };
}
