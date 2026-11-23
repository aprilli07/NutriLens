import 'dotenv/config';
import crypto from 'node:crypto';
import { createApp } from './app';
import { createPool, migrate } from './db';
import { createGeminiExplainer, GEMINI_MODEL } from './gemini';
import { MySqlRepo } from './repo';
import { SpellIndex } from './spell';

const SPELL_TERMS = 250_000;

async function main() {
  const pool = createPool();
  await migrate(pool);
  const repo = new MySqlRepo(pool);

  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production.');
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('JWT_SECRET not set: using a random secret, so sessions reset when the server restarts.');
  }

  const t = Date.now();
  const spell = new SpellIndex(await repo.loadSearchTerms(SPELL_TERMS));
  console.log(`Loaded ${spell.size.toLocaleString()} search terms in ${Date.now() - t} ms.`);

  const explainer = createGeminiExplainer(process.env.GEMINI_API_KEY);
  console.log(explainer ? `AI explanations on (${GEMINI_MODEL}).` : 'AI explanations off (set GEMINI_API_KEY to enable).');

  const port = Number(process.env.PORT) || 5001;
  createApp({ repo, jwtSecret, spell, explainer }).listen(port, () => {
    console.log(`NutriLens API listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
