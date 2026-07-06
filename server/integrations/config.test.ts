import { describe, it, expect, vi, afterAll } from "vitest";
import {
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultConfig,
  defaultPrompts,
  effectivePrompts,
  loadConfig,
  updateConfig,
} from "./config";

const DIR = mkdtempSync(join(tmpdir(), "solaris-config-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

describe("integrations config", () => {
  it("returns defaults when no file exists", () => {
    expect(loadConfig(join(DIR, "missing.json"))).toEqual(defaultConfig());
  });

  it("persists a patch and reads it back", () => {
    const p = join(DIR, "config.json");
    const cfg = updateConfig(
      { exaKey: "exa-secret-123", consents: { web: true } },
      p,
    );
    expect(cfg.exaKey).toBe("exa-secret-123");
    expect(cfg.consents).toEqual({ web: true });
    expect(loadConfig(p).exaKey).toBe("exa-secret-123");
  });

  it("writes the file with 600 permissions, also on rewrite", () => {
    const p = join(DIR, "perms.json");
    updateConfig({ exaKey: "k" }, p);
    expect(statSync(p).mode & 0o777).toBe(0o600);
    updateConfig({ consents: { web: true } }, p);
    expect(statSync(p).mode & 0o777).toBe(0o600);
  });

  it("merges patches without clobbering unrelated fields", () => {
    const p = join(DIR, "merge.json");
    updateConfig({ exaKey: "keep-me" }, p);
    const cfg = updateConfig({ consents: { web: true } }, p);
    expect(cfg.exaKey).toBe("keep-me");
  });

  it("ignores mistyped or unknown patch fields", () => {
    const p = join(DIR, "sanitize.json");
    const cfg = updateConfig(
      {
        exaKey: 42,
        consents: { web: "yes" },
        bogus: true,
      } as never,
      p,
    );
    expect(cfg.exaKey).toBeNull();
    expect(cfg.consents.web).toBe(false);
    expect((cfg as never as Record<string, unknown>).bogus).toBeUndefined();
    expect(readFileSync(p, "utf-8")).not.toContain("bogus");
  });

  it("persists vault-scoped wiki config with per-wiki raw destinations", () => {
    const p = join(DIR, "vaults.json");
    const cfg = updateConfig(
      {
        activeVaultPath: "/vault/a",
        vaults: {
          "/vault/a": {
            path: "/vault/a",
            wikis: [
              {
                id: "root",
                label: "Root Wiki",
                path: "wiki",
                enabled: true,
                contractFiles: ["AGENTS.md", "index.md"],
                rawDestination: "../research/",
                discovered: true,
                confidence: "high",
              },
              {
                id: "manual",
                path: "saas/project/wiki",
              },
            ],
          },
        },
      },
      p,
    );
    expect(cfg.activeVaultPath).toBe("/vault/a");
    expect(cfg.vaults["/vault/a"].wikis[0]).toMatchObject({
      rawDestination: "../research/",
      confidence: "high",
    });
      expect(cfg.vaults["/vault/a"].wikis[1]).toMatchObject({
        label: "saas/project/wiki",
        enabled: true,
        rawDestination: "../raw/",
        confidence: "low",
      });
  });

  it("ignores malformed wiki config entries", () => {
    const p = join(DIR, "bad-wikis.json");
    const cfg = updateConfig(
      {
        vaults: {
          "/vault/a": {
            path: "/vault/a",
            wikis: [
              { id: "ok", path: "wiki" },
              { id: "missing-path" },
              { path: "missing-id" },
              "bad",
            ],
          },
        },
      } as never,
      p,
    );
    expect(cfg.vaults["/vault/a"].wikis).toHaveLength(1);
    expect(cfg.vaults["/vault/a"].wikis[0].id).toBe("ok");
  });

  it("stores prompt overrides and resets to defaults with null", () => {
    const p = join(DIR, "prompts.json");
    let cfg = updateConfig(
      { prompts: { wikiIngest: "Custom wiki prompt" } },
      p,
    );
    expect(effectivePrompts(cfg).wikiIngest).toBe("Custom wiki prompt");
    cfg = updateConfig({ prompts: { wikiIngest: null } }, p);
    expect(cfg.prompts.wikiIngest).toBeNull();
    expect(effectivePrompts(cfg).wikiIngest).toBe(defaultPrompts().wikiIngest);
  });

  it("yields defaults plus a warning on a corrupt file, never a crash", () => {
    const p = join(DIR, "corrupt.json");
    writeFileSync(p, "{ not json at all");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadConfig(p)).toEqual(defaultConfig());
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
