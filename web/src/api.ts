export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  json?: unknown;
  body?: BodyInit;
  token?: boolean;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

let memoizedToken: string | null = null;
let inflightToken: Promise<string> | null = null;

export async function getApiToken(
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  if (memoizedToken) return memoizedToken;
  if (!inflightToken) {
    inflightToken = (async () => {
      const res = await fetchFn("/api/session");
      const data = (await res.json()) as { token: string };
      memoizedToken = data.token;
      return memoizedToken;
    })();
  }
  try {
    return await inflightToken;
  } finally {
    inflightToken = null;
  }
}

export function resetApiToken() {
  memoizedToken = null;
  inflightToken = null;
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const fetchFn = opts.fetch ?? fetch;
  const method = opts.method ?? (opts.json !== undefined ? "POST" : "GET");
  const needsToken = opts.token ?? method !== "GET";
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
  } else if (opts.body !== undefined) {
    body = opts.body;
  }
  const request = async () => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.json !== undefined) headers["content-type"] = "application/json";
    if (needsToken) headers["x-solaris-token"] = await getApiToken(fetchFn);
    return fetchFn(path, { method, headers, body });
  };
  let res = await request();
  if (needsToken && res.status === 403) {
    resetApiToken();
    res = await request();
  }
  return parseResponse<T>(res);
}

export async function apiRaw(
  path: string,
  init?: RequestInit & { token?: boolean },
): Promise<Response> {
  if (!init?.token) return fetch(path, init);
  const token = await getApiToken();
  const headers = new Headers(init.headers);
  headers.set("x-solaris-token", token);
  return fetch(path, { ...init, headers });
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, parsed);
  }
  return parsed as T;
}
