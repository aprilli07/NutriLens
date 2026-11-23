/** Rebuild the popular-products search tier without re-importing: `npm run db:build-search`. */
import 'dotenv/config';
import { buildSearchTier, createPool } from '../server/db';

(async () => {
  const pool = createPool();
  const t = Date.now();
  const n = await buildSearchTier(pool);
  await pool.end();
  console.log(`Search tier 1 rebuilt with ${n.toLocaleString()} products in ${Math.round((Date.now() - t) / 1000)}s.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
