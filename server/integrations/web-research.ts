import type { ResearchAnswer, ResearchResponse } from "./exa.js";

export type HostedWebProvider = "google" | "openai" | "xai";

export interface HostedWebResearchOptions {
  fetch?: typeof fetch;
}

const PROVIDERS: Record<
  HostedWebProvider,
  { endpoint: string; model: string }
> = {
  google: {
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
    model: "gemini-3.5-flash",
  },
  openai: {
    endpoint: "https://api.openai.com/v1/responses",
    model: "gpt-5.6",
  },
  xai: {
    endpoint: "https://api.x.ai/v1/responses",
    model: "grok-4.5",
  },
};

function uniqueCitations(
  values: Array<string | { url?: unknown; title?: unknown }>,
): ResearchAnswer["citations"] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const url = typeof value === "string" ? value : value.url;
    if (typeof url !== "string" || seen.has(url)) return [];
    seen.add(url);
    return [
      {
        url,
        title:
          typeof value !== "string" &&
          typeof value.title === "string" &&
          value.title
            ? value.title
            : url,
      },
    ];
  });
}

function mapResponsesApi(raw: unknown): ResearchAnswer | null {
  const data = raw as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        text?: unknown;
        annotations?: Array<{
          type?: unknown;
          url?: unknown;
          title?: unknown;
        }>;
      }>;
    }>;
    citations?: Array<string | { url?: unknown; title?: unknown }>;
  };
  const contentItems = (data.output ?? []).flatMap(
    (item) => item.content ?? [],
  );
  const content =
    typeof data.output_text === "string"
      ? data.output_text
      : contentItems
          .map((item) => (typeof item.text === "string" ? item.text : ""))
          .join("\n")
          .trim();
  if (!content) return null;
  const annotations = contentItems.flatMap((item) => item.annotations ?? []);
  return {
    content,
    citations: uniqueCitations([
      ...annotations.filter((a) => a.type === "url_citation"),
      ...(data.citations ?? []),
    ]),
  };
}

function mapGoogle(raw: unknown): ResearchAnswer | null {
  const candidate = (
    raw as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: unknown }> };
        groundingMetadata?: {
          groundingChunks?: Array<{
            web?: { uri?: unknown; title?: unknown };
          }>;
        };
      }>;
    }
  ).candidates?.[0];
  const content = (candidate?.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
  if (!content) return null;
  return {
    content,
    citations: uniqueCitations(
      (candidate?.groundingMetadata?.groundingChunks ?? []).map((chunk) => ({
        url: chunk.web?.uri,
        title: chunk.web?.title,
      })),
    ),
  };
}

export function createHostedWebResearchAdapter(
  opts: HostedWebResearchOptions = {},
) {
  const fetchFn = opts.fetch ?? fetch;
  return async function research(
    provider: HostedWebProvider,
    key: string,
    query: string,
    options: { deep?: boolean } = {},
  ): Promise<ResearchResponse> {
    const spec = PROVIDERS[provider];
    const prompt = options.deep
      ? `Research this thoroughly on the web and synthesize the answer with citations:\n\n${query}`
      : query;
    const google = provider === "google";
    const response = await fetchFn(spec.endpoint, {
      method: "POST",
      headers: google
        ? { "content-type": "application/json", "x-goog-api-key": key }
        : {
            "content-type": "application/json",
            authorization: `Bearer ${key}`,
          },
      body: JSON.stringify(
        google
          ? {
              contents: [{ parts: [{ text: prompt }] }],
              tools: [{ google_search: {} }],
            }
          : {
              model: spec.model,
              input: prompt,
              tools: [{ type: "web_search" }],
              ...(provider === "openai"
                ? { reasoning: { effort: "medium" } }
                : {}),
            },
      ),
    });
    if (!response.ok) throw new Error(`${provider} HTTP ${response.status}`);
    const answer = google
      ? mapGoogle(await response.json())
      : mapResponsesApi(await response.json());
    if (!answer) throw new Error(`${provider} returned no answer`);
    return { results: [], answer };
  };
}
