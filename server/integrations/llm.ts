/**
 * Two-tier LLM resolution (R1-R5 redesign): every server-side LLM operation
 * declares a tier (worker = fast/cheap, thinker = reasoning) and resolves its
 * provider, model, key, endpoint, and thinking/effort options here. Trusted
 * providers: google, openai, xai, openrouter, deepseek. Endpoints are
 * CODE-OWNED constants (never read from config or catalog — keys must not be
 * exfiltrated). All five reuse the existing OpenAI-compatible chat adapter.
 *
 * Effort is applied only where supported: OpenAI direct (reasoning_effort)
 * and OpenRouter (normalized reasoning envelope). DeepSeek thinker keeps its
 * thinking:{type:"enabled"} default-high behavior; google/xai direct get no
 * effort shaping. Degradation chain: thinker -> worker -> legacy defaultModel
 * (OpenRouter only) -> null (callers keep their non-LLM fallbacks).
 *
 * Grounded against:
 * - OpenAI: https://platform.openai.com/docs/api-reference/chat (reasoning_effort)
 * - OpenRouter: https://openrouter.ai/docs/api-reference/overview (reasoning.effort)
 * - DeepSeek: https://api-docs.deepseek.com/ (thinking.type=enabled)
 * - Google: https://ai.google.dev/api/all-methods (OpenAI-compatible /openai/v1)
 * - xAI: https://docs.x.ai/docs/api-reference (OpenAI-compatible /v1)
 */

import {
  providerApiKey,
  type LlmEffort,
  type LlmProviderId,
  type SinapsoConfig,
} from "./config.js";
import {
  chatCompletion,
  DEFAULT_MODEL,
  type ChatMessage,
  type OpenRouterOptions,
} from "./openrouter.js";

export type LlmTier = "worker" | "thinker";
export type LlmProvider = LlmProviderId;

/** Code-owned endpoints. Never read from config or catalog. */
export const ENDPOINTS: Record<LlmProvider, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com",
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  // Google's official OpenAI-compatible surface (chat/completions, /models).
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
};

/** Legacy alias kept for existing imports/tests. */
export const DEEPSEEK_ENDPOINT = ENDPOINTS.deepseek;

/** DeepSeek pins the fixed v4 pair; any stored model is ignored (R3). */
export const DEEPSEEK_MODELS: Record<LlmTier, string> = {
  worker: "deepseek-v4-flash",
  thinker: "deepseek-v4-pro",
};

export interface ResolvedTier {
  provider: LlmProvider;
  model: string;
  key: string;
  /** Absent = the adapter's default base (OpenRouter). */
  endpoint?: string;
  /** Extra chat-completion body fields (effort/thinking shaping). */
  extraBody?: Record<string, unknown>;
}

/**
 * Effort shaping per provider. OpenAI direct gets `reasoning_effort`;
 * OpenRouter gets the normalized `reasoning` envelope. Others get nothing
 * (unsupported). DeepSeek thinker always gets thinking:{type:"enabled"}.
 */
function effortBody(
  provider: LlmProvider,
  tier: LlmTier,
  effort: LlmEffort,
): Record<string, unknown> | undefined {
  if (provider === "openai" && effort) {
    return { reasoning_effort: effort };
  }
  if (provider === "openrouter" && effort) {
    return { reasoning: { enabled: true, effort } };
  }
  if (provider === "deepseek" && tier === "thinker") {
    // Default reasoning effort (high) applies; only thinking is enabled.
    return { thinking: { type: "enabled" } };
  }
  return undefined;
}

function slot(tier: LlmTier, cfg: SinapsoConfig): ResolvedTier | null {
  const provider = tier === "worker" ? cfg.workerProvider : cfg.thinkerProvider;
  const effort = tier === "worker" ? cfg.workerEffort : cfg.thinkerEffort;
  if (!provider) return null;
  const key = providerApiKey(cfg, provider);
  if (!key) return null;
  // DeepSeek pins the fixed pair; every other provider honors the stored model.
  const model =
    provider === "deepseek"
      ? DEEPSEEK_MODELS[tier]
      : (tier === "worker" ? cfg.workerModel : cfg.thinkerModel) ||
        (provider === "openrouter" ? cfg.defaultModel || DEFAULT_MODEL : "");
  if (!model && provider !== "openrouter") return null;
  return {
    provider,
    model,
    key,
    endpoint: ENDPOINTS[provider],
    extraBody: effortBody(provider, tier, effort),
  };
}

/**
 * Resolve a tier to a callable provider+model+key. Null means no LLM is
 * configured at all — callers fall back to their non-LLM behavior (R5).
 */
export function resolveTier(
  tier: LlmTier,
  cfg: SinapsoConfig,
): ResolvedTier | null {
  const own = slot(tier, cfg);
  if (own) return own;
  // Unconfigured thinker runs on the worker slot, without thinking options.
  if (tier === "thinker") {
    const worker = slot("worker", cfg);
    if (worker) return worker;
  }
  // Legacy fallback: the single defaultModel field on OpenRouter.
  if (cfg.openrouterKey) {
    return {
      provider: "openrouter",
      model: cfg.defaultModel || DEFAULT_MODEL,
      key: cfg.openrouterKey,
      endpoint: ENDPOINTS.openrouter,
    };
  }
  return null;
}

/**
 * Run a chat completion against a resolved tier through the shared
 * OpenAI-compatible adapter. An injected test endpoint wins over the
 * resolved provider endpoint (tests fake the fetch, not the provider).
 */
export async function tierCompletion(
  resolved: ResolvedTier,
  messages: ChatMessage[],
  opts: OpenRouterOptions = {},
): Promise<string> {
  return chatCompletion(resolved.key, resolved.model, messages, {
    ...opts,
    endpoint: opts.endpoint ?? resolved.endpoint,
    extraBody: { ...resolved.extraBody, ...opts.extraBody },
  });
}

/** Free key check via the models-list endpoint (no completion charged). */
export async function validateProviderKey(
  provider: LlmProvider,
  key: string,
  opts: OpenRouterOptions = {},
): Promise<{ ok: boolean; usage?: number; limit?: number | null }> {
  const f = opts.fetch ?? fetch;
  const endpoint = opts.endpoint ?? ENDPOINTS[provider];
  if (provider === "openrouter") {
    // OpenRouter GET /key returns credit usage/limit for free.
    const res = await f(`${endpoint}/key`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (res.status === 401) return { ok: false };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      data?: { usage?: number; limit?: number | null };
    };
    return {
      ok: true,
      usage: data.data?.usage,
      limit: data.data?.limit ?? null,
    };
  }
  // Every other trusted provider: free GET /models, 401/403 = invalid.
  const res = await f(`${endpoint}/models`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 403) return { ok: false };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { ok: true };
}

/** Legacy alias kept for existing imports/tests (DeepSeek /models check). */
export async function validateDeepseekKey(
  key: string,
  opts: OpenRouterOptions = {},
): Promise<{ ok: boolean }> {
  return validateProviderKey("deepseek", key, opts);
}
