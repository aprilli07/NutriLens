import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { restrictionMask } from '../lib/restrictions';
import type { Product, RestrictionId, ScanRecord, SearchHit } from '../lib/types';
import { computeMasks } from '../lib/analyzer';
import { createApp } from '../server/app';
import type { Explainer } from '../server/gemini';
import type { FullTextQuery, Repo, UserRecord } from '../server/repo';

const NUTELLA: Product = {
  code: '3017620422003',
  name: 'Nutella',
  brands: 'Ferrero',
  ingredientsText: 'Sugar, palm oil, hazelnuts 13%, skimmed milk powder 8.7%, fat-reduced cocoa 7.4%, emulsifier: lecithins (soya), vanillin',
  allergenTags: ['en:milk', 'en:nuts', 'en:soybeans'],
  nutrition: { sugars: 56.3, salt: 0.107 },
};
const RICE_CAKES: Product = { code: '0000000000001', name: 'Plain rice cakes', ingredientsText: 'Whole grain brown rice', nutrition: { sugars: 0.5, salt: 0.1 } };

/** Minimal in-memory Repo that mimics the MySQL behaviour the routes rely on. */
class MemoryRepo implements Repo {
  products = new Map<string, Product>([NUTELLA, RICE_CAKES].map((p) => [p.code, p]));
  users: UserRecord[] = [];
  scans: Array<ScanRecord & { userId: number }> = [];
  cache = new Map<string, unknown>();

  async searchProducts(q: FullTextQuery): Promise<SearchHit[]> {
    const words = q.expression.split(' ').map((w) => w.replace(/[+*]/g, ''));
    return [...this.products.values()]
      .filter((p) => words.every((w) => `${p.name} ${p.brands ?? ''}`.toLowerCase().includes(w)))
      .filter((p) => {
        const m = computeMasks(p);
        return ((m.avoidMask | m.unsureMask) & q.excludeMask) === 0;
      })
      .slice(0, q.limit)
      .map((p) => ({ code: p.code, name: p.name, brands: p.brands }));
  }
  async getProduct(code: string) { return this.products.get(code) ?? null; }
  async saveProduct(p: Product) { this.products.set(p.code, p); }
  async loadSearchTerms() { return []; }
  async createUser(email: string, passwordHash: string, displayName: string | null) {
    const u = { id: this.users.length + 1, email, passwordHash, displayName, restrictions: [] as RestrictionId[] };
    this.users.push(u);
    return u;
  }
  async findUserByEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async findUserById(id: number) { return this.users.find((u) => u.id === id) ?? null; }
  async setRestrictions(id: number, r: RestrictionId[]) { this.users.find((u) => u.id === id)!.restrictions = r; }
  async addScan(userId: number, s: Omit<ScanRecord, 'id' | 'scannedAt'>) {
    const rec = { ...s, id: this.scans.length + 1, scannedAt: new Date().toISOString(), userId };
    this.scans.push(rec);
    return rec;
  }
  async listScans(userId: number) { return this.scans.filter((s) => s.userId === userId).reverse(); }
  async deleteScan(userId: number, id: number) {
    const before = this.scans.length;
    this.scans = this.scans.filter((s) => !(s.id === id && s.userId === userId));
    return this.scans.length < before;
  }
  async getCached(k: string) { return this.cache.get(k) ?? null; }
  async setCached(k: string, v: unknown) { this.cache.set(k, v); }
}

let repo: MemoryRepo;
let remoteCalls: string[];
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  repo = new MemoryRepo();
  remoteCalls = [];
  app = createApp({
    repo,
    jwtSecret: 'test-secret',
    rateLimit: false,
    lookupRemote: async (code) => {
      remoteCalls.push(code);
      return code === '5000000000005' ? { code, name: 'New Crackers', ingredientsText: 'Wheat flour, salt' } : null;
    },
  });
});

async function signUp(email = 'parent@example.com') {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'correct-horse' });
  expect(res.status).toBe(201);
  return res.body.token as string;
}

describe('auth', () => {
  it('registers, stores a bcrypt hash and logs in', async () => {
    await signUp();
    expect(repo.users[0].passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const ok = await request(app).post('/api/auth/login').send({ email: 'PARENT@example.com ', password: 'correct-horse' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects wrong passwords and duplicate accounts', async () => {
    await signUp();
    expect((await request(app).post('/api/auth/login').send({ email: 'parent@example.com', password: 'wrong-password' })).status).toBe(401);
    expect((await request(app).post('/api/auth/register').send({ email: 'parent@example.com', password: 'another-one' })).status).toBe(409);
  });

  it('validates input', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('protects household routes', async () => {
    expect((await request(app).get('/api/scans')).status).toBe(401);
    expect((await request(app).get('/api/scans').set('Authorization', 'Bearer forged')).status).toBe(401);
  });
});

describe('restrictions and products', () => {
  it('saves restrictions and uses them for analysis', async () => {
    const token = await signUp();
    const put = await request(app).put('/api/me/restrictions').set('Authorization', `Bearer ${token}`).send({ restrictions: ['dairyFree', 'nutFree'] });
    expect(put.body.restrictions).toEqual(['dairyFree', 'nutFree']);

    const res = await request(app).get(`/api/products/${NUTELLA.code}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.analysis.verdict).toBe('avoid');
    expect(res.body.analysis.results.map((r: any) => r.status)).toEqual(['avoid', 'avoid']);
  });

  it('rejects unknown restriction ids', async () => {
    const token = await signUp();
    const res = await request(app).put('/api/me/restrictions').set('Authorization', `Bearer ${token}`).send({ restrictions: ['keto'] });
    expect(res.status).toBe(400);
  });

  it('fetches new barcodes from Open Food Facts and stores them', async () => {
    const res = await request(app).get('/api/products/5000000000005?restrictions=glutenFree');
    expect(res.body.source).toBe('openfoodfacts');
    expect(res.body.analysis.verdict).toBe('avoid');
    expect(repo.products.has('5000000000005')).toBe(true);
  });

  it('merges a stale stored copy with live data without losing warnings', async () => {
    // Stored copy has a truncated ingredient list and no allergen tags; live data declares milk.
    repo.products.set('7', { code: '7', name: 'Spread', ingredientsText: 'Sugar, palm oil, hazelnuts', allergenTags: [] });
    app = createApp({
      repo, jwtSecret: 'test-secret', rateLimit: false,
      lookupRemote: async () => ({ code: '7', name: 'Spread', ingredientsText: 'Sugar, palm oil', allergenTags: ['en:milk'] }),
    });
    const res = await request(app).get('/api/products/7?restrictions=dairyFree,nutFree');
    expect(res.body.source).toBe('merged');
    expect(res.body.product.ingredientsText).toBe('Sugar, palm oil, hazelnuts');
    expect(res.body.analysis.results.map((r: any) => r.status)).toEqual(['avoid', 'avoid']);
  });

  it('uses the stored copy when Open Food Facts is unreachable', async () => {
    app = createApp({ repo, jwtSecret: 'test-secret', rateLimit: false, lookupRemote: async () => { throw new Error('offline'); } });
    const res = await request(app).get(`/api/products/${NUTELLA.code}?restrictions=dairyFree`);
    expect(res.body.source).toBe('database');
    expect(res.body.analysis.verdict).toBe('avoid');
  });

  it('returns 404 for unknown barcodes and 400 for garbage', async () => {
    expect((await request(app).get('/api/products/9999999999999')).status).toBe(404);
    expect(remoteCalls).toContain('9999999999999');
    expect((await request(app).get('/api/products/%27%3B%20DROP')).status).toBe(400);
  });
});

describe('search', () => {
  it('filters out products that break the restrictions', async () => {
    const all = await request(app).get('/api/search?q=nutella');
    expect(all.body.hits).toHaveLength(1);
    const filtered = await request(app).get('/api/search?q=nutella&restrictions=dairyFree');
    expect(filtered.body.hits).toHaveLength(0);
    expect(typeof filtered.body.tookMs).toBe('number');
  });

  it('passes the right mask to the repository', async () => {
    let seen = -1;
    repo.searchProducts = async (q) => { seen = q.excludeMask; return []; };
    await request(app).get('/api/search?q=rice&restrictions=vegan,nutFree,bogus');
    expect(seen).toBe(restrictionMask(['vegan', 'nutFree']));
  });
});

describe('scans', () => {
  it('records scans for the household and lists newest first', async () => {
    const token = await signUp();
    await request(app).put('/api/me/restrictions').set('Authorization', `Bearer ${token}`).send({ restrictions: ['vegan'] });
    const a = await request(app).post('/api/scans').set('Authorization', `Bearer ${token}`).send({ code: RICE_CAKES.code });
    expect(a.status).toBe(201);
    expect(a.body.scan.verdict).toBe('good');
    await request(app).post('/api/scans').set('Authorization', `Bearer ${token}`).send({ code: NUTELLA.code });

    const list = await request(app).get('/api/scans').set('Authorization', `Bearer ${token}`);
    expect(list.body.map((s: ScanRecord) => s.name)).toEqual(['Nutella', 'Plain rice cakes']);

    const other = await signUp('other@example.com');
    expect((await request(app).get('/api/scans').set('Authorization', `Bearer ${other}`)).body).toEqual([]);
    expect((await request(app).delete(`/api/scans/${a.body.scan.id}`).set('Authorization', `Bearer ${other}`)).status).toBe(404);
  });
});

describe('AI layer', () => {
  it('can raise a warning but never clear one, and caches responses', async () => {
    let calls = 0;
    const explainer: Explainer = {
      async explain() {
        calls++;
        return { explanation: 'Rice cakes are made from rice.', alternatives: ['Apple slices'], concerns: [{ restriction: 'vegan', ingredient: 'brown rice' }] };
      },
    };
    app = createApp({ repo, jwtSecret: 'test-secret', rateLimit: false, explainer });
    const res = await request(app).get(`/api/products/${RICE_CAKES.code}?restrictions=vegan&explain=1`);
    expect(res.body.analysis.verdict).toBe('caution');
    expect(res.body.analysis.ai.alternatives).toEqual(['Apple slices']);

    const nutella = await request(app).get(`/api/products/${NUTELLA.code}?restrictions=dairyFree&explain=1`);
    expect(nutella.body.analysis.verdict).toBe('avoid');

    await request(app).get(`/api/products/${RICE_CAKES.code}?restrictions=vegan&explain=1`);
    expect(calls).toBe(2);
  });

  it('falls back to rules when the AI call fails', async () => {
    const explainer: Explainer = { async explain() { throw new Error('quota'); } };
    app = createApp({ repo, jwtSecret: 'test-secret', rateLimit: false, explainer });
    const res = await request(app).get(`/api/products/${NUTELLA.code}?restrictions=nutFree&explain=1`);
    expect(res.status).toBe(200);
    expect(res.body.analysis.verdict).toBe('avoid');
    expect(res.body.analysis.ai).toBeUndefined();
  });
});
