# Gemini Live: async function calling — empirical findings (2026-07-09)

Probed with `tests/parity-probe.ts` against the live API (key from
`~/.solaris/config.json`), during the two-tier LLM orchestration plan (U7).

## Findings

1. **`gemini-2.5-flash-live` does not exist.** The planning docs pinned it,
   but `bidiGenerateContent` on v1beta rejects the id. The models list showed
   these live-capable models at probe time:
   - `gemini-2.5-flash-native-audio-latest` (+ dated previews 09/12-2025)
   - `gemini-3.1-flash-live-preview`
   - `gemini-3.5-live-translate-preview`
2. **The 3.1 default DOES support async function calling.** Sessions on
   `gemini-3.1-flash-live-preview` accept `behavior: NON_BLOCKING`
   declarations and speak the completion sent later with
   `scheduling: INTERRUPT` — consistently (3/3 runs, audio after the
   scheduled response every time).
3. **`gemini-2.5-flash-native-audio-latest` also supports it, but
   intermittently** (spoke the scheduled completion in 1 of 2 async runs;
   session setup and plain audio always fine).

## Consequences in code

- `GEMINI_LIVE_MODELS` (voice.ts) = 3.1 preview (default) +
  `gemini-2.5-flash-native-audio-latest` (selectable).
- Both are in `GEMINI_ASYNC_FC_MODELS`: the delegate tool is declared
  `NON_BLOCKING` on both; a missed spoken heads-up degrades to the
  browser-side `open_research` action + next-turn announcement (R13 path).
- Unknown/legacy model ids get plain declarations (KTD5 safety property),
  so a stale config value can never break session setup.

## Gotcha for future probes

A "did async FC work" probe must count ONLY audio that arrives after the
`scheduling: INTERRUPT` response is sent. Counting from the interim ack
gives false positives — the model speaks an acknowledgement right after the
ack, completes the turn, and looks like a pass.
