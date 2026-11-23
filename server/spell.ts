/**
 * In-memory vocabulary for typo correction and word completion.
 *
 * Correction uses symmetric-delete lookup (SymSpell) for edit distance 1, which catches a
 * substitution, insertion, deletion or adjacent swap in O(word length) lookups, then falls back
 * to a bounded scan for distance 2 on longer words.
 */
import { editDistance } from '../lib/text';

/** A known word seen fewer times than this may be a misspelling... */
const RARE = 50;
/** ...if a neighbour one edit away is at least this many times more common. */
const DOMINANCE = 20;
/** Words seen at least this often are never swapped by the zero-results retry. */
const RETRY_MAX_FREQ = 500;

export class SpellIndex {
  private freq = new Map<string, number>();
  private deletes = new Map<string, string[]>();
  private sorted: string[] = [];
  private byFirstChar = new Map<string, string[]>();

  constructor(terms: Array<[string, number]>) {
    for (const [term, f] of terms) {
      this.freq.set(term, f);
      for (const d of this.deletions(term)) {
        const list = this.deletes.get(d);
        if (list) list.push(term);
        else this.deletes.set(d, [term]);
      }
      const k = term[0];
      const bucket = this.byFirstChar.get(k);
      if (bucket) bucket.push(term);
      else this.byFirstChar.set(k, [term]);
    }
    this.sorted = [...this.freq.keys()].sort();
  }

  get size(): number {
    return this.freq.size;
  }

  has(term: string): boolean {
    return this.freq.has(term);
  }

  private deletions(term: string): string[] {
    const out = [term];
    for (let i = 0; i < term.length; i++) out.push(term.slice(0, i) + term.slice(i + 1));
    return out;
  }

  /**
   * Best spelling for `word`, or null if nothing is close enough. A known word is kept unless it is
   * rare and a neighbour one edit away is far more common (e.g. "nutela" -> "nutella").
   */
  correct(word: string): string | null {
    if (word.length < 3) return this.freq.has(word) ? word : null;
    const own = this.freq.get(word);

    let best: string | null = null;
    let bestFreq = -1;
    for (const d of this.deletions(word)) {
      for (const c of this.deletes.get(d) ?? []) {
        if (c === word) continue;
        const f = this.freq.get(c)!;
        if (f > bestFreq && editDistance(word, c, 1) <= 1) {
          best = c;
          bestFreq = f;
        }
      }
    }
    if (own !== undefined) {
      return best && own < RARE && bestFreq >= own * DOMINANCE ? best : word;
    }
    if (best || word.length < 6) return best;

    // Distance 2 for longer unknown words: scan words with the same first letter and similar length.
    for (const c of this.byFirstChar.get(word[0]) ?? []) {
      if (Math.abs(c.length - word.length) > 2) continue;
      const f = this.freq.get(c)!;
      if (f > bestFreq && editDistance(word, c, 2) <= 2) {
        best = c;
        bestFreq = f;
      }
    }
    return best;
  }

  /**
   * For a rare word (likely a misspelling), the most common word one edit away that is more common
   * than it. Common words are left alone so a legitimately empty result isn't searched twice.
   */
  moreCommonNeighbour(word: string): string | null {
    const own = this.freq.get(word) ?? 0;
    if (own >= RETRY_MAX_FREQ) return null;
    let best: string | null = null;
    let bestFreq = own;
    for (const d of this.deletions(word)) {
      for (const c of this.deletes.get(d) ?? []) {
        const f = this.freq.get(c)!;
        if (c !== word && f > bestFreq && editDistance(word, c, 1) <= 1) {
          best = c;
          bestFreq = f;
        }
      }
    }
    return best;
  }

  /** Most frequent known words starting with `prefix`. */
  complete(prefix: string, limit = 5): string[] {
    let lo = 0;
    let hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    const matches: string[] = [];
    for (let i = lo; i < this.sorted.length && matches.length < 5000; i++) {
      if (!this.sorted[i].startsWith(prefix)) break;
      matches.push(this.sorted[i]);
    }
    return matches.sort((a, b) => this.freq.get(b)! - this.freq.get(a)!).slice(0, limit);
  }
}
