# Connecting MCP clients to Solaris

Solaris exposes its registry's `mcp`-surface tools over a **stdio** MCP
server (`server/mcp.ts`). It opens no network listener: every tool call is
proxied over loopback HTTP to the running Solaris server with a
surface-scoped session token, so path confinement, the write journal,
consent/key gates, and token guards all apply exactly as they do for the
browser.

Start Solaris first (`npm run dev` or `npm start`); the MCP server exits
with a clear stderr message if it cannot reach it. Point at a non-default
port with `SOLARIS_URL` (or `AKASHA_PORT`).

## Claude Code

```bash
claude mcp add solaris -e SOLARIS_URL=http://127.0.0.1:5175 -- \
  npx tsx /path/to/solaris/server/mcp.ts
```

Then e.g. "search my vault for X with solaris" or "create a note in my
vault". Available tools: `search_notes`, `search_passages`, `read_passage`,
`browse_folder`, `list_wikis`, `read_wiki_contract`, `create_note`,
`write_document`, `save_working_document`, `archive_vault_note`,
`web_research`, `fetch_url`.

## Podcast agent (or any MCP-speaking agent)

Spawn `npx tsx /path/to/solaris/server/mcp.ts` with `SOLARIS_URL` in the
environment and speak MCP over stdio. `search_passages` replaces raw
`/api/semantic-search` calls and adds the keyword fallback for free.

## In-place editing (off by default)

`edit_vault_note` — the only tool that can replace existing note content —
is not registered unless the config opt-in is set, and the server rejects
it independently of the bridge:

```bash
curl -X POST http://127.0.0.1:5175/api/integrations/config \
  -H "content-type: application/json" \
  -H "x-solaris-token: $(curl -s http://127.0.0.1:5175/api/session | jq -r .token)" \
  -d '{"mcpEditEnabled": true}'
```

Restart the MCP server after changing the flag so the tool list updates.

## Security model

- stdio only — no new port, loopback-bound Solaris stays loopback-bound.
- The bridge's token comes from `GET /api/session?surface=mcp` and is only
  accepted on routes whose registry entry declares the `mcp` surface —
  git sync, wiki-ingest apply, delegation, and admin config stay
  browser/voice-only even if the token leaks.
- A Solaris restart rotates tokens; the bridge re-fetches once on 403 and
  replays the call.
