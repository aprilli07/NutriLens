/**
 * Optional Gemini layer. It explains the analyzer's result in kid-friendly words and suggests
 * alternatives. It may flag extra concerns (which can only raise a warning), never clear one.
 *
 * Enabled only when GEMINI_API_KEY is set; everything works without it.
 */
import { GoogleGenAI, Type } from '@google/genai';
import { createHash } from 'node:crypto';
import { getRestriction } from '../lib/restrictions';
import type { Analysis, Product, RestrictionId } from '../lib/types';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export interface AiResult {
  explanation: string;
  alternatives: string[];
  /** Restrictions the model thinks the product violates, with the ingredient it based that on. */
  concerns: Array<{ restriction: RestrictionId; ingredient: string }>;
}

export interface Explainer {
  explain(product: Product, analysis: Analysis, restrictions: RestrictionId[]): Promise<AiResult>;
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    explanation: { type: Type.STRING, description: 'Two short sentences a 7-10 year old can understand.' },
    alternatives: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Up to 3 specific products or foods that fit every restriction.' },
    concerns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { restriction: { type: Type.STRING }, ingredient: { type: Type.STRING } },
        required: ['restriction', 'ingredient'],
      },
      description: 'Only ingredients that are actually listed and that the rule check did not already catch.',
    },
  },
  required: ['explanation', 'alternatives', 'concerns'],
  propertyOrdering: ['explanation', 'alternatives', 'concerns'],
};

export function buildPrompt(product: Product, analysis: Analysis, restrictions: RestrictionId[]): string {
  const lines = restrictions.map((id) => {
    const r = analysis.results.find((x) => x.id === id);
    const found = r?.findings.map((f) => `${f.term} (${f.severity})`).join(', ') || 'nothing found';
    return `- ${getRestriction(id)?.label}: rule check says ${r?.status ?? 'unknown'}; found: ${found}`;
  });
  return [
    'You help a child check whether a packaged food fits their dietary restrictions.',
    `Product: ${product.name}${product.brands ? ` by ${product.brands}` : ''}`,
    `Ingredients: ${product.ingredientsText || 'not available'}`,
    `Declared allergens: ${product.allergenTags?.join(', ') || 'none listed'}`,
    'Restrictions and the result of our rule-based check:',
    ...lines,
    `Overall verdict: ${analysis.verdict}. Do not contradict a "avoid" or "caution" result.`,
    'Explain the verdict simply, suggest alternatives, and list any listed ingredient the rule check missed.',
    `Valid restriction ids for "concerns": ${restrictions.join(', ')}.`,
  ].join('\n');
}

export function cacheKey(code: string, restrictions: RestrictionId[]): string {
  return createHash('sha256').update(`${GEMINI_MODEL}|${code}|${[...restrictions].sort().join(',')}`).digest('hex');
}

export function createGeminiExplainer(apiKey: string | undefined, timeoutMs = 10_000): Explainer | null {
  if (!apiKey) return null;
  const ai = new GoogleGenAI({ apiKey });
  return {
    async explain(product, analysis, restrictions) {
      const call = ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildPrompt(product, analysis, restrictions),
        config: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
      });
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini timed out')), timeoutMs));
      const res = await Promise.race([call, timeout]);
      return sanitize(JSON.parse(res.text ?? '{}'), restrictions);
    },
  };
}

export function sanitize(raw: any, restrictions: RestrictionId[]): AiResult {
  return {
    explanation: typeof raw?.explanation === 'string' ? raw.explanation.slice(0, 600) : '',
    alternatives: Array.isArray(raw?.alternatives) ? raw.alternatives.filter((a: unknown) => typeof a === 'string').slice(0, 3) : [],
    concerns: Array.isArray(raw?.concerns)
      ? raw.concerns.filter((c: any) => restrictions.includes(c?.restriction) && typeof c?.ingredient === 'string')
      : [],
  };
}

/** Merge AI concerns into the rule-based analysis. Concerns can only move ok/unknown -> caution. */
export function mergeAi(analysis: Analysis, ai: AiResult): Analysis {
  const results = analysis.results.map((r) => {
    const extra = ai.concerns.filter((c) => c.restriction === r.id);
    if (!extra.length || r.status === 'avoid') return r;
    return {
      ...r,
      status: 'caution' as const,
      findings: [...r.findings, ...extra.map((c) => ({ term: c.ingredient, reason: 'flagged by AI', source: 'ai' as const, severity: 'caution' as const }))],
    };
  });
  const verdict = results.some((r) => r.status === 'avoid')
    ? 'avoid'
    : results.some((r) => r.status === 'caution')
      ? 'caution'
      : analysis.verdict;
  return {
    ...analysis,
    verdict,
    summary: verdict !== analysis.verdict ? 'Hmm, this might not be safe. Check with a grown-up first!' : analysis.summary,
    results,
    ai: { explanation: ai.explanation, alternatives: ai.alternatives, model: GEMINI_MODEL },
  };
}
