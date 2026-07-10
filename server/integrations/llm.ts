/**
 * Two-tier LLM resolution (R1-R5): every server-side LLM operation declares a
 * tier (worker = fast/cheap, thinker = reasoning) and resolves its provider,
 * model, key, endpoint, and thinking options here. Providers: OpenRouter
 * (free model choice per slot) and the official DeepSeek API (fixed v4 pair,
 * no picker). Degradation chain: thinker -> worker -> legacy defaultModel ->
 * null (callers keep their existing non-LLM fallbacks).
 *
 * DeepSeek grounded against https://api-docs.deepseek.com/ (2026-07):
 * OpenAI-compatible chat completions at https://api.deepseek.com, thinking
 * enabled via `thinking: {type:"enabled"}` (default reasoning effort: high),
 * GET /models usable for free key validation. Legacy model names
 * (deepseek-chat/deepseek-reasoner) are deprecated 2026-07-24 — only the v4
 * pair is used.
 */

import type { SolarisConfig } from "./config.js";
import {
  chatCompletion,
  DEFAULT_MODEL,
  type ChatMessage,
  type OpenRouterOptions,
} from "./openrouter.js";

export type LlmTier = "worker" | "thinker";
export type LlmProvider = "openrouter" | "deepseek";

export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com";

/** DeepSeek slots pin the fixed pair; any stored model is ignored (R3). */
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
  /** Extra chat-completion body fields (DeepSeek thinker thinking mode, R4). */
  extraBody?: Record<string, unknown>;
}

function slot(tier: LlmTier, cfg: SolarisConfig): ResolvedTier | null {
  const provider = tier === "worker" ? cfg.workerProvider : cfg.thinkerProvider;
  if (provider === "deepseek" && cfg.deepseekKey) {
    return {
      provider: "deepseek",
      model: DEEPSEEK_MODELS[tier],
      key: cfg.deepseekKey,
      endpoint: DEEPSEEK_ENDPOINT,
      // Default reasoning effort (high) applies; only thinking is enabled.
      ...(tier === "thinker"
        ? { extraBody: { thinking: { type: "enabled" } } }
        : {}),
    };
  }
  if (provider === "openrouter" && cfg.openrouterKey) {
    const model = tier === "worker" ? cfg.workerModel : cfg.thinkerModel;
    return {
      provider: "openrouter",
      model: model || cfg.defaultModel || DEFAULT_MODEL,
      key: cfg.openrouterKey,
    };
  }
  return null;
}

/**
 * Resolve a tier to a callable provider+model+key. Null means no LLM is
 * configured at all — callers fall back to their non-LLM behavior (R5).
 */
export function resolveTier(
  tier: LlmTier,
  cfg: SolarisConfig,
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

/** Free DeepSeek key check via the models-list endpoint (no completion charged). */
export async function validateDeepseekKey(
  key: string,
  opts: OpenRouterOptions = {},
): Promise<{ ok: boolean }> {
  const f = opts.fetch ?? fetch;
  const res = await f(`${opts.endpoint ?? DEEPSEEK_ENDPOINT}/models`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 403) return { ok: false };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { ok: true };
}
