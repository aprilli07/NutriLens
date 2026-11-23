/**
 * Product search: typo correction + prefix autocomplete + dietary filters on top of MySQL full-text search.
 */
import { restrictionMask } from '../lib/restrictions';
import { tokenize } from '../lib/text';
import type { RestrictionId, SearchResponse } from '../lib/types';
import type { Repo } from './repo';
import type { SpellIndex } from './spell';

/** InnoDB ignores tokens shorter than innodb_ft_min_token_size (3 by default). */
const MIN_FT_TOKEN = 3;
const MAX_TOKENS = 6;

export interface PlannedQuery {
  expression: string | null;
  corrected: string[];
}

/**
 * Turn raw user input into a boolean-mode expression. Every word is required; the last word is a
 * prefix so results update as the user types; unknown words are replaced by their closest known word.
 */
export function planQuery(raw: string, spell: SpellIndex | null): PlannedQuery {
  const tokens = tokenize(raw).slice(0, MAX_TOKENS);
  const corrected = tokens.map((t, i) => {
    if (!spell || /^\d+$/.test(t)) return t;
    const isLast = i === tokens.length - 1;
    if (isLast && !spell.has(t) && spell.complete(t, 1).length) return t; // user is still typing this word
    return spell.correct(t) ?? t;
  });
  const parts = corrected
    .map((t, i) => ({ t, last: i === corrected.length - 1 }))
    .filter(({ t, last }) => t.length >= MIN_FT_TOKEN || (last && t.length >= 2))
    .map(({ t, last }) => (last ? `+${t}*` : `+${t}`));
  return { expression: parts.length ? parts.join(' ') : null, corrected };
}

export async function searchProducts(
  repo: Repo,
  spell: SpellIndex | null,
  query: string,
  restrictions: RestrictionId[],
  limit: number,
): Promise<SearchResponse> {
  const started = performance.now();
  const excludeMask = restrictionMask(restrictions);
  let plan = planQuery(query, spell);
  let hits = plan.expression ? await repo.searchProducts({ expression: plan.expression, excludeMask, limit }) : [];

  // Nothing found: the query may contain a misspelling common enough to be in the vocabulary
  // ("hazlenut"). Retry once with every word swapped for a more common neighbour.
  if (hits.length === 0 && spell && plan.corrected.length) {
    const retry = plan.corrected.map((t) => spell.moreCommonNeighbour(t) ?? t);
    if (retry.some((t, i) => t !== plan.corrected[i])) {
      const retryPlan = planQuery(retry.join(' '), null);
      if (retryPlan.expression) {
        hits = await repo.searchProducts({ expression: retryPlan.expression, excludeMask, limit });
        if (hits.length) plan = retryPlan;
      }
    }
  }
  const correctedQuery = plan.corrected.join(' ');
  return {
    query,
    correctedQuery: correctedQuery !== tokenize(query).slice(0, MAX_TOKENS).join(' ') ? correctedQuery : undefined,
    hits,
    tookMs: Math.round((performance.now() - started) * 10) / 10,
  };
}
