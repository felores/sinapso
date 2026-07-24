import type { ArticleResult, ResearchResponse, ResearchResult } from "./exa.js";

const SEARCH_URL = "https://api.search.tinyfish.ai/";
const FETCH_URL = "https://api.fetch.tinyfish.ai/";

export class TinyfishError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TinyfishOptions {
  fetch?: typeof fetch;
}

function errorFor(status: number): TinyfishError {
  if (status === 401)
    return new TinyfishError(
      "tinyfish-unauthorized",
      401,
      "Tinyfish rejected the API key.",
    );
  if (status === 402)
    return new TinyfishError(
      "tinyfish-payment-required",
      402,
      "Tinyfish account credit is required.",
    );
  if (status === 429)
    return new TinyfishError(
      "tinyfish-rate-limited",
      429,
      "Tinyfish is rate limited. Try again later.",
    );
  if (status >= 500)
    return new TinyfishError(
      "tinyfish-unavailable",
      502,
      "Tinyfish is temporarily unavailable.",
    );
  return new TinyfishError("tinyfish-failed", 502, "Tinyfish request failed.");
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok) throw errorFor(response.status);
  try {
    return await response.json();
  } catch {
    throw new TinyfishError(
      "tinyfish-malformed-response",
      502,
      "Tinyfish returned an invalid response.",
    );
  }
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function searchResults(raw: unknown): ResearchResult[] {
  const rows = (raw as { results?: unknown })?.results;
  if (!Array.isArray(rows))
    throw new TinyfishError(
      "tinyfish-malformed-response",
      502,
      "Tinyfish returned an invalid response.",
    );
  const mapped = rows.flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Record<string, unknown>;
    const url = string(r.url);
    if (!url) return [];
    const position = typeof r.position === "number" ? r.position : null;
    return [
      {
        title: string(r.title) ?? url,
        url,
        snippet: string(r.snippet) ?? "",
        publishedDate: string(r.date),
        author: null,
        score: position,
      },
    ];
  });
  return mapped.sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity));
}

function article(raw: unknown, requestedUrl: string): ArticleResult {
  const body = raw as { results?: unknown; errors?: unknown };
  const rows = Array.isArray(body?.results) ? body.results : [];
  const first = rows.find(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null,
  );
  if (!first) {
    if (Array.isArray(body?.errors) && body.errors.length)
      throw new TinyfishError(
        "tinyfish-fetch-failed",
        502,
        "Tinyfish could not fetch this URL.",
      );
    throw new TinyfishError(
      "tinyfish-malformed-response",
      502,
      "Tinyfish returned an invalid response.",
    );
  }
  const content = string(first.text);
  if (!content)
    throw new TinyfishError(
      "tinyfish-malformed-response",
      502,
      "Tinyfish returned an invalid response.",
    );
  return {
    url: string(first.final_url) ?? requestedUrl,
    title: string(first.title) ?? requestedUrl,
    content,
    publishedDate: string(first.published_date),
    author: string(first.author),
  };
}

export function createTinyfishAdapter(options: TinyfishOptions = {}) {
  const fetchFn = options.fetch ?? fetch;
  const headers = (key: string) => ({ "X-API-Key": key });
  return {
    async search(
      key: string,
      query: string,
      options: { language?: string } = {},
    ): Promise<ResearchResponse> {
      const url = new URL(SEARCH_URL);
      url.searchParams.set("query", query);
      if (options.language) url.searchParams.set("language", options.language);
      let response: Response;
      try {
        response = await fetchFn(url.toString(), { headers: headers(key) });
      } catch {
        throw new TinyfishError(
          "tinyfish-unavailable",
          502,
          "Tinyfish is temporarily unavailable.",
        );
      }
      return {
        results: searchResults(await responseJson(response)),
        answer: null,
      };
    },
    async fetch(key: string, url: string): Promise<ArticleResult> {
      let response: Response;
      try {
        response = await fetchFn(FETCH_URL, {
          method: "POST",
          headers: { ...headers(key), "content-type": "application/json" },
          body: JSON.stringify({ urls: [url], format: "markdown" }),
        });
      } catch {
        throw new TinyfishError(
          "tinyfish-unavailable",
          502,
          "Tinyfish is temporarily unavailable.",
        );
      }
      return article(await responseJson(response), url);
    },
  };
}
