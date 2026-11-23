import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

export type Pool = mysql.Pool;

export function createPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  return mysql.createPool({ uri: url, connectionLimit: 10, multipleStatements: false, decimalNumbers: true });
}

/** Apply server/schema.sql. Safe to run repeatedly. */
export async function migrate(pool: Pool): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const statement of statements) await pool.query(statement);

  // The full-text index is created separately so the importer can bulk-load first.
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'products' AND index_name = 'ft_products_name'",
  );
  if (rows.length === 0 && !process.env.SKIP_FULLTEXT) {
    await pool.query('ALTER TABLE products ADD FULLTEXT INDEX ft_products_name (name, brands)');
  }
}

/** Products with at least this many OFF scans go into the in-memory search tier. */
export const POPULAR_MIN_SCANS = 2;

/** Rebuild search tier 1 from `products`, ranked by popularity. */
export async function buildSearchTier(pool: Pool): Promise<number> {
  await pool.query('DROP TABLE IF EXISTS product_search');
  await migrate(pool); // recreates it empty, with its full-text index
  await pool.query('ALTER TABLE product_search DROP INDEX ft_search_name');
  const [res] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO product_search (id, code, name, brands, image_url, nutriscore, avoid_mask, unsure_mask)
     SELECT ROW_NUMBER() OVER (ORDER BY scans DESC, code), code, name, brands, image_url, nutriscore, avoid_mask, unsure_mask
       FROM products WHERE scans >= ?`,
    [POPULAR_MIN_SCANS],
  );
  await pool.query('ALTER TABLE product_search ADD FULLTEXT INDEX ft_search_name (name, brands)');
  return res.affectedRows;
}
