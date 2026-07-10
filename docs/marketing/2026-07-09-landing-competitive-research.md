# Competitive Landscape Research: Sinapso (3D Vault Visualizer + Voice Interface)

> Research base for the Sinapso landing page. Companion to root `PRODUCT.md`.
> Sourced 2026-07-09 via web research (Exa). Pricing figures are current as of
> mid-2026; re-verify exact numbers before publishing them on the landing page.

## Executive summary

Obsidian's built-in graph view is officially conceded to be unusable past ~25k notes and freezes vaults with heavy interlinking; the 3D-plugin ecosystem is small, buggy, and largely abandoned by solo maintainers. A real category of "talk to your notes" voice tools exists (2025-2026), but almost all are voice-*capture* (dictation) rather than realtime *agentic voice over the whole graph* — and the one direct competitor (Hermes for Obsidian) validates Sinapso's exact Gemini-Live + BYO-key architecture. Document ingest to markdown is a widely documented pain with no clean native path. Subscription fatigue in PKM/AI is a loud, well-sourced sentiment that explicitly favors local-first, BYO-key, pay-per-use models.

---

## Q1 — Obsidian graph view at scale: real user complaints

1. **Official Obsidian stance: graph impractical above ~25k notes, "not a bug."** 130k-note vault on i7-14700KF / 64GB / RTX 4090 still froze: *"Graph view freezes. Even a local graph view window freezes if i increase the depth to just 1... It just uses 1 core to 100%."* Mod reply: *"I don't think anything above 25K files is practical with a modern desktop computer. This is not a bug but a current limitation."* — https://forum.obsidian.md/t/obsidian-graph-view-doesnt-work-for-a-large-vault/106287

2. **The graph doesn't use the GPU.** Dragging/zooming pegs one CPU core while GPU sits near 0%: *"It spikes up to 140%, while the GPU's just chillin' at 0%."* — https://forum.obsidian.md/t/loss-of-editor-responsiveness-when-graph-panel-is-open/4804

3. **Leaving graph view open degrades everyday editing — at just 9k notes.** *"I'd already noticed in a vault with only 9000 notes that I can't leave the graph view open in a tab... without getting noticeable lag... I had to deactivate the graph core plugin... sad that core stuff cannot handle lots of notes."* — https://forum.obsidian.md/t/help-obsidian-lags-with-many-notes/82241

4. **Global graph becomes a visually useless "hairball" as links grow, independent of speed.** March 2026 FR: *"the global graph quickly becomes extremely dense... visually overwhelming and difficult to use for studying relationships."* Filtering doesn't save you: *"in a large vault the vault/Obsidian freezes... no way, Jose on large vaults with too many connections."* — https://forum.obsidian.md/t/obsidian-graph-filtered-by-search-query-instead-of-displaying-entire-vault/112060

5. **Forced workarounds: split the vault, or abandon global graph for local graph.** *"I ended up splitting the vault into 3 vaults. Not ideal, but it solved the problem."* / people use local graph *"instead of the complete graph view as a workaround."* — https://forum.obsidian.md/t/help-obsidian-lags-with-many-notes/82241 and https://forum.obsidian.md/t/loss-of-editor-responsiveness-when-graph-panel-is-open/4804

6. **Even ~1,000-note vaults report lag (June 2026), so "large" starts low.** — https://forum.obsidian.md/t/performance-on-large-vaults/114864

---

## Q2 — 3D graph plugins / competing graph tools

**3D plugins for Obsidian (small, fragmented, largely abandoned):**

1. **Most-used 3D plugin (AlexW00) crashes on large vaults, effectively unmaintained.** *"Uncaught RangeError: Maximum call stack size exceeded... I suppose that my graph is too big (10+K notes)."* — https://github.com/AlexW00/obsidian-3d-graph/issues/45

2. **Contrast/legibility complaints — users call it "a toy."** *"In dark mode the nodes disappear... these settings degrade it to some kind of a toy, which could be a beast of a useful instrument."* — https://github.com/AlexW00/obsidian-3d-graph/issues/44

3. **Maintainers openly admit they can't fix performance.** HananoshikaYomaru fork ships a warning: *"The underlying 3D graph has Performance issue that I don't know how to fix... If the total node number... beyond the limit, the graph will not be rendered to protect your computer from hanging."* Last updated ~2 years ago. — https://github.com/HananoshikaYomaru/obsidian-3d-graph and https://community.obsidian.md/plugins/3d-graph-new

4. **Newer fork (Apoo711) still fighting the same fires.** Issue was literally *"Insanely slow on my large repo even with a 5090..."*; maintainer: *"I currently don't have the time to fix any of the issues... they are more than welcome to make a PR."* — https://github.com/Apoo711/obsidian-3d-graph/issues/14

**Adjacent commercial tools (weaknesses = price, sluggishness, learning curve):**

5. **TheBrain: expensive + slow search.** *"The interface always seemed too slow for things like searching, which is annoying."* Price: $219-$299 one-time or $180/yr. 2026 long-time-user review flags *"Performance Overhead and Bloat."* — https://elephas.app/blog/thebrain-review and https://chriskyfung.medium.com/thebrain-15-review-ten-years-in-is-the-new-ai-upgrade-worth-it-9e5ba2c8406f

6. **InfraNodus: powerful but cluttered UI + per-text quota subscription (€12-€66/mo).** *"the user interface is scary and too cluttered. This can be a huge barrier."* — https://medium.com/thegoodbadugly-ai/015-visualize-data-and-discussions-try-not-to-brain-fart-cdf38756516e and https://infranodus.com/

7. **Logseq's graph officially "seriously under-developed" and chokes at a few thousand nodes.** Mod (Dec 2025): *"The Graph View is seriously under-developed... should look elsewhere, until [it] receives some needed rework (not currently a priority)."* Historic: unusable at ~3,500 nodes; frozen 2 days at 18,500 pages; classic *"webby mess"* hairball. — https://discuss.logseq.com/t/graph-performance/34524, https://github.com/logseq/logseq/issues/2089, https://github.com/logseq/logseq/issues/8398, https://discuss.logseq.com/t/graph-overlapping-problems/1726

8. **Kosmik ($11.99/mo) is an infinite-canvas research workspace, "still maturing"** — not a fast local-first 3D force graph. — https://perkpilot.io/review/kosmik

---

## Q3 — Voice interfaces for personal knowledge bases (2025-2026)

**Category exists but splits into (a) voice-*capture* apps and (b) a very small number of true realtime-voice-*agent-over-vault* tools — Sinapso's exact design has one open-source analog, validating the approach while leaving the polished-product niche open.**

1. **Direct architectural twin — Hermes for Obsidian (Jan 2026).** *"Interactive Voice interface with tool use for Obsidian. It's like ChatGPT's Live mode, with access to your vault. With bring your own API key... Powered by Google's Gemini Native Audio API."* Validates the Gemini-Live + BYO-key thesis precisely — but it's an unpolished BRAT beta plugin, not a standalone local-first product. — https://github.com/symunona/obsidian-hermes

2. **Most "talk to your notes" products are dictation/capture in their own cloud silos, not agents over your markdown.** Resty (*"ambient capture... 200 voice thoughts/month"*, https://resty.site/), Voicie (https://voicie.com/features/second-brain/), SpoknLog (https://spoknlog.com/), All My Notes.

3. **Realtime voice + knowledge graph exists but as generic "AI companion" apps, not vault tools.** Plucky (*"Real-time Voice Conversations... OpenAI Realtime API... episodic memory powered by a knowledge graph"*, Neo4j/Graphiti). — https://github.com/athrael-soju/Plucky

4. **Obsidian voice-plugin field is mostly Whisper transcription, not realtime bidirectional audio.** Auralite, Glyph, openbrain, vault-brain (local Gemma/Ollama), an ElevenLabs plugin — none combines 3D visual navigation + realtime voice agent + local-first. — https://github.com/chhoumann/auralite, https://github.com/jkrack/openbrain, https://github.com/savicprvoslav/vault-brain

**Gap Sinapso can own:** nobody pairs a **fast 3D spatial map of the vault** with a **realtime voice agent that can see and act on that same graph**, local-first + BYO-key. Hermes has no visualization; the visualizers have no voice; the voice apps don't touch your own files.

---

## Q4 — Pain of ingesting Word/PDF/Google Docs into markdown

1. **Copy-paste produces "vendor noise" garbage — universal frustration.** *"You hit Cmd+V, expect clean Markdown, and instead get a wall of garbage that takes half an hour to scrub."* Google Docs is *"the most deceptive source"* (fake bold tags); Word injects `mso-*` styles everywhere. — https://richdevtools.com/articles/web/rich-text-to-markdown-conversion-guide

2. **Google Docs has no reliable native markdown export.** *"No native Markdown export... HTML export is bloated... Plain text loses everything... Copy-paste is messy."* Workaround is a clunky download-as-.docx-then-convert dance. — https://www.savemarkdown.co/blog/save-google-docs-as-markdown/ and https://wildandfreetools.com/blog/google-docs-to-markdown-free/

3. **PDF and complex tables break hard.** *"Thought it'd be one click and done. Opened the output: tables turned to garbage, flowcharts vanished, even code block indentation was gone."* — https://doc2markdown.com/blog/markdown-conversion-troubleshooting and https://github.com/stlevy53/doc-to-markdown

4. **Images = base64 data URIs most destinations won't render.** Ingest-for-AI/RAG is an explicit motivation: *"Convert PDFs, websites, Word docs, and Notion pages into clean Markdown your vector database can actually parse."* — https://2markdown.io/

5. **A whole cottage industry of converters** (2markdown, file2markdown, RawMark/Pandoc-online, doc-to-markdown, Minibase) confirms the pain is recurring and unsolved-in-workflow. Sinapso already ships markitdown ingest, which these confirm is the right engine (*"Microsoft's MarkItDown engine produces better structured Markdown from PDFs"*). — https://rawmark.tech/pandoc-online

---

## Q5 — Subscription fatigue and BYO-key / pay-per-use preference

**Sentiment (loud and quotable):**

1. *"Tired of renting my productivity."* — https://www.xda-developers.com/best-productivity-apps-with-affordable-lifetime-license/
2. A dev itemized **$192/year** on note apps and quit: *"No monthly subscription (subscription fatigue is real)."* — https://dev.to/miztizm/i-spent-192year-on-note-apps-until-i-found-this-local-first-alternative-1e6n
3. *"Stop renting your brain... Notion AI... is largely a GPT wrapper with Notion branding and a premium price tag. You are paying extra for someone else's API call."* — https://aiordienow.com/note-taking-app-without-subscription/
4. *"When a writing tool charges every month, you... start evaluating whether it is useful enough, often and forever... one-time pricing can feel cleaner."* — https://www.typeahead.ai/blog/why-a-one-time-ai-writing-tool-can-make-more-sense-than-another-subscription

**BYO-key / pay-per-use is a validated model:**

5. OpenRouter positioned as *"the antidote to subscription guesswork"* — pay-as-you-go, 5.5% fee, no minimums, no lock-in. — https://www.xda-developers.com/testing-new-llms-shouldnt-require-five-subscriptions-openrouter-proves/ and https://openrouter.ai/pricing
6. *"The subscription AI model is starting to crack... pay-per-use AI is no longer a niche workaround. It's a mature category."* — https://panelsai.com/pay-per-use-ai-tools-compared/
7. BYO-key is a headline feature even in voice PKM apps — Voicie: *"connect your own API key (Bring Your Own Key) and pay the AI provider directly. You control your data and costs."* AppSumo lifetime-deal PKM tools (remio, $69 once) advertise *"unlimited usage with BYOK."* — https://voicie.com/features/second-brain/ and https://appsumo.com/products/remio/

**Subscription pricing of comparable tools (for contrast):**

| Tool | Price | Notes |
|---|---|---|
| Notion + AI | $10/mo base + ~$8-10/mo AI (~$20/mo full) | AI now metered ($10 per 1,000 credits) |
| Mem (Pro) | $14.99/mo | Free tier limited to 25 notes/mo |
| Reflect | $10/mo or $99/yr | No free tier, no Android app |
| Tana | Free (beta) | High learning curve |
| TheBrain | $180/yr or $219-299 once | Slow search, bloat |
| InfraNodus | €12-€66/mo | Per-text quotas, steep UI |
| Kosmik | $11.99/mo | Canvas, "still maturing" |

Sources: https://get.mem.ai/pricing, https://www.notion.com/pricing, https://reflect.app/, https://www.aitoolbox.hk/articles/best-ai-note-taking-tools-2026-notion-ai-vs-mem-vs-reflect-vs-tana/, https://aiandapps.com/top-3-ai-note-taking-apps-notion-vs-mem-vs-reflect-compared/

Baseline: **Obsidian itself is free** (removed commercial license Feb 2025, ~1.5M MAU, ~$25M ARR from optional Sync $4/mo + Publish $8/mo). — https://aiordienow.com/note-taking-app-without-subscription/

---

## Positioning opportunities (angles Sinapso can own)

1. **"The graph view Obsidian gives up on at 25k notes."** Obsidian's own team calls large-vault graph a "limitation, not a bug." Sinapso is the answer to a problem the incumbent publicly won't solve.
2. **"Uses your GPU. Obsidian's graph uses one CPU core."** The most-repeated technical complaint, and a demonstrable side-by-side.
3. **"Talk to your vault, don't just stare at it."** The community's own phrasing ("Your vault has a graph. But you can only stare at it.") — Sinapso adds voice agent + navigable map. Nobody combines both.
4. **"Realtime voice over YOUR markdown files — not another cloud silo."** Resty/Voicie/SpoknLog lock notes in their clouds; Sinapso speaks to files you already own, local-first.
5. **"No subscription. Bring your own key. Pay cents, not $20/month."** Ride the documented subscription-fatigue wave; contrast with Notion AI/Mem/Reflect ($10-20/mo).
6. **"Drag a Word/PDF/Google Doc in — it becomes a linked note."** Turns a universally-hated 20-minute cleanup into a drop.
7. **"Your data never leaves your machine unless you say so."** Local-first + explicit-consent egress — a trust story cloud-by-default rivals can't tell.
8. **"See the gaps, not just the notes."** Semantic clustering / orphan-and-gap surfacing answers the questions the static graph can't ("which notes are isolated? which concepts are missing?").
