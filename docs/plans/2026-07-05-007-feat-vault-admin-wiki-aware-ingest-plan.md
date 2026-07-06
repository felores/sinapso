---
title: Vault Admin and Wiki-Aware Ingest - Plan
type: feat
date: 2026-07-05
topic: vault-admin-wiki-aware-ingest
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Vault Admin and Wiki-Aware Ingest - Plan

## Goal Capsule

- **Objective:** Add an Admin surface where users can manage the current vault path, approve detected wikis, configure per-wiki ingest behavior, and edit the prompts that drive research, voice, web search, and wiki ingest.
- **Product authority:** User request in this session plus the existing Solaris trust model in `CLAUDE.md`. Product Contract preservation: new plan bootstrapped directly from the request.
- **Execution profile:** Server-first, security-sensitive. Keep one sanctioned vault write path in `server/integrations/write.ts`; keep frontend framework-free; avoid adding a second filesystem writer or a browser-only native folder picker.
- **Stop conditions:** Stop and ask before adding direct browser filesystem access, a second vault writer, silent wiki edits without preview, or an ingest flow that hardcodes one raw/source folder convention beyond the editable per-wiki default.
- **Open blockers:** None. The remaining unknowns are deferred implementation choices with safe defaults.

---

## Product Contract

### Summary

Solaris should treat Markdown vaults as knowledge bases that may contain one wiki or many wikis. The default is simple: when a vault has a root-level `wiki/`, Solaris detects it and uses it without forcing extra decisions. When the vault contains multiple `wiki/` folders, Solaris shows them in Admin as a checklist, selected by default, so the user can unselect, rename, or add paths manually.

Each wiki may have a different contract. The contract is not always `AGENTS.md`; likely contract files include `AGENTS.md`, `CLAUDE.md`, `index.md`, and `README.md`. Wiki-aware ingest must therefore discover wiki folders first, then detect likely contract files per wiki and use those contracts to decide how an imported source should be synthesized into pages.

### Problem Frame

Today Solaris can scan a vault and can ingest a document into a configured destination, usually `inbox/`. That is useful for capture, but it does not respect the core wiki workflow: raw material should be digested into the correct wiki pages, with links, frontmatter, indexes, and logs shaped by that wiki's contract. This matters because wikis are the durable synthesis layer, while raw documents are only source material.

The app also lacks one central place to manage the vault path, wiki paths, and prompts. Integration settings already exist in the Tools menu, but the requested Admin surface is broader: vault topology, wiki discovery, selected ingest targets, and prompt customization.

### Requirements

**Admin and vault setup**

- R1. File menu gets an `Admin...` entry as the first item.
- R2. Admin opens in the existing modal system, centered on screen, with a vertical panel layout matching Solaris chrome.
- R3. Admin shows the current scanned vault path and offers a safe way to switch or rescan the vault.
- R4. In Electron, vault browsing uses a native directory dialog. In browser/CLI mode, Admin accepts a typed local path and explains that native browsing is desktop-only.
- R5. Vault switching is token-guarded and local-origin guarded, validates that the selected path exists and is a directory, rescans it, hot-swaps the graph, and persists the active vault path in local config.

**Wiki discovery and configuration**

- R6. Solaris scans the active vault for directories named exactly `wiki` and proposes them as wikis.
- R7. Root-level `wiki/` is the default one-wiki case.
- R8. Multiple `wiki/` folders are shown as a checklist, selected by default, with labels derived from their parent path.
- R9. The user can disable a detected wiki, rename its label, add a manual wiki path, or remove a saved manual path.
- R10. For each wiki, Solaris detects likely contract files from `AGENTS.md`, `CLAUDE.md`, `index.md`, and `README.md`; no single file is required.
- R11. Each wiki stores a confidence state: high when `AGENTS.md` or `CLAUDE.md` exists, medium when `index.md` or `README.md` exists, low when only the folder name was detected.
- R12. Saved wiki config is scoped to the vault path, because one user may switch between vaults with different wiki layouts.

**Prompt administration**

- R13. Admin exposes editable prompt templates for wiki ingest, web research question generation, voice assistant behavior, and web research/fetch guidance.
- R14. Prompts are local config, not vault content, and are returned to the browser only as non-secret text.
- R15. Built-in default prompts remain available through a reset action so a bad edit is recoverable.

**Wiki-aware ingest**

- R16. Ingest keeps the current no-choice behavior when exactly one wiki is enabled.
- R17. When more than one wiki is enabled, Ingest mode lets the user choose the target wiki before importing a path, URL, or browser-uploaded file.
- R18. Existing `inbox/` ingest remains available as an explicit destination for capture-only workflows.
- R19. Each wiki can define its own raw/source landing destination. New wiki configs default this field to `raw/`, and the user can change it to common alternatives like `research/`, `../research/`, or leave it blank to cite the original source without storing a raw copy.
- R20. Contract-aware synthesis reads the selected wiki's contract files and proposes create/update operations inside that wiki.
- R21. Proposed wiki writes are previewed before applying. Creates show path and full content; edits show the target path and replacement/diff preview.
- R22. Applying proposals uses `server/integrations/write.ts` only; no other code writes into the vault.
- R23. After applying wiki ingest proposals, Solaris rescans and opens the first created or updated note.
- R24. Upload ingest honors the selected destination or wiki target just like URL/path ingest; it must not silently fall back to `inbox/`.

### Key Flows

- F1. First-run simple wiki
  - **Trigger:** User opens a vault containing `wiki/` at the root.
  - **Steps:** Solaris scans the vault, detects `wiki/`, marks it enabled, detects any contract files, and Admin shows one enabled wiki.
  - **Outcome:** Ingest does not ask for a wiki target; the single enabled wiki is implied.
  - **Covers:** R6, R7, R10, R16.

- F2. Multi-wiki vault approval
  - **Trigger:** User opens Admin on a vault containing several nested `wiki/` folders.
  - **Steps:** Admin lists every detected wiki with a checked checkbox, confidence label, contract file badges, and editable labels; user unchecks or edits as needed; Save persists the config.
  - **Outcome:** Only enabled wikis appear in future ingest target choices.
  - **Covers:** R8, R9, R11, R12.

- F3. Browser upload into a selected wiki
  - **Trigger:** More than one wiki is enabled and user picks a file in Ingest mode.
  - **Steps:** User selects the target wiki, uploads the file, markitdown converts it, Solaris reads that wiki's contracts, renders proposed creates/edits, user approves, writes go through the guarded writer, then rescan opens the result.
  - **Outcome:** The source is digested into the selected wiki instead of landing blindly in `inbox/`.
  - **Covers:** R17, R20, R21, R22, R23, R24.

- F4. Capture-only import remains
  - **Trigger:** User chooses `Inbox / capture only` as the ingest destination.
  - **Steps:** Solaris runs the existing markitdown ingest and saves the converted Markdown through guarded create.
  - **Outcome:** Current behavior remains available for quick capture.
  - **Covers:** R18.

### Acceptance Examples

- AE1. Given a vault with only root `wiki/`, when Admin opens, then one wiki is listed, enabled, and no ingest target prompt appears during import.
- AE2. Given a vault with five `wiki/` folders, when Admin opens, then all five are listed checked by default, and unchecking one removes it from Ingest mode choices.
- AE3. Given a wiki with only `index.md`, when discovery runs, then the wiki is still listed with medium confidence and `index.md` shown as a contract candidate.
- AE4. Given a wiki with both `AGENTS.md` and `CLAUDE.md`, when contract-aware ingest runs, then both files are passed as contract context.
- AE5. Given more than one enabled wiki, when a browser upload is ingested, then the selected wiki target is sent to `/api/ingest-upload` and the created/proposed paths do not fall back to `inbox/` unless `Inbox / capture only` was selected.
- AE6. Given a proposed edit from contract-aware ingest, when the user rejects it, then no vault file changes and no changelog entry is written.
- AE7. Given a proposal path outside the selected wiki or outside the vault, when approval is attempted, then `write.ts` rejects it.
- AE8. Given a bad prompt edit, when the user clicks reset for that prompt, then the built-in default prompt is restored.

### Scope Boundaries

**Deferred for later**

- Full browser-native directory browsing. Browsers do not expose arbitrary server-side local folder selection; v1 supports Electron browse and browser typed paths.
- Assuming every wiki really uses `raw/`. v1 preselects `raw/` because it is the clean default, but the user can change it per wiki to `research/`, `../research/`, or blank.
- Fully autonomous wiki rewrite. v1 proposals require user preview/approval.
- Schema-specific rich editors for every wiki type. v1 uses generic path/content proposals.

**Outside this product's identity**

- Silent writes into wiki pages.
- A second filesystem writer outside `server/integrations/write.ts`.
- Uploading vault/wiki contracts to third-party services without the existing consent/key gates.

### Sources and Research

- Existing config pattern: `server/integrations/config.ts` stores local, non-vault config with sanitized merges and 0600 permissions.
- Existing write contract: `server/integrations/write.ts` is the single sanctioned vault writer and already handles confinement, collision-safe create, edits, and journaling.
- Existing ingest path: `server/integrations/ingest.ts` converts source material through markitdown and calls guarded create.
- Existing bug to fold in: `/api/ingest-upload` currently calls `ingestBytes()` without passing `cfg.writeDestination`, while URL/path ingest passes the configured destination.
- Existing UI pattern: `web/index.html` has a reusable modal and File menu; `web/src/main.ts` uses imperative handlers and `postConfig()` for config saves.
- Live vault shape observed: multiple nested `wiki/` folders, each with its own contract files and no uniform `raw/` folder convention.
- External research: skipped. Local code and live vault shape are sufficient; no external API or library choice is being introduced.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Wiki discovery starts with folder names, not contract files. The stable signal is a directory named `wiki`; contract files only adjust confidence and context. This handles `AGENTS.md`, `CLAUDE.md`, `index.md`, `README.md`, and wikis with incomplete contracts.
- KTD2. Wiki config is per vault path. Global `~/.solaris/config.json` can hold multiple vault entries, but enabled wikis and prompt overrides must be keyed by vault path so one vault's wiki list does not leak into another.
- KTD3. Admin is a modal, not a new page. It follows the existing modal, menu, and imperative frontend patterns in `web/index.html`, `web/src/main.ts`, and `web/src/style.css`, avoiding a routing or component framework layer.
- KTD4. Browser path switching is typed; desktop browsing is Electron-only. Adding a general browser folder picker would be fake or unsafe. Electron can call a native dialog through a server integration hook; browser/CLI users can paste a local path.
- KTD5. Contract-aware ingest is proposal-based. The LLM may suggest creates/edits, but the user approves before write, and all writes go through `write.ts`.
- KTD6. Raw folder is per-wiki config. Store `rawDestination` per wiki, default it to `raw/`, and let the user change it to `research/`, `../research/`, or blank. Blank means cite the original source; set means save the converted source there before synthesis.
- KTD7. Prompt overrides live in config with built-in fallback. Prompt text is not secret, but corrupted or empty prompts should not brick the feature.

### High-Level Technical Design

```mermaid
flowchart TB
  UI[Admin modal and Ingest UI] --> CFG[/api/integrations + /api/admin config]
  UI --> ING[/api/ingest and /api/ingest-upload]
  CFG --> WIKI[wiki discovery + saved wiki config]
  ING --> MD[markitdown conversion]
  MD --> SYN[contract-aware synthesis]
  WIKI --> SYN
  SYN --> PROP[proposal preview]
  PROP --> WRITE[guarded write.ts]
  WRITE --> VAULT[(vault markdown)]
  WRITE --> LOG[(data/changes.jsonl)]
  VAULT --> SCAN[rescan + graph hot-swap]
```

### Data Shape

Directional shape only; implementation can keep names tighter if the code wants.

```ts
interface WikiConfig {
  id: string;
  label: string;
  path: string; // vault-relative path to the wiki folder
  enabled: boolean;
  contractFiles: string[]; // wiki-relative: AGENTS.md, CLAUDE.md, index.md, README.md
  rawDestination?: string | null; // wiki-relative by default; "../research" allowed
  discovered: boolean;
  confidence: "high" | "medium" | "low";
}

interface VaultConfig {
  path: string;
  wikis: WikiConfig[];
}
```

### Assumptions

- The active graph's `meta.vaultPath` remains the runtime source of truth after app boot; config stores the last active path and saved wiki settings.
- A wiki path is a vault-relative directory path and must resolve under the active vault.
- Contract files are read server-side from the selected wiki and capped before being sent to any LLM call.
- Prompt registry starts with only the prompts already present in the codebase: wiki ingest, note questions, voice assistant, web research/fetch guidance.

---

## Implementation Units

### U1. Persist vault, wiki, and prompt config

- **Goal:** Extend local config so Admin has durable vault-scoped wiki settings and prompt overrides.
- **Requirements:** R12, R13, R14, R15.
- **Files:** `server/integrations/config.ts`, `server/integrations/config.test.ts`, `server/app.ts`.
- **Approach:** Add sanitized config fields for `activeVaultPath`, `vaults`, and `prompts`. Keep secret handling unchanged. Unknown wiki fields are ignored; paths are stored as strings but validated when used against a vault. New wiki configs get `rawDestination: "raw/"` unless the user changes it. Expose non-secret prompt text and wiki config through status/admin routes.
- **Patterns to follow:** `merge()` in `server/integrations/config.ts`; existing `GET /api/integrations` response shape in `server/app.ts`.
- **Test scenarios:** default config has empty vaults/prompts; update persists one vault with multiple wikis and per-wiki raw destinations; malformed wiki entries are ignored; prompt reset returns the default value; secret keys still never appear in status payloads; config file remains 0600.
- **Verification:** `npm test -- server/integrations/config.test.ts` and `npm run typecheck`.

### U2. Add wiki discovery service

- **Goal:** Find candidate wikis and contract files inside the active vault.
- **Requirements:** R6, R7, R8, R10, R11.
- **Files:** `server/integrations/wiki.ts`, `server/integrations/wiki.test.ts`, `server/app.ts`.
- **Approach:** Walk directories under the vault root, respecting graph excludes where available, and collect directories whose basename is exactly `wiki`. For each, detect `AGENTS.md`, `CLAUDE.md`, `index.md`, and `README.md`. Merge discovered candidates with saved manual wikis without deleting user edits. Default new discoveries to `enabled: true` and `rawDestination: "raw/"`.
- **Patterns to follow:** path confinement style from `server/integrations/write.ts`; graph metadata access in `server/app.ts`.
- **Test scenarios:** root `wiki/` detected as one high/medium/low candidate depending on contract files; nested wikis all detected; directories under excluded folders are skipped; `AGENTS.md` and `CLAUDE.md` produce high confidence; only `index.md` produces medium confidence; no contract file produces low confidence; saved disabled state and custom raw destination survive rediscovery.
- **Verification:** `npm test -- server/integrations/wiki.test.ts` and `npm run typecheck`.

### U3. Admin modal UI

- **Goal:** Provide the File-menu Admin surface for vault path, wiki checkboxes, per-wiki settings, and prompt editing.
- **Requirements:** R1, R2, R3, R8, R9, R13, R15.
- **Files:** `web/index.html`, `web/src/main.ts`, `web/src/style.css`, `web/src/i18n.ts`.
- **Approach:** Insert `Admin...` as the first File menu item. Reuse `showModal()` with a taller/wider admin class. Render sections for Vault, Wikis, and Prompts. Wiki rows show checkbox, label input, path, confidence, contract badges, and raw folder input prefilled with `raw/`. Prompt rows use textareas plus reset buttons. Save posts a config patch; rediscover refreshes candidate wikis.
- **Patterns to follow:** existing modal code around `showModal()`, integration config `postConfig()`, menu close behavior, and `akasha-*` localStorage only for UI state.
- **Test scenarios:** Frontend has no test framework; manual checklist covers Admin rendering and interactions.
- **Verification:** `npm run typecheck`, `npm run build`, manual browser check with one-wiki and multi-wiki vaults.

### U4. Safe vault switching and desktop browse

- **Goal:** Let Admin switch the active vault safely, with native browse in Electron and typed paths elsewhere.
- **Requirements:** R3, R4, R5.
- **Files:** `server/app.ts`, `desktop/main.ts`, `server/app.test.ts`, `web/src/main.ts`.
- **Approach:** Add token-guarded routes for vault status/switch. Switching validates an existing directory, runs `scanVault()` into the current graph path, calls `reload()`, persists `activeVaultPath`, invalidates qmd/vector caches, and returns the new graph for hot-swap. In Electron, pass a `pickVault` callback into `createApp()` so Admin can request the native directory dialog; in CLI/browser mode the browse route returns `unavailable` and the typed path remains available.
- **Patterns to follow:** `desktop/main.ts` `pickAndScanVault()`, `server/app.ts` `/api/rescan`, `applyGraphUpdate()` in `web/src/main.ts`.
- **Test scenarios:** switch without token is 403; missing path returns 404/400; file path is rejected; valid directory rescans and updates graph meta; browse route reports unavailable without a desktop callback; Electron callback cancellation leaves current vault unchanged.
- **Verification:** `npm test -- server/app.test.ts`, `npm run typecheck`, manual Electron smoke for native browse.

### U5. Wiki target selection in ingest

- **Goal:** Route path, URL, and upload ingest to either capture-only inbox or a selected wiki target with its configured raw folder.
- **Requirements:** R16, R17, R18, R19, R24.
- **Files:** `server/integrations/ingest.ts`, `server/integrations/ingest.test.ts`, `server/app.ts`, `web/src/main.ts`, `web/index.html`.
- **Approach:** Add optional `wikiId` and destination mode to `/api/ingest` and `/api/ingest-upload`. If one wiki is enabled, use it implicitly. If multiple are enabled, show a compact target selector next to the Ingest input/browse button. Preserve `Inbox / capture only`. When wiki ingest stores a raw copy, resolve the selected wiki's `rawDestination` relative to the wiki path, allowing `../research/` after confinement. Pass destination through `ingestBytes()` so uploads honor the same configured destination behavior as path/URL ingest.
- **Patterns to follow:** `runIngest()`, upload handler around `#ingest-file`, `ingestDocument()` destination option.
- **Test scenarios:** URL/path ingest with selected destination lands there; upload ingest with selected destination lands there; default wiki raw destination resolves to `wiki/raw/`; custom `../research/` resolves under the vault and is accepted; no selected wiki and multiple enabled returns an actionable 400; one enabled wiki is selected implicitly; capture-only still lands in `writeDestination`; invalid wiki id is rejected.
- **Verification:** `npm test -- server/integrations/ingest.test.ts`, `npm run typecheck`, `npm run build`.

### U6. Contract-aware wiki ingest proposals

- **Goal:** Convert imported content into user-approved wiki page create/update proposals shaped by the selected wiki's contracts.
- **Requirements:** R20, R21, R22, R23.
- **Files:** `server/integrations/wiki-ingest.ts`, `server/integrations/wiki-ingest.test.ts`, `server/app.ts`, `web/src/main.ts`, `web/src/style.css`.
- **Approach:** After markitdown conversion, optionally save the converted raw source to the selected wiki's configured raw destination, then read selected wiki contract files (`AGENTS.md`, `CLAUDE.md`, `index.md`, `README.md` when present), cap them, and call the configured LLM prompt through the existing OpenRouter adapter. Require structured JSON proposals with `create` and `edit` operations. Validate every proposed path: under vault, `.md`, and under the selected wiki unless explicitly writing the configured raw destination. Render proposal preview in the research panel; approve applies through `guardedCreate()`/`guardedEdit()` only; reject writes nothing.
- **Patterns to follow:** OpenRouter route tests in `server/integrations/api.test.ts`, write confinement in `server/integrations/write.ts`, research panel save flow in `web/src/main.ts`.
- **Test scenarios:** no OpenRouter key returns a clear setup error and keeps the converted source available for capture-only save; default raw copy path uses `raw/`; custom raw copy path uses the per-wiki raw destination; fake LLM create proposal is previewed and then written through `write.ts`; fake edit proposal is previewed and rejected without write; path outside selected wiki is rejected; contract files are included when present and omitted when absent; prompt override is used when set; default prompt used after reset.
- **Verification:** `npm test -- server/integrations/wiki-ingest.test.ts server/integrations/write.test.ts`, `npm run typecheck`, manual multi-wiki ingest smoke on a scratch vault.

### U7. Documentation and release notes

- **Goal:** Document the Admin, wiki discovery, and trust model changes.
- **Requirements:** R3, R6, R10, R18, R22.
- **Files:** `README.md`, `CLAUDE.md`.
- **Approach:** Update usage docs to explain root `wiki/` default, multi-wiki checkboxes, contract file detection, per-wiki raw folder defaults, prompt overrides, desktop-only browse, and the approval-based write model. Keep the core local-first promise precise: scanning and capture are local; LLM synthesis uses configured/consented providers.
- **Patterns to follow:** existing trust-model language in `CLAUDE.md`.
- **Test scenarios:** Documentation only; reviewed manually.
- **Verification:** `npm run typecheck` unaffected; manual doc read.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Unit and route tests | `npm test` | U1, U2, U4, U5, U6 |
| Type safety | `npm run typecheck` | All units |
| Production build | `npm run build` | U3, U5, U6 frontend changes |
| Manual desktop smoke | `npm run desktop` | U4 native browse |
| Manual web smoke | `npm run dev` | U3, U5, U6 Admin and ingest UI |

Manual checklist:

- Admin appears first in File menu and opens centered.
- Root `wiki/` vault shows one enabled wiki and no ingest target prompt.
- Multi-wiki vault shows all detected wikis checked by default; unchecking one removes it from ingest choices.
- Wiki with only `index.md` remains selectable.
- Each wiki row shows `raw/` as the default raw folder, and changing it to `research/` or `../research/` persists.
- Upload ingest honors selected wiki or capture-only destination.
- Contract-aware proposal reject writes nothing; approve writes through `write.ts`, journals, rescans, and opens the result.
- Bad prompt override can be reset.

---

## Definition of Done

- Admin can discover, save, and rediscover wikis for the active vault without losing user-disabled states.
- Each wiki has a configurable raw folder, defaulting to `raw/`, and custom values survive rediscovery.
- Active vault switching works through typed paths in browser/CLI mode and native browse in Electron mode.
- Ingest target selection is invisible for one enabled wiki, explicit for multiple enabled wikis, and still supports `Inbox / capture only`.
- Path/URL ingest and upload ingest share the same target behavior.
- Contract-aware wiki ingest reads available contract files, previews proposals, and applies approved writes only through `server/integrations/write.ts`.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
- Documentation reflects the wiki discovery defaults, contract file candidates, and approval-based write model.
- No abandoned alternate writer, direct Electron filesystem access from the browser, or unused prompt scaffolding remains in the diff.
