// API service layer. Every request goes to `${VITE_API_URL}/api/...`
// (VITE_API_URL empty in development: /api is proxied to FastAPI by Vite).
// No secrets live in the frontend; the session token only identifies this browser's account.

export const API_URL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
export const apiUrl = (path: string) => `${API_URL}/api${path}`;

const TOKEN_KEY = "agrimind.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
}

export interface FieldError { field: string | null; message: string }

export class ApiError extends Error {
  status: number;
  code: string | null;
  detail: unknown;
  constructor(status: number, message: string, code: string | null = null, detail: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
  get fieldErrors(): FieldError[] {
    return this.code === "validation" && Array.isArray(this.detail) ? (this.detail as FieldError[]) : [];
  }
  /** 503 from a model that is not configured / failed to load */
  get unavailable() { return this.status === 503; }
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal; timeoutMs?: number };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: ctrl.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new ApiError(0, ctrl.signal.aborted
      ? "The server took too long to answer. Please try again."
      : `Cannot reach the AgriMind server at ${API_URL || window.location.origin}. It may be starting up (wait a minute), or it is blocked by CORS.`, "network");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = data?.error;
    const fallback = typeof data?.detail === "string" ? data.detail
      : text && !text.trimStart().startsWith("<") ? text.slice(0, 300) : `${res.status} ${res.statusText}`.trim();
    throw new ApiError(res.status, err?.message ?? `Request failed: ${fallback}`, err?.code ?? null, err?.detail ?? null);
  }
  if (data === null && text) {
    // e.g. an HTML page: the request went to the static site instead of the API
    throw new ApiError(res.status, `The server at ${API_URL || window.location.origin} did not answer with JSON. Check VITE_API_URL.`, "bad_response");
  }
  return data as T;
}

export const qs = (params: Record<string, string | number | undefined | null | boolean>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : "";
};
