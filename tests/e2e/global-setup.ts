// Hermetic E2E fixture (plan 018 U6): the suite runs against a throwaway
// vault under tests/e2e/.tmp, never the developer's real vault. The dev
// server is pointed here via AKASHA_GRAPH in playwright.config.ts.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const E2E_TMP = join(ROOT, "tests", "e2e", ".tmp");
export const E2E_VAULT = join(E2E_TMP, "vault");
export const E2E_GRAPH = join(E2E_TMP, "graph.json");

const NOTES: Record<string, string> = {
  "welcome.md":
    "---\ntitle: Welcome\ntype: moc\n---\n\n# Welcome\n\nStart here. See [[Alpha Note]] and [[Beta Note]].\n",
  "alpha-note.md":
    "---\ntitle: Alpha Note\n---\n\n# Alpha Note\n\nAlpha links to [[Beta Note]] and back to [[Welcome]].\n",
  "beta-note.md":
    "# Beta Note\n\nBeta content with a [[Welcome]] link and a [[Phantom Target]].\n",
  "inbox/.keep.md": "# keep\n\nKeeps the inbox folder present for tests.\n",
};

export default function globalSetup(): void {
  rmSync(E2E_TMP, { recursive: true, force: true });
  mkdirSync(join(E2E_VAULT, "inbox"), { recursive: true });
  for (const [rel, content] of Object.entries(NOTES)) {
    writeFileSync(join(E2E_VAULT, rel), content);
  }
  execFileSync(
    "npx",
    ["tsx", "scanner/scan.ts", E2E_VAULT, "--out", E2E_GRAPH],
    { cwd: ROOT, stdio: "inherit" },
  );
}

// Playwright launches webServer commands BEFORE globalSetup, so the server's
// command chain invokes this file directly to build the vault + graph first.
if (
  process.argv[1] &&
  /global-setup\.(ts|mts|js|mjs)$/i.test(process.argv[1])
) {
  globalSetup();
}
