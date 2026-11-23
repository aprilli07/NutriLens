/**
 * Typed client for the NutriLens API.
 */
import { Platform } from 'react-native';
import type { Analysis, Product, RestrictionId, ScanRecord, SearchResponse } from './types';

function defaultBaseUrl(): string {
  // The Android emulator reaches the host machine through 10.0.2.2; iOS simulator and web use localhost.
  return Platform.OS === 'android' ? 'http://10.0.2.2:5001' : 'http://localhost:5001';
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || defaultBaseUrl()).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface User {
  id: number;
  email: string;
  displayName: string | null;
  restrictions: RestrictionId[];
}

export interface ProductResponse {
  product: Product;
  source: 'database' | 'openfoodfacts' | 'merged';
  restrictions: RestrictionId[];
  analysis: Analysis;
}

export interface ScanResponse extends ProductResponse {
  scan: ScanRecord;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, `Can't reach the NutriLens server at ${API_URL}. Is it running?`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || `Request failed (${res.status})`);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  register: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/register', json('POST', { email, password })),
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', json('POST', { email, password })),
  me: () => request<User>('/api/me'),
  setRestrictions: (restrictions: RestrictionId[]) => request<User>('/api/me/restrictions', json('PUT', { restrictions })),

  search: (q: string, opts: { restrictions?: RestrictionId[]; limit?: number; signal?: AbortSignal } = {}) => {
    const params = new URLSearchParams({ q, limit: String(opts.limit ?? 20) });
    if (opts.restrictions) params.set('restrictions', opts.restrictions.join(','));
    return request<SearchResponse>(`/api/search?${params}`, { signal: opts.signal });
  },

  product: (code: string, explain = true) =>
    request<ProductResponse>(`/api/products/${encodeURIComponent(code)}${explain ? '?explain=1' : ''}`),

  scan: (code: string) => request<ScanResponse>('/api/scans', json('POST', { code })),
  scans: (limit = 50) => request<ScanRecord[]>(`/api/scans?limit=${limit}`),
  deleteScan: (id: number) => request<void>(`/api/scans/${id}`, { method: 'DELETE' }),
};
