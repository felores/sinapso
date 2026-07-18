# Tool-usage flows — Discover → Verify → Act

Reference sequences for voice / MCP / CLI agents driving the Sinapso tools.
These are declared flows, not LLM transcripts: each line is one tool call an
agent SHOULD issue, in order, for that intent. The backend guards (path
confinement, contract read, RAW-first apply, OUTSIDE_SELECTED_WIKI rejection)
remain the authority — these flows make agents effective, they do not replace
the guards.

## Flow 1 — Answer a question about the vault ("what do my notes say about X?")

1. `search_vault` `{ queries: "X\nvariant of X", mode: "auto" }` — DISCOVER.
   Order results by `rank`, read `snippet`/`line` to judge relevance. Never
   compare raw `score` across modes or `scoreKind`.
2. If empty → RETRY with a different mode/scope before reporting nothing:
   - `search_vault` `{ queries: "X", mode: "exact" }` for a precise term/quote/id
   - `search_vault` `{ queries: "X", mode: "path" }` if X looks like a file/title
   - `browse_folder` `{ path: "suspected-area" }` if the user named a folder
   Never repeat the same `(queries, mode, path)` unchanged.
3. `read_note` `{ note: "<path from step 1>", from: 1, count: 60 }` — VERIFY.
   Auto results identify a note but do not guarantee a line; read its opening
   range to confirm the snippet and context. Use anchored `line` context only
   after an `exact` result supplies a line.
4. Answer, citing note titles. Do NOT invent paths or quotes.

## Flow 2 — Explore an unknown area ("what's in climatia?", "where are my meetings?")

1. `browse_folder` `{}` — DISCOVER top-down. A subfolder's `count` is the TOTAL
    notes anywhere under it (recursive); `notes` lists up to 40 DIRECT
    children of the current folder and `noteCount` gives the full direct count.
2. `browse_folder` `{ path: "<subfolder path>" }` — drill into the subfolder.
3. `search_vault` `{ queries: "...", path: "<subfolder path>", mode: "auto" }` —
   DISCOVER notes inside that folder by content.
4. `read_note` `{ note: "<path>", from: 1, count: 60 }` — VERIFY / read the note.
5. Answer, or keep drilling.

## Flow 3 — Ingest research into a wiki (propose → approve → apply)

Before proposing, the agent gathers context so derived notes connect:

1. `list_wikis` `{}` — pick the target wiki (single → default; multiple → user context).
2. `search_vault` `{ queries: "<source topic>", mode: "auto" }` — DISCOVER related
   vault notes so derived notes can wikilink them.
3. `read_note` `{ note: "<related path>", from: 1, count: 60 }` — VERIFY
   any snippet the proposal will cite or extend. Use anchored `line` context
   only after an `exact` result supplies a line.
4. `read_wiki_contract` `{ wikiId: "<wiki id or path>" }` — load node types, folders,
   wikilink/source conventions the derived notes must follow.
5. `propose_wiki_ingest` `{ researchId: "<id>", wikiId: "<wiki>" }` — server reads
   the contract, plans the exact canonical RAW path, returns derived operations.
6. Present the proposal (RAW path + derived creates/edits) to the user.
7. Only after explicit user approval: `apply_wiki_ingest`
   `{ wikiId, operations }` — RAW runs first at its canonical path, then derived
   create/edit through the sanctioned write path.

## Anti-patterns (do not do these)

- Answering "what does note X say?" from memory without a `read_note` call.
- Repeating the same `(queries, mode, path)` after an empty result.
- Calling `read_note` with a path the agent invented (no prior result).
- Reporting "I couldn't find that" after only one `auto` search.
- Calling `apply_wiki_ingest` without explicit user approval.
- Calling `propose_wiki_ingest` without first reading the wiki contract.
