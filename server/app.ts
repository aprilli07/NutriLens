/**
 * Express app factory. All dependencies are injected so tests can run without MySQL or network.
 */
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { analyzeProduct } from '../lib/analyzer';
import { RESTRICTION_IDS, isRestrictionId } from '../lib/restrictions';
import type { Analysis, Product, RestrictionId } from '../lib/types';
import { Explainer, cacheKey, mergeAi } from './gemini';
import { fetchFromOpenFoodFacts } from './off';
import type { Repo, UserRecord } from './repo';
import { searchProducts } from './search';
import type { SpellIndex } from './spell';

const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

/** Prefer fresh data, but never drop a warning that either copy has. */
export function mergeProducts(stored: Product, live: Product): Product {
  const a = stored.ingredientsText ?? '';
  const b = live.ingredientsText ?? '';
  return {
    ...stored,
    ...live,
    brands: live.brands || stored.brands,
    imageUrl: live.imageUrl || stored.imageUrl,
    ingredientsText: (b.length >= a.length ? b : a) || null,
    allergenTags: union(stored.allergenTags, live.allergenTags),
    traceTags: union(stored.traceTags, live.traceTags),
    labelTags: live.labelTags?.length ? live.labelTags : stored.labelTags,
    nutrition: { ...stored.nutrition, ...Object.fromEntries(Object.entries(live.nutrition ?? {}).filter(([, v]) => v != null)) },
  };
}

export interface AppDeps {
  repo: Repo;
  jwtSecret: string;
  spell?: SpellIndex | null;
  explainer?: Explainer | null;
  lookupRemote?: (code: string) => Promise<Product | null>;
  /** Disable rate limiting in tests. */
  rateLimit?: boolean;
}

interface AuthedRequest extends Request {
  userId?: number;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const restrictionList = z.array(z.enum(RESTRICTION_IDS as [RestrictionId, ...RestrictionId[]])).max(RESTRICTION_IDS.length);
const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
const registerBody = credentials.extend({ displayName: z.string().trim().max(100).optional() });

function parseRestrictionParam(value: unknown): RestrictionId[] {
  if (typeof value !== 'string' || !value) return [];
  return value.split(',').filter(isRestrictionId);
}

function publicUser(u: UserRecord) {
  return { id: u.id, email: u.email, displayName: u.displayName, restrictions: u.restrictions };
}

const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req as AuthedRequest, res).catch(next);

export function createApp(deps: AppDeps) {
  const { repo, jwtSecret, spell = null, explainer = null } = deps;
  const lookupRemote = deps.lookupRemote ?? ((code: string) => fetchFromOpenFoodFacts(code));
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '50kb' }));

  const authLimiter = deps.rateLimit === false
    ? (_req: Request, _res: Response, next: NextFunction) => next()
    : rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

  const sign = (u: UserRecord) => jwt.sign({ sub: String(u.id) }, jwtSecret, { expiresIn: '30d' });

  const readUserId = (req: Request): number | undefined => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return undefined;
    try {
      const payload = jwt.verify(header.slice(7), jwtSecret) as jwt.JwtPayload;
      return Number(payload.sub);
    } catch {
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
  };

  const optionalAuth = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      req.userId = readUserId(req);
      next();
    } catch (e) {
      next(e);
    }
  };
  const requireAuth = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    try {
      req.userId = readUserId(req);
      if (!req.userId) throw new HttpError(401, 'Please sign in.');
      next();
    } catch (e) {
      next(e);
    }
  };

  /** Restrictions from the query string, else the signed-in household's saved restrictions. */
  const resolveRestrictions = async (req: AuthedRequest): Promise<RestrictionId[]> => {
    if (typeof req.query.restrictions === 'string') return parseRestrictionParam(req.query.restrictions);
    if (!req.userId) return [];
    return (await repo.findUserById(req.userId))?.restrictions ?? [];
  };

  /**
   * Safety-critical lookups always try live Open Food Facts first, because the imported snapshot can be
   * stale. Live and stored copies are merged conservatively; the stored copy alone is the offline fallback.
   */
  const loadProduct = async (code: string): Promise<{ product: Product; source: 'database' | 'openfoodfacts' | 'merged' }> => {
    if (!/^[0-9A-Za-z-]{1,64}$/.test(code)) throw new HttpError(400, 'That does not look like a barcode.');
    const [local, remote] = await Promise.all([repo.getProduct(code), lookupRemote(code).catch(() => null)]);
    if (!local && !remote) throw new HttpError(404, "We couldn't find this product yet.");
    if (!remote) return { product: local!, source: 'database' };
    const product = local ? mergeProducts(local, remote) : remote;
    await repo.saveProduct(product).catch(() => undefined);
    return { product, source: local ? 'merged' : 'openfoodfacts' };
  };

  const analyze = async (product: Product, restrictions: RestrictionId[], withAi: boolean): Promise<Analysis> => {
    const base = analyzeProduct(product, restrictions);
    if (!withAi || !explainer || restrictions.length === 0) return base;
    const key = cacheKey(product.code, restrictions);
    try {
      let ai = (await repo.getCached(key)) as Awaited<ReturnType<Explainer['explain']>> | null;
      if (!ai) {
        ai = await explainer.explain(product, base, restrictions);
        await repo.setCached(key, ai);
      }
      return mergeAi(base, ai);
    } catch (err) {
      console.warn('AI explanation skipped:', (err as Error).message);
      return base;
    }
  };

  // ---------- health ----------
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ai: Boolean(explainer), searchTerms: spell?.size ?? 0 });
  });

  app.get('/api/restrictions', (_req, res) => {
    res.json(RESTRICTION_IDS);
  });

  // ---------- auth ----------
  app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
    const body = registerBody.parse(req.body);
    if (await repo.findUserByEmail(body.email)) throw new HttpError(409, 'An account with that email already exists.');
    const user = await repo.createUser(body.email, await bcrypt.hash(body.password, 12), body.displayName || null);
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  }));

  app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
    const body = credentials.parse(req.body);
    const user = await repo.findUserByEmail(body.email);
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, 'Wrong email or password.');
    }
    res.json({ token: sign(user), user: publicUser(user) });
  }));

  app.get('/api/me', requireAuth, wrap(async (req, res) => {
    const user = await repo.findUserById(req.userId!);
    if (!user) throw new HttpError(401, 'Please sign in.');
    res.json(publicUser(user));
  }));

  app.put('/api/me/restrictions', requireAuth, wrap(async (req, res) => {
    const restrictions = restrictionList.parse(req.body?.restrictions);
    await repo.setRestrictions(req.userId!, [...new Set(restrictions)]);
    const user = await repo.findUserById(req.userId!);
    res.json(publicUser(user!));
  }));

  // ---------- search ----------
  app.get('/api/search', optionalAuth, wrap(async (req, res) => {
    const q = String(req.query.q ?? '').slice(0, 100);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    res.json(await searchProducts(repo, spell, q, await resolveRestrictions(req), limit));
  }));

  // ---------- products ----------
  app.get('/api/products/:code', optionalAuth, wrap(async (req, res) => {
    const { product, source } = await loadProduct(String(req.params.code));
    const restrictions = await resolveRestrictions(req);
    const analysis = await analyze(product, restrictions, req.query.explain === '1');
    res.json({ product, source, restrictions, analysis });
  }));

  // ---------- scans (household history) ----------
  app.post('/api/scans', requireAuth, wrap(async (req, res) => {
    const code = z.object({ code: z.string().trim().min(1).max(64) }).parse(req.body).code;
    const { product, source } = await loadProduct(code);
    const restrictions = await resolveRestrictions(req);
    const analysis = await analyze(product, restrictions, true);
    const scan = await repo.addScan(req.userId!, {
      code: product.code,
      name: product.name,
      imageUrl: product.imageUrl,
      verdict: analysis.verdict,
      restrictions,
    });
    res.status(201).json({ scan, product, source, restrictions, analysis });
  }));

  app.get('/api/scans', requireAuth, wrap(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    res.json(await repo.listScans(req.userId!, limit));
  }));

  app.delete('/api/scans/:id', requireAuth, wrap(async (req, res) => {
    const ok = await repo.deleteScan(req.userId!, Number(req.params.id));
    if (!ok) throw new HttpError(404, 'Scan not found.');
    res.status(204).end();
  }));

  // ---------- errors ----------
  app.use((_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
    } else if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return app;
}
