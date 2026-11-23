/** Create or update the database schema: `npm run db:migrate`. */
import 'dotenv/config';
import { createPool, migrate } from '../server/db';

(async () => {
  const pool = createPool();
  await migrate(pool);
  await pool.end();
  console.log('Database schema is up to date.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
