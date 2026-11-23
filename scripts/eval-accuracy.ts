/**
 * Accuracy evaluation for the dietary analyzer.
 *
 *   npm run eval -- [--n 2000] [--seed 42] [--mode rules|hybrid]
 *
 * Product–restriction pairs are sampled at random (seeded, so runs are reproducible) from the
 * imported Open Food Facts database. Nothing is hand-picked. For each restriction we draw an equal
 * number of "contains" and "free of" products, with ground truth taken from fields the analyzer
 * does NOT see during the eval:
 *
 *   contains  - the product's declared allergen tags (e.g. en:milk), or OFF's ingredient analysis
 *               (en:non-vegan / en:non-vegetarian) for diets that are not allergens
 *   free of   - a manufacturer "free-from" label (en:vegan, en:gluten-free, en:no-soy, …) with no
 *               contradicting allergen or trace tag. OFF allergen lists alone are not trusted for
 *               this because they are often incomplete.
 *
 * The analyzer only gets the product name and raw ingredient text, i.e. what is printed on the
 * package. A pair is scored correct when "avoid" ⇔ "contains".
 *
 * Results go to eval/results/<mode>-seed<seed>.json and eval/REPORT.md.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2';
import { analyzeProduct } from '../lib/analyzer';
import { getRestriction } from '../lib/restrictions';
import type { Product, RestrictionId } from '../lib/types';
import { createGeminiExplainer, GEMINI_MODEL, mergeAi } from '../server/gemini';
import { splitTags } from '../server/products';

const EVAL_RESTRICTIONS: RestrictionId[] = ['vegan', 'vegetarian', 'glutenFree', 'dairyFree', 'eggFree', 'nutFree', 'peanutFree', 'soyFree'];
/** English-labelled markets the app targets (Canadian labels are bilingual). */
const COUNTRIES = ['en:canada', 'en:united-states', 'en:united-kingdom', 'en:ireland', 'en:australia', 'en:new-zealand'];

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const N = Number(arg('n', '2000'));
const SEED = Number(arg('seed', '42'));
const MODE = arg('mode', 'rules') as 'rules' | 'hybrid';
const PER_BUCKET = Math.floor(N / (EVAL_RESTRICTIONS.length * 2));

/** Small seeded PRNG (mulberry32) so samples are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Meta {
  code: string;
  allergens: string[];
  traces: string[];
  labels: string[];
  analysis: string[];
}

const has = (tags: string[], wanted: string[]) => wanted.some((w) => tags.includes(w));

/** Ground truth for one product and restriction: true = contains, false = free of, null = not usable. */
export function groundTruth(m: Meta, id: RestrictionId): boolean | null {
  const def = getRestriction(id)!;
  if (id === 'vegan' || id === 'vegetarian') {
    const nonTag = id === 'vegan' ? 'en:non-vegan' : 'en:non-vegetarian';
    const contains = has(m.allergens, def.allergenTags) || m.analysis.includes(nonTag);
    const free = has(m.labels, def.freeFromLabels);
    if (contains && !free) return true;
    if (free && !contains) return false;
    return null;
  }
  const contains = has(m.allergens, def.allergenTags);
  const labelledFree = has(m.labels, def.freeFromLabels);
  if (contains && !labelledFree) return true;
  // Only a manufacturer "free-from" claim counts as proof of absence: OFF allergen lists are often incomplete.
  if (labelledFree && !contains && !has(m.traces, def.allergenTags)) return false;
  return null;
}

/** Wilson score interval for a proportion. */
function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}

async function sample(conn: mysql.Connection): Promise<Map<string, string[]>> {
  const rand = rng(SEED);
  // reservoir[restriction][label] -> codes
  const reservoirs = new Map<string, { codes: string[]; seen: number }>();
  for (const id of EVAL_RESTRICTIONS) for (const t of [true, false]) reservoirs.set(`${id}|${t}`, { codes: [], seen: 0 });

  const where = COUNTRIES.map(() => 'countries LIKE ?').join(' OR ');
  const stream = conn
    .query(
      `SELECT code, allergen_tags, trace_tags, label_tags, analysis_tags FROM products
        WHERE ingredients_text IS NOT NULL AND (${where}) ORDER BY code`,
      COUNTRIES.map((c) => `%${c}%`),
    )
    .stream();

  let rows = 0;
  for await (const r of stream as AsyncIterable<any>) {
    rows++;
    const m: Meta = {
      code: r.code,
      allergens: splitTags(r.allergen_tags),
      traces: splitTags(r.trace_tags),
      labels: splitTags(r.label_tags),
      analysis: splitTags(r.analysis_tags),
    };
    for (const id of EVAL_RESTRICTIONS) {
      const truth = groundTruth(m, id);
      if (truth === null) continue;
      const res = reservoirs.get(`${id}|${truth}`)!;
      res.seen++;
      if (res.codes.length < PER_BUCKET) res.codes.push(m.code);
      else {
        const j = Math.floor(rand() * res.seen);
        if (j < PER_BUCKET) res.codes[j] = m.code;
      }
    }
  }
  console.log(`Scanned ${rows.toLocaleString()} English-market products with ingredient lists.`);
  const out = new Map<string, string[]>();
  for (const [k, v] of reservoirs) {
    out.set(k, v.codes);
    console.log(`  ${k.padEnd(18)} pool ${v.seen.toLocaleString().padStart(9)}  sampled ${v.codes.length}`);
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const explainer = MODE === 'hybrid' ? createGeminiExplainer(process.env.GEMINI_API_KEY) : null;
  if (MODE === 'hybrid' && !explainer) throw new Error('--mode hybrid needs GEMINI_API_KEY');

  const conn = mysql.createConnection({ uri: url });
  const buckets = await sample(conn);
  const promise = conn.promise();

  type Row = { code: string; name: string; restriction: RestrictionId; truth: boolean; status: string; findings: string[] };
  const rows: Row[] = [];
  for (const [key, codes] of buckets) {
    if (!codes.length) continue;
    const [id, t] = key.split('|') as [RestrictionId, string];
    const [products] = await promise.query<any[]>('SELECT code, name, ingredients_text FROM products WHERE code IN (?)', [codes]);
    for (const p of products) {
      // Only what is printed on the pack: no allergen tags, labels or nutrition.
      const input: Product = { code: p.code, name: p.name, ingredientsText: p.ingredients_text };
      let analysis = analyzeProduct(input, [id]);
      if (explainer) {
        try {
          analysis = mergeAi(analysis, await explainer.explain(input, analysis, [id]));
        } catch (err) {
          console.warn(`AI failed for ${p.code}: ${(err as Error).message}`);
        }
      }
      const r = analysis.results[0];
      rows.push({ code: p.code, name: p.name, restriction: id, truth: t === 'true', status: r.status, findings: r.findings.map((f) => f.term) });
    }
  }
  conn.end();

  const metrics = (subset: Row[]) => {
    const tp = subset.filter((r) => r.truth && r.status === 'avoid').length;
    const fn = subset.filter((r) => r.truth && r.status !== 'avoid').length;
    const fp = subset.filter((r) => !r.truth && r.status === 'avoid').length;
    const tn = subset.filter((r) => !r.truth && r.status !== 'avoid').length;
    const flagged = subset.filter((r) => r.truth && (r.status === 'avoid' || r.status === 'caution')).length;
    const n = subset.length;
    const correct = tp + tn;
    const [lo, hi] = wilson(correct, n);
    return {
      n,
      accuracy: correct / n,
      ci95: [lo, hi],
      precision: tp / Math.max(tp + fp, 1),
      recall: tp / Math.max(tp + fn, 1),
      /** Share of "contains" products that got at least a caution (what a child would actually see). */
      flaggedRecall: flagged / Math.max(tp + fn, 1),
      confusion: { tp, fn, fp, tn },
    };
  };

  const overall = metrics(rows);
  const perRestriction = Object.fromEntries(EVAL_RESTRICTIONS.map((id) => [id, metrics(rows.filter((r) => r.restriction === id))]));
  const errors = rows.filter((r) => (r.truth ? r.status !== 'avoid' : r.status === 'avoid'));
  const result = {
    generatedAt: new Date().toISOString(),
    mode: MODE,
    model: MODE === 'hybrid' ? GEMINI_MODEL : null,
    seed: SEED,
    requestedPairs: N,
    overall,
    perRestriction,
    errors: errors.slice(0, 200),
  };

  const dir = path.join(__dirname, '..', 'eval', 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${MODE}-seed${SEED}.json`), JSON.stringify(result, null, 2));

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const table = [
    '| Restriction | Pairs | Accuracy | 95% CI | Precision | Recall | Flagged (avoid or caution) |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...EVAL_RESTRICTIONS.map((id) => {
      const m = perRestriction[id];
      return `| ${getRestriction(id)!.label} | ${m.n} | ${pct(m.accuracy)} | ${pct(m.ci95[0])}–${pct(m.ci95[1])} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.flaggedRecall)} |`;
    }),
    `| **All** | **${overall.n}** | **${pct(overall.accuracy)}** | ${pct(overall.ci95[0])}–${pct(overall.ci95[1])} | ${pct(overall.precision)} | ${pct(overall.recall)} | ${pct(overall.flaggedRecall)} |`,
  ].join('\n');
  console.log(`\n${table}\n`);

  const report = `# Analyzer accuracy

Generated by \`npm run eval -- --n ${N} --seed ${SEED} --mode ${MODE}\` on ${result.generatedAt.slice(0, 10)}${result.model ? ` with ${result.model}` : ''}.

**${overall.n} product–restriction pairs, ${pct(overall.accuracy)} accuracy** (95% CI ${pct(overall.ci95[0])}–${pct(overall.ci95[1])}).

${table}

## Method

- Pairs are drawn at random (seed ${SEED}) from every product in the database that has an ingredient list and is sold in an English-labelled market (${COUNTRIES.join(', ')}). Each restriction gets the same number of "contains" and "free of" products.
- Ground truth comes from Open Food Facts fields the analyzer does not see. **Contains** means a declared allergen tag (or OFF's \`en:non-vegan\` / \`en:non-vegetarian\` analysis for diets that aren't allergens). **Free of** means a manufacturer free-from label (\`en:vegan\`, \`en:gluten-free\`, \`en:no-soy\`, …) with no contradicting allergen or trace tag. Products whose fields contradict each other are skipped.
- Seed 42 was used as a development set while improving the term lists. The headline number uses a different seed that was not looked at during development.
- The analyzer only receives the product name and the raw ingredient text, the same text printed on the package.
- "Correct" means the analyzer said **avoid** exactly when the product contains the restricted item. "Flagged" counts a **caution** as a catch too, because that is what the child sees.
- Ground truth is crowd-sourced, so some "errors" are label mistakes in Open Food Facts. Examples are in \`eval/results/${MODE}-seed${SEED}.json\`.
`;
  fs.writeFileSync(path.join(__dirname, '..', 'eval', 'REPORT.md'), report);
  console.log('Wrote eval/REPORT.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
