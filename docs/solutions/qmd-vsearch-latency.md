---
topic: qmd vsearch latency and query typing
date: 2026-07-02
tags: [qmd, performance, integrations]
---

# qmd vsearch: type the query, expect per-spawn cost

## Problem

`qmd vsearch "<text>"` with an untyped query triggers qmd's auto-expansion
(LLM hyde generation): 30-36s observed. Even typed, each spawn pays model
load + SQLite open on a large index (763 MB, ~8.7k docs): 5-9s wall per
query, ~2.5s of it compute. The brainstormed 1-2s "related notes" target is
not reachable with a spawn-per-query design on a real vault.

## Solution

1. Always pass a pre-typed single-line query: `vec: <squashed text>`.
   This skips expansion entirely (36s -> ~5s). Implemented in
   `server/integrations/qmd.ts` `vsearch()`.
2. Treat 5-9s as the floor for spawned vsearch. UI surfaces must load
   async with a visible loading state (R4 already requires this).
3. Named upgrade path when latency matters: keep a warm `qmd mcp` child
   process (stdio JSON-RPC) so model + index load once per server lifetime.

## Also learned

- `qmd collection add` with NO args indexes the cwd silently. Always pass
  the path explicitly; in tests never call the real binary.
- vsearch `--format json` output may carry progress noise around the JSON
  array; parse from the first `[` defensively.
- vsearch hits reference files as `qmd://<collection>/<path-relative-to-
  collection-root>`; mapping to vault paths needs `collection show`'s Path.
- Collection commands are cheap (~0.1s); the embedding model is the cost.
