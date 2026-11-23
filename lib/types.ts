/**
 * Shared domain types. Imported by the Expo app, the API server and the scripts,
 * so this file must stay free of React Native imports.
 */

export type RestrictionId =
  | 'vegan'
  | 'vegetarian'
  | 'glutenFree'
  | 'dairyFree'
  | 'eggFree'
  | 'nutFree'
  | 'peanutFree'
  | 'soyFree'
  | 'lowSugar'
  | 'lowSodium';

/** Per-restriction outcome. `unknown` means there was not enough data to decide. */
export type Status = 'ok' | 'caution' | 'avoid' | 'unknown';

/** Overall product verdict shown to the child. */
export type Verdict = 'good' | 'caution' | 'avoid' | 'unknown';

export interface Nutrition {
  /** All values are per 100 g, as published by Open Food Facts. */
  energyKcal?: number | null;
  fat?: number | null;
  saturatedFat?: number | null;
  carbohydrates?: number | null;
  sugars?: number | null;
  fiber?: number | null;
  proteins?: number | null;
  salt?: number | null;
  sodium?: number | null;
}

export interface Product {
  code: string;
  name: string;
  brands?: string | null;
  ingredientsText?: string | null;
  /** Open Food Facts taxonomy tags, e.g. `en:milk`. */
  allergenTags?: string[];
  traceTags?: string[];
  labelTags?: string[];
  nutriscore?: string | null;
  imageUrl?: string | null;
  nutrition?: Nutrition;
}

export type MatchSource = 'ingredients' | 'traces' | 'allergens' | 'nutrition' | 'label' | 'name' | 'ai';

export interface Finding {
  /** The ingredient or nutrient that triggered the finding, as written on the label. */
  term: string;
  /** Short reason, e.g. "milk" or "high sugar". */
  reason: string;
  source: MatchSource;
  severity: 'avoid' | 'caution';
}

export interface RestrictionResult {
  id: RestrictionId;
  status: Status;
  findings: Finding[];
}

export interface Analysis {
  verdict: Verdict;
  /** One short, kid-friendly sentence. */
  summary: string;
  results: RestrictionResult[];
  /** Optional AI-generated extras (only when GEMINI_API_KEY is configured on the server). */
  ai?: {
    explanation: string;
    alternatives: string[];
    model: string;
  };
}

export interface ScanRecord {
  id: number;
  code: string;
  name: string;
  imageUrl?: string | null;
  verdict: Verdict;
  restrictions: RestrictionId[];
  scannedAt: string;
}

export interface SearchHit {
  code: string;
  name: string;
  brands?: string | null;
  imageUrl?: string | null;
  nutriscore?: string | null;
}

export interface SearchResponse {
  query: string;
  /** Query after typo correction, when it differs from `query`. */
  correctedQuery?: string;
  hits: SearchHit[];
  tookMs: number;
}
