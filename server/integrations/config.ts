/**
 * Integrations config: ~/.solaris/config.json (global to the user, unlike the
 * per-vault data dir). Holds the Exa and OpenRouter keys, web consent, default
 * model, and addons state. Secrets never leave this file: the status endpoint
 * reports booleans only.
 *
 * Written with mode 600 on POSIX; on Windows confidentiality relies on the
 * per-user %USERPROFILE% directory ACL (KTD5).
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Voice assistant: chosen realtime provider + voice, and a per-provider API
 * key (one only reaches the local voice relay, never the browser). */
export interface VoiceConfig {
  provider: string | null; // "gemini" | "openai" | "xai"
  voice: string | null; // provider-specific voice id
  keys: { gemini: string | null; openai: string | null; xai: string | null };
}

export type PromptKey =
  | "wikiIngest"
  | "noteQuestions"
  | "voiceAssistant"
  | "webResearch";

export type PromptOverrides = Record<PromptKey, string | null>;

export interface WikiConfig {
  id: string;
  label: string;
  /** Vault-relative path to the wiki folder. */
  path: string;
  enabled: boolean;
  /** Wiki-relative contract candidates, e.g. AGENTS.md or index.md. */
  contractFiles: string[];
  /** Wiki-relative by default; ../research is allowed after runtime confinement. */
  rawDestination: string | null;
  discovered: boolean;
  confidence: "high" | "medium" | "low";
}

export interface VaultConfig {
  path: string;
  wikis: WikiConfig[];
}

export interface SolarisConfig {
  exaKey: string | null;
  openrouterKey: string | null;
  consents: { web: boolean };
  defaultModel: string | null;
  /** Vault-relative destination folder for created notes (R12). */
  writeDestination: string;
  /** Addon install markers (qmd/markitdown), managed by the installer. */
  addons: Record<string, string>;
  voice: VoiceConfig;
  activeVaultPath: string | null;
  vaults: Record<string, VaultConfig>;
  /** User prompt overrides. Null means use the built-in default. */
  prompts: PromptOverrides;
}

export interface ConfigPatch {
  exaKey?: string | null;
  openrouterKey?: string | null;
  consents?: Partial<SolarisConfig["consents"]>;
  defaultModel?: string | null;
  writeDestination?: string;
  addons?: Record<string, string>;
  voice?: {
    provider?: string | null;
    voice?: string | null;
    keys?: Partial<VoiceConfig["keys"]>;
  };
  activeVaultPath?: string | null;
  vaults?: Record<string, unknown>;
  prompts?: Partial<PromptOverrides>;
}

const PROMPT_DEFAULTS: Record<PromptKey, string> = {
  wikiIngest:
    "Read the selected wiki contracts and turn the source into proposed Markdown creates/edits that preserve the wiki's conventions, links, index, and log.",
  noteQuestions:
    "Generate concise web-research questions that close knowledge gaps around the current note. Reply as JSON strings only.",
  voiceAssistant:
    "You are the Solaris voice assistant. Ground answers in the current view first, use vault tools for note questions, and ask before spending web credit.",
  webResearch:
    "Use web research only for user-requested external/current information. Return synthesized answers with sources and never auto-run spending searches while typing.",
};

export function defaultPrompts(): Record<PromptKey, string> {
  return { ...PROMPT_DEFAULTS };
}

export function effectivePrompts(
  cfg: Pick<SolarisConfig, "prompts">,
): Record<PromptKey, string> {
  const defaults = defaultPrompts();
  return {
    wikiIngest: cfg.prompts.wikiIngest ?? defaults.wikiIngest,
    noteQuestions: cfg.prompts.noteQuestions ?? defaults.noteQuestions,
    voiceAssistant: cfg.prompts.voiceAssistant ?? defaults.voiceAssistant,
    webResearch: cfg.prompts.webResearch ?? defaults.webResearch,
  };
}

export function defaultConfig(): SolarisConfig {
  return {
    exaKey: null,
    openrouterKey: null,
    consents: { web: false },
    defaultModel: null,
    writeDestination: "inbox",
    addons: {},
    voice: {
      provider: null,
      voice: null,
      keys: { gemini: null, openai: null, xai: null },
    },
    activeVaultPath: null,
    vaults: {},
    prompts: {
      wikiIngest: null,
      noteQuestions: null,
      voiceAssistant: null,
      webResearch: null,
    },
  };
}

export function defaultConfigPath(): string {
  return join(homedir(), ".solaris", "config.json");
}

/** Field-by-field sanitizing merge: unknown/mistyped fields are ignored. */
function merge(base: SolarisConfig, patch: unknown): SolarisConfig {
  const out: SolarisConfig = {
    ...base,
    consents: { ...base.consents },
    addons: { ...base.addons },
    voice: { ...base.voice, keys: { ...base.voice.keys } },
    vaults: { ...base.vaults },
    prompts: { ...base.prompts },
  };
  if (typeof patch !== "object" || patch === null) return out;
  const p = patch as Record<string, unknown>;
  if (typeof p.exaKey === "string" || p.exaKey === null) out.exaKey = p.exaKey;
  if (typeof p.openrouterKey === "string" || p.openrouterKey === null)
    out.openrouterKey = p.openrouterKey;
  if (typeof p.consents === "object" && p.consents !== null) {
    const c = p.consents as Record<string, unknown>;
    if (typeof c.web === "boolean") out.consents.web = c.web;
  }
  if (typeof p.defaultModel === "string" || p.defaultModel === null)
    out.defaultModel = p.defaultModel;
  if (typeof p.writeDestination === "string" && p.writeDestination)
    out.writeDestination = p.writeDestination;
  if (typeof p.addons === "object" && p.addons !== null) {
    for (const [k, v] of Object.entries(p.addons))
      if (typeof v === "string") out.addons[k] = v;
  }
  if (typeof p.voice === "object" && p.voice !== null) {
    const v = p.voice as Record<string, unknown>;
    if (typeof v.provider === "string" || v.provider === null)
      out.voice.provider = v.provider as string | null;
    if (typeof v.voice === "string" || v.voice === null)
      out.voice.voice = v.voice as string | null;
    if (typeof v.keys === "object" && v.keys !== null) {
      // Per-provider keys merge individually: setting one never clears another.
      for (const k of ["gemini", "openai", "xai"] as const) {
        const kv = (v.keys as Record<string, unknown>)[k];
        if (typeof kv === "string" || kv === null) out.voice.keys[k] = kv;
      }
    }
  }
  if (typeof p.activeVaultPath === "string" || p.activeVaultPath === null)
    out.activeVaultPath = p.activeVaultPath;
  if (typeof p.vaults === "object" && p.vaults !== null) {
    for (const [k, v] of Object.entries(p.vaults)) {
      const vault = sanitizeVault(k, v);
      if (vault) out.vaults[vault.path] = vault;
    }
  }
  if (typeof p.prompts === "object" && p.prompts !== null) {
    const prompts = p.prompts as Record<string, unknown>;
    for (const k of [
      "wikiIngest",
      "noteQuestions",
      "voiceAssistant",
      "webResearch",
    ] as const) {
      const v = prompts[k];
      if (v === null) out.prompts[k] = null;
      else if (typeof v === "string") out.prompts[k] = v.trim() ? v : null;
    }
  }
  return out;
}

function sanitizeVault(key: string, value: unknown): VaultConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const path = typeof v.path === "string" && v.path ? v.path : key;
  if (!path) return null;
  return {
    path,
    wikis: Array.isArray(v.wikis)
      ? v.wikis
          .map(sanitizeWiki)
          .filter((w): w is WikiConfig => w !== null)
      : [],
  };
}

function sanitizeWiki(value: unknown): WikiConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const w = value as Record<string, unknown>;
  if (typeof w.id !== "string" || !w.id) return null;
  if (typeof w.path !== "string" || !w.path) return null;
  const confidence =
    w.confidence === "high" || w.confidence === "medium" || w.confidence === "low"
      ? w.confidence
      : "low";
  return {
    id: w.id,
    label: typeof w.label === "string" && w.label ? w.label : w.path,
    path: w.path,
    enabled: typeof w.enabled === "boolean" ? w.enabled : true,
    contractFiles: Array.isArray(w.contractFiles)
      ? w.contractFiles.filter((f): f is string => typeof f === "string" && !!f)
      : [],
    rawDestination:
      typeof w.rawDestination === "string"
        ? w.rawDestination
        : w.rawDestination === null
          ? null
          : "../raw/",
    discovered: typeof w.discovered === "boolean" ? w.discovered : true,
    confidence,
  };
}

/** Read config; a corrupt file yields defaults plus a logged warning, never a crash. */
export function loadConfig(path = defaultConfigPath()): SolarisConfig {
  if (!existsSync(path)) return defaultConfig();
  try {
    return merge(defaultConfig(), JSON.parse(readFileSync(path, "utf-8")));
  } catch (e) {
    console.warn(
      `Solaris config at ${path} is unreadable, using defaults: ${e instanceof Error ? e.message : String(e)}`,
    );
    return defaultConfig();
  }
}

/** Apply a sanitized patch and persist with 600 perms. Returns the new config. */
export function updateConfig(
  patch: ConfigPatch,
  path = defaultConfigPath(),
): SolarisConfig {
  const cfg = merge(loadConfig(path), patch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600); // { mode } only applies on create; enforce on rewrite too
  return cfg;
}
