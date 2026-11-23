/**
 * Search latency benchmark against a running API server.
 *
 *   npm run server:start   # in another terminal
 *   npm run bench:search -- [--queries 1000] [--seed 7] [--url http://localhost:5001]
 *
 * Queries are generated from randomly sampled real product names, in four styles:
 *   prefix   - first 3-5 letters of a word, like a user mid-typing ("nute")
 *   words    - one or two complete words ("greek yogurt")
 *   typo     - a complete word with one random edit ("yougrt")
 *   filtered - "words" plus 1-3 dietary filters
 * Each query is timed end-to-end over HTTP. Results go to eval/search-benchmark.json.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { RESTRICTION_IDS } from '../lib/restrictions';
import { tokenize } from '../lib/text';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const QUERIES = Number(arg('queries', '1000'));
const SEED = Number(arg('seed', '7'));
const BASE = arg('url', `http://localhost:${process.env.PORT || 5001}`);

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
const rand = rng(SEED);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

function typo(word: string): string {
  const i = 1 + Math.floor(rand() * (word.length - 1));
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  switch (Math.floor(rand() * 4)) {
    case 0: return word.slice(0, i) + word.slice(i + 1); // deletion
    case 1: return word.slice(0, i) + pick([...letters]) + word.slice(i); // insertion
    case 2: return word.slice(0, i) + pick([...letters]) + word.slice(i + 1); // substitution
    default: return i < word.length - 1 ? word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2) : word.slice(0, -1); // swap
  }
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL! });
  const [[{ total }]] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM products');
  // Sample names from products people actually scan, so queries look like real searches.
  const [rows] = await pool.query<any[]>(
    'SELECT name FROM products WHERE scans > 0 AND RAND(?) < 0.05 LIMIT 20000',
    [SEED],
  );
  await pool.end();
  const names = rows.map((r) => tokenize(r.name, 4).filter((t) => /^[a-z]+$/.test(t))).filter((t) => t.length > 0);

  const styles = ['prefix', 'words', 'typo', 'filtered'] as const;
  const queries = Array.from({ length: QUERIES }, (_, i) => {
    const style = styles[i % styles.length];
    const words = pick(names);
    const w = pick(words);
    let q: string;
    let restrictions = '';
    if (style === 'prefix') q = w.slice(0, 3 + Math.floor(rand() * 3));
    else if (style === 'typo') q = w.length >= 5 ? typo(w) : w;
    else q = words.slice(0, 1 + Math.floor(rand() * Math.min(2, words.length))).join(' ');
    if (style === 'filtered') {
      const k = 1 + Math.floor(rand() * 3);
      restrictions = [...new Set(Array.from({ length: k }, () => pick(RESTRICTION_IDS)))].join(',');
    }
    return { style, q, restrictions };
  });

  const run = async (q: { q: string; restrictions: string }) => {
    const params = new URLSearchParams({ q: q.q, limit: '20', restrictions: q.restrictions });
    const t = performance.now();
    const res = await fetch(`${BASE}/api/search?${params}`);
    const body = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
    return { ms: performance.now() - t, hits: body.hits.length as number };
  };

  console.log(`Warming up against ${BASE} (${Number(total).toLocaleString()} products)…`);
  for (const q of queries.slice(0, 50)) await run(q);

  const results: Array<{ style: string; q: string; restrictions: string; ms: number; hits: number }> = [];
  for (const q of queries) results.push({ ...q, ...(await run(q)) });

  const summarize = (xs: typeof results) => {
    const ms = xs.map((r) => r.ms).sort((a, b) => a - b);
    return {
      queries: xs.length,
      p50: +percentile(ms, 50).toFixed(1),
      p95: +percentile(ms, 95).toFixed(1),
      p99: +percentile(ms, 99).toFixed(1),
      max: +ms[ms.length - 1].toFixed(1),
      under200ms: +(ms.filter((m) => m < 200).length / ms.length).toFixed(4),
      withResults: +(xs.filter((r) => r.hits > 0).length / xs.length).toFixed(4),
    };
  };

  const report = {
    generatedAt: new Date().toISOString(),
    products: Number(total),
    seed: SEED,
    overall: summarize(results),
    byStyle: Object.fromEntries(styles.map((s) => [s, summarize(results.filter((r) => r.style === s))])),
    slowest: [...results].sort((a, b) => b.ms - a.ms).slice(0, 15),
  };
  console.table({ overall: report.overall, ...report.byStyle });
  const out = path.join(__dirname, '..', 'eval', 'search-benchmark.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Wrote ${path.relative(process.cwd(), out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
