/**
 * Data access. The routes depend on the `Repo` interface so tests can swap in an in-memory version.
 */
import type mysql from 'mysql2/promise';
import { computeMasks } from '../lib/analyzer';
import type { Product, RestrictionId, ScanRecord, SearchHit, Verdict } from '../lib/types';
import { POPULAR_MIN_SCANS, type Pool } from './db';
import { PRODUCT_COLUMNS, ProductRow, productToRowValues, rowToProduct } from './products';

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  displayName: string | null;
  restrictions: RestrictionId[];
}

export interface FullTextQuery {
  /** MySQL boolean-mode expression, e.g. `+nutella* +ferrero`. */
  expression: string;
  /** Exclude products that are "avoid" or "unknown" for any restriction in this mask. */
  excludeMask: number;
  limit: number;
}

export interface Repo {
  searchProducts(q: FullTextQuery): Promise<SearchHit[]>;
  getProduct(code: string): Promise<Product | null>;
  saveProduct(product: Product): Promise<void>;
  loadSearchTerms(limit: number): Promise<Array<[string, number]>>;

  createUser(email: string, passwordHash: string, displayName: string | null): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: number): Promise<UserRecord | null>;
  setRestrictions(userId: number, restrictions: RestrictionId[]): Promise<void>;

  addScan(userId: number, scan: Omit<ScanRecord, 'id' | 'scannedAt'>): Promise<ScanRecord>;
  listScans(userId: number, limit: number): Promise<ScanRecord[]>;
  deleteScan(userId: number, scanId: number): Promise<boolean>;

  getCached(key: string): Promise<unknown | null>;
  setCached(key: string, payload: unknown): Promise<void>;
}

type Row = mysql.RowDataPacket;

/** Time budget for the long-tail search tier. */
const TAIL_BUDGET_MS = 120;
/** MySQL error 3024: query exceeded MAX_EXECUTION_TIME. */
const ER_QUERY_TIMEOUT = 3024;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toUser(r: Row): UserRecord {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    displayName: r.display_name,
    restrictions: parseJson<RestrictionId[]>(r.restrictions, []),
  };
}

function toScan(r: Row): ScanRecord {
  return {
    id: Number(r.id),
    code: r.code,
    name: r.name,
    imageUrl: r.image_url,
    verdict: r.verdict as Verdict,
    restrictions: parseJson<RestrictionId[]>(r.restrictions, []),
    scannedAt: new Date(r.scanned_at).toISOString(),
  };
}

export class MySqlRepo implements Repo {
  constructor(private pool: Pool) {}

  async searchProducts({ expression, excludeMask, limit }: FullTextQuery): Promise<SearchHit[]> {
    // Tier 1: popular products, ranked by popularity (small table, stays in memory).
    const [popular] = await this.pool.query<Row[]>(
      `SELECT code, name, brands, image_url, nutriscore
         FROM product_search
        WHERE MATCH(name, brands) AGAINST (? IN BOOLEAN MODE)
          AND ((avoid_mask | unsure_mask) & ?) = 0
        ORDER BY id
        LIMIT ?`,
      [expression, excludeMask, limit],
    );
    let rows = popular;
    if (rows.length < limit) {
      // Tier 2: the long tail of all 4.5M+ products. No ORDER BY, so MySQL stops at LIMIT.
      // It is best-effort: if a rare filter makes it scan too long, return tier 1 alone.
      const [tail] = await this.pool.query<Row[]>(
        `SELECT /*+ MAX_EXECUTION_TIME(${TAIL_BUDGET_MS}) */ code, name, brands, image_url, nutriscore
           FROM products
          WHERE MATCH(name, brands) AGAINST (? IN BOOLEAN MODE)
            AND ((avoid_mask | unsure_mask) & ?) = 0
            AND scans < ?
          LIMIT ?`,
        [expression, excludeMask, POPULAR_MIN_SCANS, limit - rows.length],
      ).catch((err) => {
        if (err?.errno === ER_QUERY_TIMEOUT) return [[] as Row[]] as const;
        throw err;
      });
      rows = [...rows, ...tail];
    }
    return rows.map((r) => ({ code: r.code, name: r.name, brands: r.brands, imageUrl: r.image_url, nutriscore: r.nutriscore }));
  }

  async getProduct(code: string): Promise<Product | null> {
    const [rows] = await this.pool.query<Row[]>(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE code = ?`, [code]);
    return rows.length ? rowToProduct(rows[0] as unknown as ProductRow) : null;
  }

  async saveProduct(product: Product): Promise<void> {
    const v = productToRowValues(product, {});
    const { avoidMask, unsureMask } = computeMasks(product);
    const row = { ...v, avoid_mask: avoidMask, unsure_mask: unsureMask };
    const cols = Object.keys(row);
    await this.pool.query(
      `INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
       ON DUPLICATE KEY UPDATE ${cols.filter((c) => c !== 'code' && c !== 'scans').map((c) => `${c} = VALUES(${c})`).join(', ')}`,
      Object.values(row),
    );
  }

  async loadSearchTerms(limit: number): Promise<Array<[string, number]>> {
    const [rows] = await this.pool.query<Row[]>('SELECT term, freq FROM search_terms ORDER BY freq DESC LIMIT ?', [limit]);
    return rows.map((r) => [r.term, r.freq]);
  }

  async createUser(email: string, passwordHash: string, displayName: string | null): Promise<UserRecord> {
    const [res] = await this.pool.query<mysql.ResultSetHeader>(
      'INSERT INTO users (email, password_hash, display_name, restrictions) VALUES (?, ?, ?, ?)',
      [email, passwordHash, displayName, '[]'],
    );
    return { id: res.insertId, email, passwordHash, displayName, restrictions: [] };
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.query<Row[]>('SELECT * FROM users WHERE email = ?', [email]);
    return rows.length ? toUser(rows[0]) : null;
  }

  async findUserById(id: number): Promise<UserRecord | null> {
    const [rows] = await this.pool.query<Row[]>('SELECT * FROM users WHERE id = ?', [id]);
    return rows.length ? toUser(rows[0]) : null;
  }

  async setRestrictions(userId: number, restrictions: RestrictionId[]): Promise<void> {
    await this.pool.query('UPDATE users SET restrictions = ? WHERE id = ?', [JSON.stringify(restrictions), userId]);
  }

  async addScan(userId: number, scan: Omit<ScanRecord, 'id' | 'scannedAt'>): Promise<ScanRecord> {
    const [res] = await this.pool.query<mysql.ResultSetHeader>(
      'INSERT INTO scans (user_id, code, name, image_url, verdict, restrictions) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, scan.code, scan.name.slice(0, 255), scan.imageUrl ?? null, scan.verdict, JSON.stringify(scan.restrictions)],
    );
    return { ...scan, id: res.insertId, scannedAt: new Date().toISOString() };
  }

  async listScans(userId: number, limit: number): Promise<ScanRecord[]> {
    const [rows] = await this.pool.query<Row[]>(
      'SELECT * FROM scans WHERE user_id = ? ORDER BY scanned_at DESC, id DESC LIMIT ?',
      [userId, limit],
    );
    return rows.map(toScan);
  }

  async deleteScan(userId: number, scanId: number): Promise<boolean> {
    const [res] = await this.pool.query<mysql.ResultSetHeader>('DELETE FROM scans WHERE id = ? AND user_id = ?', [scanId, userId]);
    return res.affectedRows > 0;
  }

  async getCached(key: string): Promise<unknown | null> {
    const [rows] = await this.pool.query<Row[]>('SELECT payload FROM ai_cache WHERE cache_key = ?', [key]);
    return rows.length ? parseJson(rows[0].payload, null) : null;
  }

  async setCached(key: string, payload: unknown): Promise<void> {
    await this.pool.query('REPLACE INTO ai_cache (cache_key, payload) VALUES (?, ?)', [key, JSON.stringify(payload)]);
  }
}
