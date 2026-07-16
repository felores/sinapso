import { describe, expect, it } from "vitest";
import { createHostedWebResearchAdapter } from "./web-research";

describe("hosted web research", () => {
  it("uses Google Search grounding and maps citations", async () => {
    let request: { url: string; init?: RequestInit } | null = null;
    const research = createHostedWebResearchAdapter({
      fetch: (async (url: string, init?: RequestInit) => {
        request = { url, init };
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "Grounded answer" }] },
                groundingMetadata: {
                  groundingChunks: [
                    { web: { uri: "https://example.com", title: "Example" } },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    const result = await research("google", "secret", "latest news");

    expect(request!.url).toContain("gemini-3.5-flash:generateContent");
    expect(request!.init?.headers).toMatchObject({
      "x-goog-api-key": "secret",
    });
    expect(String(request!.init?.body)).toContain("google_search");
    expect(result.answer).toEqual({
      content: "Grounded answer",
      citations: [{ url: "https://example.com", title: "Example" }],
    });
  });

  it.each([
    ["openai", "https://api.openai.com/v1/responses", "gpt-5.6"],
    ["xai", "https://api.x.ai/v1/responses", "grok-4.5"],
  ] as const)("uses %s Responses web search", async (provider, url, model) => {
    let request: { url: string; init?: RequestInit } | null = null;
    const research = createHostedWebResearchAdapter({
      fetch: (async (input: string, init?: RequestInit) => {
        request = { url: input, init };
        return new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    text: "Web answer",
                    annotations: [
                      {
                        type: "url_citation",
                        url: "https://example.com/source",
                        title: "Source",
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    const result = await research(provider, "secret", "latest news", {
      deep: true,
    });
    const body = JSON.parse(String(request!.init?.body));

    expect(request!.url).toBe(url);
    expect(request!.init?.headers).toMatchObject({
      authorization: "Bearer secret",
    });
    expect(body).toMatchObject({
      model,
      tools: [{ type: "web_search" }],
    });
    expect(body.reasoning).toEqual(
      provider === "openai" ? { effort: "medium" } : undefined,
    );
    expect(body.input).toContain("Research this thoroughly");
    expect(result.answer?.citations).toEqual([
      { url: "https://example.com/source", title: "Source" },
    ]);
  });
});
