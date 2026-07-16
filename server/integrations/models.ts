/**
 * Model catalog (R1-R5 redesign): the bundled JSON is the source of truth for
 * provider labels, curated agent models, and voice model/voice choices. The
 * optional `~/.sinapso/models.json` override can add/replace agent models by
 * stable `id` and disable stable ids; it can NEVER define endpoints or
 * arbitrary providers (keys must not be exfiltrated). Malformed overrides fall
 * back to the bundled catalog with a warning.
 *
 * Endpoints are CODE-OWNED (see ./llm.ts) and never appear in the catalog or
 * any API response. The catalog only carries metadata the frontend needs to
 * render provider/model choices.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import bundledRaw from "./models.catalog.json" with { type: "json" };

/** The five trusted provider ids. Anything else is rejected on merge. */
export const TRUSTED_PROVIDERS = [
  "google",
  "openai",
  "xai",
  "openrouter",
  "deepseek",
] as const;
export type TrustedProviderId = (typeof TRUSTED_PROVIDERS)[number];

export type AgentRole = "fast" | "reasoning";
export type EffortLevel = "low" | "medium" | "high";

export interface CatalogProvider {
  label: string;
  description: string;
  keyUrl: string;
  billingUrl: string;
  capabilities: string[];
}

export interface AgentModel {
  /** Stable id used for override merge and disabled lists. */
  id: string;
  provider: TrustedProviderId;
  label: string;
  /** Exact model string sent to the provider API. */
  model: string;
  roles: AgentRole[];
  /** Optional reasoning-effort ladder; absent = effort unsupported. */
  efforts?: EffortLevel[];
  defaultEffort?: EffortLevel;
  recommended?: boolean;
}

export interface ModelCatalog {
  schemaVersion: number;
  providers: Record<TrustedProviderId, CatalogProvider>;
  agentModels: AgentModel[];
  voiceModels: Partial<Record<TrustedProviderId, string[]>>;
  voiceNames: Partial<Record<TrustedProviderId, string[]>>;
}

/**
 * Override shape for ~/.sinapso/models.json. `models` entries replace by
 * stable `id` (and may add new ones); `disabled` removes by id. Endpoints,
 * provider key material, and arbitrary provider ids are rejected on parse.
 */
export interface ModelOverride {
  models?: AgentModel[];
  disabled?: string[];
}

// ponytail: module-level memo keyed by override path. stat per call, re-read
// only on mtime change. Missing/corrupt overrides fall back to bundled and
// are NOT cached so an external fix is seen on the next call.
interface CatalogCacheEntry {
  mtimeMs: number;
  value: ModelCatalog;
}
const catalogCache = new Map<string, CatalogCacheEntry>();

function isTrusted(id: string): id is TrustedProviderId {
  return (TRUSTED_PROVIDERS as readonly string[]).includes(id);
}

function isRole(v: unknown): v is AgentRole {
  return v === "fast" || v === "reasoning";
}

function isEffort(v: unknown): v is EffortLevel {
  return v === "low" || v === "medium" || v === "high";
}

function sanitizeStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

function sanitizeProvider(raw: unknown): CatalogProvider | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label : "";
  if (!label) return null;
  // ponytail: reject endpoint-shaped fields defensively; the catalog must
  // never carry code-owned routing. Unknown fields are ignored, not merged.
  for (const forbidden of ["endpoint", "baseUrl", "url", "key"]) {
    if (forbidden in r) return null;
  }
  return {
    label,
    description: typeof r.description === "string" ? r.description : "",
    keyUrl: typeof r.keyUrl === "string" ? r.keyUrl : "",
    billingUrl: typeof r.billingUrl === "string" ? r.billingUrl : "",
    capabilities: sanitizeStringArray(r.capabilities),
  };
}

function sanitizeAgentModel(raw: unknown): AgentModel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  // Reject endpoint/key leakage on individual models too.
  for (const forbidden of ["endpoint", "baseUrl", "url", "key", "apiKey"]) {
    if (forbidden in r) return null;
  }
  const id = typeof r.id === "string" ? r.id : "";
  const provider =
    typeof r.provider === "string" && isTrusted(r.provider) ? r.provider : null;
  const model = typeof r.model === "string" ? r.model : "";
  const label = typeof r.label === "string" ? r.label : "";
  if (!id || !provider || !model || !label) return null;
  const roles = Array.isArray(r.roles) ? r.roles.filter(isRole) : [];
  if (!roles.length) return null;
  const out: AgentModel = { id, provider, label, model, roles };
  const efforts = Array.isArray(r.efforts)
    ? r.efforts.filter(isEffort)
    : undefined;
  if (efforts && efforts.length) {
    out.efforts = efforts;
    if (
      r.defaultEffort !== undefined &&
      isEffort(r.defaultEffort) &&
      efforts.includes(r.defaultEffort)
    ) {
      out.defaultEffort = r.defaultEffort;
    }
  }
  if (r.recommended === true) out.recommended = true;
  return out;
}

function sanitizeCatalog(raw: unknown): ModelCatalog | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const providers: Partial<Record<TrustedProviderId, CatalogProvider>> = {};
  if (typeof r.providers === "object" && r.providers !== null) {
    for (const [k, v] of Object.entries(
      r.providers as Record<string, unknown>,
    )) {
      if (!isTrusted(k)) continue; // unknown providers dropped, never added
      const p = sanitizeProvider(v);
      if (p) providers[k] = p;
    }
  }
  const agentModels: AgentModel[] = [];
  if (Array.isArray(r.agentModels)) {
    for (const m of r.agentModels) {
      const am = sanitizeAgentModel(m);
      if (am) agentModels.push(am);
    }
  }
  const voiceModels: Partial<Record<TrustedProviderId, string[]>> = {};
  const voiceNames: Partial<Record<TrustedProviderId, string[]>> = {};
  if (typeof r.voiceModels === "object" && r.voiceModels !== null) {
    for (const [k, v] of Object.entries(
      r.voiceModels as Record<string, unknown>,
    )) {
      if (isTrusted(k)) voiceModels[k] = sanitizeStringArray(v);
    }
  }
  if (typeof r.voiceNames === "object" && r.voiceNames !== null) {
    for (const [k, v] of Object.entries(
      r.voiceNames as Record<string, unknown>,
    )) {
      if (isTrusted(k)) voiceNames[k] = sanitizeStringArray(v);
    }
  }
  return {
    schemaVersion: typeof r.schemaVersion === "number" ? r.schemaVersion : 1,
    providers: providers as Record<TrustedProviderId, CatalogProvider>,
    agentModels,
    voiceModels,
    voiceNames,
  };
}

const BUNDLED_RAW = sanitizeCatalog(bundledRaw);
if (!BUNDLED_RAW) {
  // Bundled is authored, not user input; a failure here is a build bug.
  throw new Error("Sinapso bundled model catalog failed validation");
}
const BUNDLED: ModelCatalog = BUNDLED_RAW;

/**
 * Merge bundled + override: override models replace by id (and may add new
 * trusted ids), `disabled` drops ids. Providers/voiceMaps from the override
 * are ignored — they are a future seam, not a current requirement, and the
 * override is meant for model list curation only.
 */
function applyOverride(
  base: ModelCatalog,
  override: ModelOverride,
): ModelCatalog {
  const disabled = new Set(sanitizeStringArray(override.disabled));
  const byId = new Map<string, AgentModel>();
  for (const m of base.agentModels) byId.set(m.id, m);
  if (Array.isArray(override.models)) {
    for (const raw of override.models) {
      const m = sanitizeAgentModel(raw);
      if (m) byId.set(m.id, m); // replace-or-add by stable id
    }
  }
  const agentModels = [...byId.values()].filter((m) => !disabled.has(m.id));
  return { ...base, agentModels };
}

export function defaultCatalogPath(): string {
  return join(homedir(), ".sinapso", "models.json");
}

/**
 * Load the catalog. The bundled catalog is the base; an optional override
 * file (default `~/.sinapso/models.json`) is merged on top. A missing,
 * malformed, or non-object override is ignored with a warning and the bundled
 * catalog is returned. For tests, pass an explicit `overridePath` (derived
 * beside the injected config path so isolation remains possible).
 */
export function loadCatalog(
  overridePath: string = defaultCatalogPath(),
): ModelCatalog {
  if (!existsSync(overridePath)) return BUNDLED;
  let mtimeMs: number;
  try {
    mtimeMs = statSync(overridePath).mtimeMs;
  } catch {
    return BUNDLED;
  }
  const cached = catalogCache.get(overridePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.value;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(overridePath, "utf-8"));
  } catch (e) {
    console.warn(
      `Sinapso model catalog at ${overridePath} is unreadable, using bundled: ${e instanceof Error ? e.message : String(e)}`,
    );
    return BUNDLED;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.warn(
      `Sinapso model catalog at ${overridePath} is not an object, using bundled`,
    );
    return BUNDLED;
  }
  const merged = applyOverride(BUNDLED, parsed as ModelOverride);
  catalogCache.set(overridePath, { mtimeMs, value: merged });
  return merged;
}

/**
 * The safe catalog slice for API responses. This is exactly `loadCatalog()`
 * output — the catalog already excludes endpoints and arbitrary providers by
 * construction. Exposed for routes to avoid a second sanitization pass.
 */
export function safeCatalog(overridePath?: string): ModelCatalog {
  return loadCatalog(overridePath);
}

export function bundledCatalog(): ModelCatalog {
  return BUNDLED;
}

/** Test-only: drop the memo so mtime-independent tests get a clean read. */
export function _resetCatalogCacheForTests(): void {
  catalogCache.clear();
}

export { dirname };
