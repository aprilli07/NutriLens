/**
 * Stream the Open Food Facts CSV export into MySQL without decompressing it to disk.
 *
 *   curl -L -o off.csv.gz https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
 *   npm run import:off -- off.csv.gz [--limit 50000]
 *
 * For every product it also runs the shared analyzer once to precompute the dietary filter
 * bitmasks used by search, and it builds the vocabulary used for typo correction.
 */
import 'dotenv/config';
import fs from 'node:fs';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { computeMasks } from '../lib/analyzer';
import { tokenize } from '../lib/text';
import type { Product } from '../lib/types';
import { buildSearchTier, createPool, migrate } from '../server/db';
import { per100g, productToRowValues, splitTags } from '../server/products';

const BATCH = 1000;
const PARALLEL = 4;
const MIN_TERM_FREQ = 3;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
if (!file) {
  console.error('usage: npm run import:off -- <products.csv.gz> [--limit N]');
  process.exit(1);
}

const COLUMNS = [
  'code', 'name', 'brands', 'ingredients_text', 'allergen_tags', 'trace_tags', 'label_tags', 'analysis_tags',
  'countries', 'nutriscore', 'image_url', 'energy_kcal', 'fat', 'saturated_fat', 'carbohydrates', 'sugars',
  'fiber', 'proteins', 'salt', 'sodium', 'scans', 'avoid_mask', 'unsure_mask',
];
const UPDATE = COLUMNS.filter((c) => c !== 'code').map((c) => `${c} = VALUES(${c})`).join(', ');

async function main() {
  process.env.SKIP_FULLTEXT = '1';
  const pool = createPool();
  await migrate(pool);
  const [ft] = await pool.query<any[]>(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'products' AND index_name = 'ft_products_name'",
  );
  if (ft.length) {
    console.log('Dropping full-text index for bulk load…');
    await pool.query('ALTER TABLE products DROP INDEX ft_products_name');
  }

  const input = fs.createReadStream(file!).pipe(zlib.createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  let header: Record<string, number> | null = null;
  let batch: unknown[][] = [];
  const inflight = new Set<Promise<void>>();
  const vocab = new Map<string, number>();
  let read = 0;
  let kept = 0;
  const started = Date.now();

  const flush = async (rows: unknown[][]) => {
    const placeholders = rows.map(() => `(${COLUMNS.map(() => '?').join(',')})`).join(',');
    await pool.query(`INSERT INTO products (${COLUMNS.join(',')}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${UPDATE}`, rows.flat());
  };

  for await (const line of lines) {
    if (!header) {
      header = Object.fromEntries(line.split('\t').map((h, i) => [h, i]));
      continue;
    }
    if (read++ >= limit) break;
    const f = line.split('\t');
    const col = (name: string) => f[header![name]] ?? '';
    const code = col('code').trim();
    const name = col('product_name').trim();
    if (!code || code.length > 64 || !name) continue;

    const product: Product = {
      code,
      name,
      brands: col('brands').trim() || null,
      ingredientsText: col('ingredients_text').trim() || null,
      allergenTags: splitTags(col('allergens')),
      traceTags: splitTags(col('traces_tags')),
      labelTags: splitTags(col('labels_tags')),
      nutriscore: /^[a-e]$/.test(col('nutriscore_grade')) ? col('nutriscore_grade') : null,
      imageUrl: col('image_url') || col('image_small_url') || null,
      nutrition: {
        energyKcal: per100g(col('energy-kcal_100g'), 1000),
        fat: per100g(col('fat_100g')),
        saturatedFat: per100g(col('saturated-fat_100g')),
        carbohydrates: per100g(col('carbohydrates_100g')),
        sugars: per100g(col('sugars_100g')),
        fiber: per100g(col('fiber_100g')),
        proteins: per100g(col('proteins_100g')),
        salt: per100g(col('salt_100g')),
        sodium: per100g(col('sodium_100g')),
      },
    };
    const { avoidMask, unsureMask } = computeMasks(product);
    const values = productToRowValues(product, {
      analysisTags: col('ingredients_analysis_tags') || null,
      countries: col('countries_tags') || null,
      scans: Number.parseInt(col('unique_scans_n'), 10) || 0,
    });
    batch.push([...COLUMNS.slice(0, -2).map((c) => (values as Record<string, unknown>)[c]), avoidMask, unsureMask]);

    for (const t of new Set(tokenize(`${name} ${product.brands ?? ''}`, 2))) {
      if (t.length <= 32 && !/^\d+$/.test(t)) vocab.set(t, (vocab.get(t) ?? 0) + 1);
    }

    kept++;
    if (batch.length >= BATCH) {
      const p = flush(batch).finally(() => inflight.delete(p));
      inflight.add(p);
      batch = [];
      if (inflight.size >= PARALLEL) await Promise.race(inflight);
    }
    if (read % 100_000 === 0) {
      const secs = (Date.now() - started) / 1000;
      console.log(`${read.toLocaleString()} rows read, ${kept.toLocaleString()} kept (${Math.round(read / secs)}/s)`);
    }
  }
  if (batch.length) await flush(batch);
  await Promise.all(inflight);
  console.log(`Loaded ${kept.toLocaleString()} products from ${read.toLocaleString()} rows.`);

  console.log('Writing search vocabulary…');
  await pool.query('TRUNCATE TABLE search_terms');
  const terms = [...vocab].filter(([, n]) => n >= MIN_TERM_FREQ);
  for (let i = 0; i < terms.length; i += 5000) {
    const chunk = terms.slice(i, i + 5000);
    await pool.query(`INSERT INTO search_terms (term, freq) VALUES ${chunk.map(() => '(?,?)').join(',')}`, chunk.flat());
  }
  console.log(`${terms.length.toLocaleString()} search terms.`);

  console.log('Building full-text index (this takes a few minutes)…');
  const t = Date.now();
  await pool.query('ALTER TABLE products ADD FULLTEXT INDEX ft_products_name (name, brands)');
  console.log(`Full-text index built in ${Math.round((Date.now() - t) / 1000)}s.`);
  console.log(`Search tier 1: ${(await buildSearchTier(pool)).toLocaleString()} popular products.`);
  console.log(`Total ${Math.round((Date.now() - started) / 1000)}s.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
