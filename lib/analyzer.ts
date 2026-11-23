/**
 * Deterministic dietary analyzer.
 *
 * This is the single source of truth for "is this safe for my kid?". It runs on the phone,
 * on the server, in the importer (to precompute search filters) and in the accuracy eval.
 * AI (Gemini) is only ever used on top of it to explain results; it can never lower a warning.
 */
import { FALSE_FRIENDS, RESTRICTIONS, RestrictionDef, getRestriction } from './restrictions';
import { normalize } from './text';
import type { Analysis, Finding, Product, RestrictionId, RestrictionResult, Status, Verdict } from './types';

const TRACE_TRIGGERS = [
  'may contain', 'may also contain', 'may contain traces', 'traces of', 'could contain', 'peut contenir',
  'traces possibles', 'manufactured in a facility', 'made in a facility', 'produced in a facility',
  'processed in a facility', 'packaged in a facility', 'manufactured on equipment', 'made on equipment',
  'produced on equipment', 'processed on equipment', 'made on shared equipment', 'in a facility that',
  'fabrique dans une usine', 'produit dans une usine',
];

/** Words after which the next word is negated ("no milk", "free from nuts", "sans gluten"). */
const NEGATORS = ['free from', 'free of', 'without', 'no', 'non', 'sans', 'not'];

interface CompiledGroup {
  reason: string;
  cautionOnly: boolean;
  terms: string[];
}

interface CompiledRestriction {
  def: RestrictionDef;
  groups: CompiledGroup[];
}

const COMPILED: CompiledRestriction[] = RESTRICTIONS.map((def) => ({
  def,
  groups: def.groups.map((g) => ({
    reason: g.reason,
    cautionOnly: Boolean(g.cautionOnly),
    // Longest first so "egg white" is reported instead of "egg".
    terms: Array.from(new Set(g.terms.map(normalize))).sort((a, b) => b.length - a.length),
  })),
}));

const FALSE_FRIEND_PATTERNS = FALSE_FRIENDS.map(([phrase, word]) => {
  const p = normalize(phrase);
  return { find: ` ${p} `, replace: ` ${p.replace(new RegExp(`\\b${normalize(word)}\\b`), '_')} ` };
});

const NEGATION_RE = new RegExp(`\\b(?:${NEGATORS.join('|')}) [a-z0-9]+|\\b[a-z0-9]+ free\\b`, 'g');

/** Split label text into the ingredient list and any "may contain"/shared-facility statements. */
export function splitTraces(raw: string): { main: string; traces: string } {
  const lower = raw.toLowerCase();
  const sentences = lower.split(/[.;\n]+/);
  const main: string[] = [];
  const traces: string[] = [];
  for (const sentence of sentences) {
    // Keep list separators as "|" so phrases like "rice milk" never match across "rice, milk".
    const s = sentence
      .split(/[,()[\]{}:/·•*]+/)
      .map(normalize)
      .filter(Boolean)
      .join(' | ');
    let cut = -1;
    for (const trigger of TRACE_TRIGGERS) {
      const idx = s.indexOf(trigger);
      if (idx !== -1 && (cut === -1 || idx < cut)) cut = idx;
    }
    if (cut === -1) {
      main.push(s);
    } else {
      main.push(s.slice(0, cut));
      traces.push(s.slice(cut));
    }
  }
  return { main: prepare(main.join(' ')), traces: prepare(traces.join(' ')) };
}

/** Pad, neutralise false friends and negated words so whole-word matching is safe. */
function prepare(normalized: string): string {
  let text = ` ${normalized.replace(/\s+/g, ' ').trim()} `;
  for (const { find, replace } of FALSE_FRIEND_PATTERNS) {
    while (text.includes(find)) text = text.replace(find, replace);
  }
  text = text.replace(NEGATION_RE, (m) => m.replace(/[a-z0-9]/g, '_'));
  return text;
}

function findTerm(text: string, terms: string[]): string | null {
  for (const term of terms) {
    if (text.includes(` ${term} `)) return term;
  }
  return null;
}

function hasTag(tags: string[] | undefined, wanted: string[]): string | null {
  if (!tags?.length) return null;
  return wanted.find((t) => tags.includes(t)) ?? null;
}

function prettyTag(tag: string): string {
  return tag.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ');
}

function analyzeIngredientRestriction(
  c: CompiledRestriction,
  product: Product,
  parsed: { main: string; traces: string } | null,
): RestrictionResult {
  const { def } = c;
  const findings: Finding[] = [];

  const allergen = hasTag(product.allergenTags, def.allergenTags);
  if (allergen) {
    findings.push({ term: prettyTag(allergen), reason: prettyTag(allergen), source: 'allergens', severity: 'avoid' });
  }

  if (parsed) {
    for (const g of c.groups) {
      const hit = findTerm(parsed.main, g.terms);
      if (hit) {
        findings.push({ term: hit, reason: g.reason, source: 'ingredients', severity: g.cautionOnly ? 'caution' : 'avoid' });
      }
      const trace = findTerm(parsed.traces, g.terms);
      if (trace) {
        findings.push({ term: trace, reason: `may contain ${g.reason}`, source: 'traces', severity: 'caution' });
      }
    }
  }

  if (product.name) {
    // The name is evidence too ("Goat milk cheese"). Without an ingredient list it decides; with one
    // that doesn't confirm it (e.g. a label in another language), it's a reason to double-check.
    const name = splitTraces(product.name).main;
    for (const g of c.groups) {
      const hit = findTerm(name, g.terms);
      if (!hit || findings.some((f) => f.reason === g.reason && f.source === 'ingredients')) continue;
      const severity = parsed || g.cautionOnly ? 'caution' : 'avoid';
      findings.push({ term: hit, reason: g.reason, source: 'name', severity });
    }
  }

  const trace = hasTag(product.traceTags, def.allergenTags);
  if (trace && !findings.some((f) => f.source === 'traces')) {
    findings.push({ term: prettyTag(trace), reason: `may contain ${prettyTag(trace)}`, source: 'traces', severity: 'caution' });
  }

  const labelledFree = hasTag(product.labelTags, def.freeFromLabels);
  let status: Status;
  if (findings.some((f) => f.severity === 'avoid')) {
    // A "free-from" label that contradicts an ingredient match is worth a second look, not a green light.
    const onlyFromText = findings.every((f) => f.severity !== 'avoid' || f.source === 'ingredients' || f.source === 'name');
    status = labelledFree && onlyFromText ? 'caution' : 'avoid';
  } else if (findings.length > 0) {
    status = 'caution';
  } else if (parsed && parsed.main.replace(/[\s_]/g, '').length > 0) {
    status = 'ok';
  } else {
    status = labelledFree ? 'ok' : 'unknown';
  }
  return { id: def.id, status, findings };
}

function analyzeNutrientRestriction(def: RestrictionDef, product: Product): RestrictionResult {
  const rule = def.nutrient!;
  const n = product.nutrition ?? {};
  let value = n[rule.key];
  if (rule.key === 'salt' && (value == null || Number.isNaN(value)) && n.sodium != null) value = n.sodium * 2.5;

  if (value == null || Number.isNaN(value)) {
    const labelled = hasTag(product.labelTags, def.freeFromLabels);
    return { id: def.id, status: labelled ? 'ok' : 'unknown', findings: [] };
  }
  const term = `${rule.key} ${Math.round(value * 10) / 10} g/100 g`;
  if (value > rule.avoid) {
    return { id: def.id, status: 'avoid', findings: [{ term, reason: rule.reason, source: 'nutrition', severity: 'avoid' }] };
  }
  if (value > rule.caution) {
    return { id: def.id, status: 'caution', findings: [{ term, reason: `medium ${rule.key}`, source: 'nutrition', severity: 'caution' }] };
  }
  return { id: def.id, status: 'ok', findings: [] };
}

/** Analyse one product against the given restrictions. Pure and synchronous. */
export function analyzeProduct(product: Product, restrictionIds: RestrictionId[]): Analysis {
  const parsed = product.ingredientsText?.trim() ? splitTraces(product.ingredientsText) : null;
  const results = restrictionIds
    .map((id) => COMPILED.find((c) => c.def.id === id) ?? null)
    .filter((c): c is CompiledRestriction => c !== null)
    .map((c) => (c.def.nutrient ? analyzeNutrientRestriction(c.def, product) : analyzeIngredientRestriction(c, product, parsed)));

  const verdict = overallVerdict(results);
  return { verdict, summary: summarize(verdict, results), results };
}

export function overallVerdict(results: RestrictionResult[]): Verdict {
  if (results.some((r) => r.status === 'avoid')) return 'avoid';
  if (results.some((r) => r.status === 'caution')) return 'caution';
  if (results.some((r) => r.status === 'unknown')) return 'unknown';
  return 'good';
}

function summarize(verdict: Verdict, results: RestrictionResult[]): string {
  const first = (status: Status) => results.find((r) => r.status === status);
  switch (verdict) {
    case 'avoid': {
      const r = first('avoid')!;
      const f = r.findings.find((x) => x.severity === 'avoid');
      return `Stop! This has ${f?.reason ?? 'something'} in it, which isn't ${getRestriction(r.id)?.label.toLowerCase()}.`;
    }
    case 'caution':
      return 'Hmm, this might not be safe. Check with a grown-up first!';
    case 'unknown':
      return "I couldn't read enough about this food. Ask a grown-up!";
    default:
      return results.length ? 'Good choice! This looks safe for you.' : 'No restrictions set yet. Ask a grown-up to pick some in Settings.';
  }
}

/**
 * Bitmasks used to filter search results without re-running the analyzer at query time.
 * `unsureMask` covers both "caution" and "unknown": the search filter only shows confirmed-safe foods.
 */
export function computeMasks(product: Product): { avoidMask: number; unsureMask: number } {
  const analysis = analyzeProduct(product, RESTRICTIONS.map((r) => r.id));
  let avoidMask = 0;
  let unsureMask = 0;
  for (const r of analysis.results) {
    const bit = 1 << getRestriction(r.id)!.bit;
    if (r.status === 'avoid') avoidMask |= bit;
    if (r.status === 'caution' || r.status === 'unknown') unsureMask |= bit;
  }
  return { avoidMask, unsureMask };
}
