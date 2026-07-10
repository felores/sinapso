# Voice-parity checklist — Gemini live models (recorded 2026-07-10)

U7 gate from the two-tier LLM orchestration plan, run empirically with
`tests/parity-probe.ts` (opens a real live session per voice, requests one
audio reply, counts audio bytes; async runs additionally verify the
NON_BLOCKING → scheduled INTERRUPT round-trip).

## Context: the plan's pinned model does not exist

`gemini-2.5-flash-live` is rejected by the API. The real 2.5 live line is
`gemini-2.5-flash-native-audio-latest`, and — contrary to the docs-based
planning assumption — the default `gemini-3.1-flash-live-preview` supports
async function calling consistently (3/3 async round-trips spoke the
scheduled completion). Details in
`docs/solutions/gemini-live-async-function-calling.md`.

**Consequence:** the delegation-recommended default stays
`gemini-3.1-flash-live-preview` (no default switch needed); the selectable
second model is `gemini-2.5-flash-native-audio-latest`.

## Checklist: all 30 curated voices on `gemini-2.5-flash-native-audio-latest`

PASS (29/30): Aoede, Charon, Fenrir, Kore, Orus, Puck, Zephyr, Achernar*,
Achird, Algenib, Algieba, Alnilam, Autonoe, Callirrhoe, Despina, Enceladus*,
Erinome, Gacrux, Iapetus, Laomedeia, Pulcherrima, Rasalgethi*, Sadachbia,
Sadaltager, Schedar, Sulafat, Umbriel, Vindemiatrix, Zubenelgenubi.
(* = passed on retry; first attempt timed out.)

MISS (1/30): **Leda** — 0/4 attempts produced audio on the 2.5 model
(session opens, no speech). Leda works on the 3.1 default (control run
passed). Per the plan's fallback rule, Leda sessions stay on
`gemini-3.1-flash-live-preview`, which is the default anyway; delegation is
fully functional there.

## Verdict

- Default model (3.1 preview): all voices in production use today; async
  delegation verified. No change.
- Selectable 2.5 native-audio model: usable, one known voice miss (Leda)
  and occasional first-try audio timeouts; async completion speech is
  intermittent (~50% in spot checks) — the working document still opens via
  the browser action when the spoken heads-up is missed.
