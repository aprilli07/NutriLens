/**
 * Integration test for the real SQL. Runs only when TEST_DATABASE_URL points at a disposable database
 * (CI provides one; locally: TEST_DATABASE_URL=mysql://user:pass@127.0.0.1/nutrilens_test npm test).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { restrictionMask } from '../lib/restrictions';
import { buildSearchTier, createPool, migrate, Pool } from '../server/db';
import { MySqlRepo } from '../server/repo';
import { searchProducts } from '../server/search';
import { SpellIndex } from '../server/spell';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('MySqlRepo', () => {
  let pool: Pool;
  let repo: MySqlRepo;

  beforeAll(async () => {
    pool = createPool(url);
    for (const t of ['scans', 'users', 'products', 'product_search', 'search_terms', 'ai_cache']) await pool.query(`DROP TABLE IF EXISTS ${t}`);
    await migrate(pool);
    repo = new MySqlRepo(pool);
    await repo.saveProduct({ code: '1', name: 'Chocolate Hazelnut Spread', brands: 'Nutella', ingredientsText: 'Sugar, hazelnuts, skim milk' });
    await repo.saveProduct({ code: '2', name: 'Dark Chocolate Bar', brands: 'Brand', ingredientsText: 'Cocoa mass, sugar, cocoa butter' });
    await pool.query("UPDATE products SET scans = 10 WHERE code = '2'");
    expect(await buildSearchTier(pool)).toBe(1);
    await pool.query("INSERT INTO search_terms VALUES ('chocolate', 50), ('hazelnut', 5), ('hazlenut', 2), ('spread', 9), ('dark', 7), ('bar', 9)");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('round-trips products with nutrition and tags', async () => {
    await repo.saveProduct({ code: '3', name: 'Milk', allergenTags: ['en:milk'], nutrition: { sugars: 4.8 } });
    const p = await repo.getProduct('3');
    expect(p?.allergenTags).toEqual(['en:milk']);
    expect(p?.nutrition?.sugars).toBeCloseTo(4.8);
  });

  it('searches with full-text, typo correction and dietary filters', async () => {
    const spell = new SpellIndex(await repo.loadSearchTerms(100));
    const all = await searchProducts(repo, spell, 'chocolat', [], 10);
    // '2' is popular (tier 1) so it ranks first; '1' comes from the long-tail tier.
    expect(all.hits.map((h) => h.code)).toEqual(['2', '1']);

    const typo = await searchProducts(repo, spell, 'hazlenut spread', [], 10);
    expect(typo.correctedQuery).toBe('hazelnut spread');
    expect(typo.hits.map((h) => h.code)).toEqual(['1']);

    // "hazlenut" is a known (rare) word, so it is only fixed by the zero-results retry.
    const retry = await searchProducts(repo, spell, 'hazlenut spread', [], 10);
    expect(retry.hits.map((h) => h.code)).toEqual(['1']);

    const dairyFree = await repo.searchProducts({ expression: '+chocolate*', excludeMask: restrictionMask(['dairyFree']), limit: 10 });
    expect(dairyFree.map((h) => h.code)).toEqual(['2']);
  });

  it('stores users, restrictions and scans', async () => {
    const u = await repo.createUser('family@example.com', 'hash', null);
    await repo.setRestrictions(u.id, ['nutFree']);
    expect((await repo.findUserByEmail('family@example.com'))?.restrictions).toEqual(['nutFree']);

    const s = await repo.addScan(u.id, { code: '1', name: 'Spread', verdict: 'avoid', restrictions: ['nutFree'] });
    expect((await repo.listScans(u.id, 10))[0].verdict).toBe('avoid');
    expect(await repo.deleteScan(u.id + 1, s.id)).toBe(false);
    expect(await repo.deleteScan(u.id, s.id)).toBe(true);
  });
});
