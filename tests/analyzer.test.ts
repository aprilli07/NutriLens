import { describe, expect, it } from 'vitest';
import { analyzeProduct, computeMasks, splitTraces } from '../lib/analyzer';
import { restrictionMask } from '../lib/restrictions';
import type { Product, RestrictionId } from '../lib/types';

const product = (ingredientsText: string | null, extra: Partial<Product> = {}): Product => ({
  code: '1',
  name: 'Test',
  ingredientsText,
  ...extra,
});

const status = (p: Product, id: RestrictionId) => analyzeProduct(p, [id]).results[0].status;

describe('ingredient matching', () => {
  it('flags real allergens', () => {
    const p = product('Wheat flour, sugar, milk powder, soy lecithin, eggs');
    expect(status(p, 'glutenFree')).toBe('avoid');
    expect(status(p, 'dairyFree')).toBe('avoid');
    expect(status(p, 'soyFree')).toBe('avoid');
    expect(status(p, 'eggFree')).toBe('avoid');
    expect(status(p, 'vegan')).toBe('avoid');
    expect(status(p, 'vegetarian')).toBe('ok');
  });

  it('ignores look-alike words', () => {
    const p = product('Coconut milk, cocoa butter, rice flour, buckwheat, nutmeg, eggplant, maltodextrin, cream of tartar');
    for (const id of ['dairyFree', 'glutenFree', 'nutFree', 'eggFree', 'vegan'] as RestrictionId[]) {
      expect(status(p, id), id).toBe('ok');
    }
  });

  it('keeps the real allergen inside a look-alike phrase', () => {
    const p = product('Peanut butter (roasted peanuts, salt)');
    expect(status(p, 'peanutFree')).toBe('avoid');
    expect(status(p, 'dairyFree')).toBe('ok');
  });

  it('respects negations such as "dairy-free" and "gluten free oats"', () => {
    expect(status(product('Dairy-free chocolate chips, gluten free oats'), 'dairyFree')).toBe('ok');
    expect(status(product('Gluten free oats, honey'), 'glutenFree')).toBe('ok');
  });

  it('treats plain oats as a caution for gluten-free', () => {
    expect(status(product('Rolled oats, honey'), 'glutenFree')).toBe('caution');
  });

  it('reads bilingual Canadian labels', () => {
    const p = product('Farine de blé, lait écrémé, œufs, arachides');
    expect(status(p, 'glutenFree')).toBe('avoid');
    expect(status(p, 'dairyFree')).toBe('avoid');
    expect(status(p, 'eggFree')).toBe('avoid');
    expect(status(p, 'peanutFree')).toBe('avoid');
  });
});

describe('"may contain" statements', () => {
  it('separates traces from the ingredient list', () => {
    const { main, traces } = splitTraces('Sugar, cocoa. May contain peanuts and tree nuts.');
    expect(main).toContain(' cocoa ');
    expect(traces).toContain(' peanuts ');
  });

  it('turns traces into a caution, not an avoid', () => {
    const p = product('Sugar, cocoa butter. May contain milk.');
    expect(status(p, 'dairyFree')).toBe('caution');
  });

  it('handles shared-facility warnings', () => {
    const p = product('Corn, sunflower oil, salt. Made in a facility that also processes peanuts.');
    expect(status(p, 'peanutFree')).toBe('caution');
  });
});

describe('tags and labels', () => {
  it('uses declared allergen tags even without ingredient text', () => {
    expect(status(product(null, { allergenTags: ['en:milk'] }), 'dairyFree')).toBe('avoid');
  });

  it('falls back to the product name when there is no ingredient list', () => {
    expect(status(product(null, { name: 'Goat milk cheese' }), 'dairyFree')).toBe('avoid');
    expect(status(product(null, { name: 'Coconut milk' }), 'dairyFree')).toBe('unknown');
    expect(status(product('Water, salt', { name: 'Milk-free spread' }), 'dairyFree')).toBe('ok');
    // With an ingredient list that doesn't confirm the name, it's a caution.
    expect(status(product('Picodon AOP', { name: 'Goat cheese' }), 'dairyFree')).toBe('caution');
  });

  it('reads common allergen words on imported labels', () => {
    expect(status(product('Gepasteuriseerde melk, zout'), 'dairyFree')).toBe('avoid');
    expect(status(product('Weizenmehl, Zucker, Haselnüsse'), 'glutenFree')).toBe('avoid');
    expect(status(product('Weizenmehl, Zucker, Haselnüsse'), 'nutFree')).toBe('avoid');
    expect(status(product('Harina de trigo, huevo'), 'eggFree')).toBe('avoid');
  });

  it('returns unknown when there is nothing to go on', () => {
    expect(status(product(null), 'nutFree')).toBe('unknown');
    expect(analyzeProduct(product(null), ['nutFree']).verdict).toBe('unknown');
  });

  it('downgrades to caution when a free-from label contradicts the text', () => {
    expect(status(product('Cashew cream', { labelTags: ['en:vegan'] }), 'dairyFree')).toBe('caution');
  });
});

describe('nutrient restrictions', () => {
  it('uses UK FSA thresholds for sugar', () => {
    expect(status(product('x', { nutrition: { sugars: 30 } }), 'lowSugar')).toBe('avoid');
    expect(status(product('x', { nutrition: { sugars: 10 } }), 'lowSugar')).toBe('caution');
    expect(status(product('x', { nutrition: { sugars: 2 } }), 'lowSugar')).toBe('ok');
    expect(status(product('x'), 'lowSugar')).toBe('unknown');
  });

  it('derives salt from sodium when salt is missing', () => {
    expect(status(product('x', { nutrition: { sodium: 0.8 } }), 'lowSodium')).toBe('avoid');
  });
});

describe('verdict and masks', () => {
  it('takes the worst result as the verdict', () => {
    const a = analyzeProduct(product('Rice, milk'), ['vegetarian', 'dairyFree']);
    expect(a.verdict).toBe('avoid');
    expect(a.summary).toMatch(/milk/);
  });

  it('is good when every restriction passes', () => {
    expect(analyzeProduct(product('Rice, water, salt'), ['vegan', 'glutenFree']).verdict).toBe('good');
  });

  it('precomputes masks that match the analyzer', () => {
    const { avoidMask, unsureMask } = computeMasks(product('Wheat flour, peanuts. May contain milk.'));
    expect(unsureMask & restrictionMask(['dairyFree'])).not.toBe(0); // a caution is not shown as safe
    expect(avoidMask & restrictionMask(['glutenFree'])).not.toBe(0);
    expect(avoidMask & restrictionMask(['peanutFree'])).not.toBe(0);
    expect(avoidMask & restrictionMask(['dairyFree'])).toBe(0);
  });
});
