import { describe, expect, it } from 'vitest';
import { editDistance } from '../lib/text';
import { planQuery } from '../server/search';
import { SpellIndex } from '../server/spell';

const spell = new SpellIndex([
  ['nutella', 900],
  ['chocolate', 5000],
  ['chocolat', 800],
  ['cheerios', 300],
  ['granola', 1200],
  ['greek', 700],
  ['yogurt', 2000],
  ['nutela', 4], // a real misspelling that appears in product names
  ['bars', 900],
  ['bar', 2000],
]);

describe('editDistance', () => {
  it('counts adjacent swaps as one edit', () => {
    expect(editDistance('nutella', 'nutlela')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'xyz', 1)).toBe(2); // early exit returns max + 1
  });
});

describe('SpellIndex', () => {
  it('corrects one-letter typos to the most common word', () => {
    expect(spell.correct('chocolte')).toBe('chocolate');
    expect(spell.correct('yougrt')).toBe('yogurt');
  });

  it('corrects two-letter typos on longer words', () => {
    expect(spell.correct('chocoalte')).toBe('chocolate');
  });

  it('replaces a rare known misspelling with a far more common neighbour', () => {
    expect(spell.correct('nutela')).toBe('nutella');
  });

  it('keeps common words even when a neighbour is more common', () => {
    expect(spell.correct('bars')).toBe('bars');
  });

  it('finds a more common neighbour for a known misspelling', () => {
    expect(spell.moreCommonNeighbour('nutela')).toBe('nutella');
    expect(spell.moreCommonNeighbour('chocolate')).toBeNull();
    expect(spell.moreCommonNeighbour('bars')).toBeNull(); // common words are left alone
  });

  it('gives up on nonsense', () => {
    expect(spell.correct('zzzzzz')).toBeNull();
  });

  it('completes prefixes by popularity', () => {
    expect(spell.complete('choc')).toEqual(['chocolate', 'chocolat']);
  });
});

describe('planQuery', () => {
  it('requires every word and treats the last as a prefix', () => {
    expect(planQuery('greek yog', spell).expression).toBe('+greek +yog*');
  });

  it('fixes typos in finished words', () => {
    const plan = planQuery('nutela granola', spell);
    expect(plan.corrected).toEqual(['nutella', 'granola']);
  });

  it('does not "correct" a word the user is still typing', () => {
    expect(planQuery('chee', spell).corrected).toEqual(['chee']);
  });

  it('drops words too short for the full-text index', () => {
    expect(planQuery('a b yogurt', spell).expression).toBe('+yogurt*');
    expect(planQuery('', spell).expression).toBeNull();
  });
});
