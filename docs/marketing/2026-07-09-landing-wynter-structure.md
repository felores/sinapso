# Solaris Landing Page: Wynter 4-Layer Structure

> Landing page architecture and copy, built on the Wynter framework (Clarity, Relevance,
> Value, Differentiation), Ziglar's five objections, and Hormozi's Value Equation.
> Inputs: root `PRODUCT.md` and `docs/marketing/2026-07-09-landing-competitive-research.md`.
> Bilingual: full EN copy here, plus ES for the high-stakes strings (hero, section
> headlines, CTAs). Full ES body translation happens at implementation.
> Static page, lives in this repo. 10 slots of 2K image generation reserved for visuals.

---

## Page map (sections in order)

| # | Section | Wynter layer | Objection handled |
|---|---------|--------------|-------------------|
| 1 | Hero | Clarity | No need (bold claim), no trust (open source badge) |
| 2 | Live demo strip | Clarity proof | No trust (seeing is believing) |
| 3 | "Sound familiar?" pains | Relevance | No need |
| 4 | What you get (6 counters) | Value | No desire |
| 5 | Voice showcase | Value peak | No desire |
| 6 | Why Solaris and not X | Differentiation | No trust, no money |
| 7 | Origin story | Differentiation / narrative | No trust |
| 8 | Pricing truth (free + BYO keys) | Value | No money |
| 9 | Trust model | Differentiation | No trust |
| 10 | Final CTA | Close | No hurry |

CTA appears after sections 1, 4, 6, 8, and 10. Same action everywhere: copy the
one-line install command + GitHub link. Proof element accompanies each CTA (see
"Social proof strategy" below).

---

## 1. Hero (Layer 1: Clarity)

The 15-second test: what is it, what do I get, what's the catch (none).

**Headline (EN):**
> Fly through everything you know. Then talk to it.

**Headline (ES):**
> Vuela por todo lo que sabes. Y luego háblale.

Checklist: imperative verb (Fly / Vuela), outcome (everything you know, navigable),
attention hook (talk to it). The objection lives in the subtitle.

**Subtitle (EN):**
> Solaris turns your Obsidian vault, or any folder of linked Markdown, into a smooth
> 3D universe: thousands of notes, tens of thousands of links, on your own machine.
> A real-time voice assistant explores it with you, researches the web, and files
> what you create back into your notes. Free, open source, no subscription.

**Subtitle (ES):**
> Solaris convierte tu vault de Obsidian, o cualquier carpeta de Markdown enlazado,
> en un universo 3D fluido: miles de notas, decenas de miles de enlaces, en tu propia
> máquina. Un asistente de voz en tiempo real lo explora contigo, investiga en la web
> y guarda lo que crean de vuelta en tus notas. Gratis, open source, sin suscripción.

**CTA block:**
- Primary: copyable command box: `npx solaris "path/to/YourVault"` with a copy button.
  Label EN: "One command. Your vault, in orbit." / ES: "Un comando. Tu vault, en órbita."
- Secondary: "Star on GitHub" + live star count.
- Under-CTA microcopy (risk reversal): EN "MIT licensed. Runs on localhost. Uploads
  nothing." / ES "Licencia MIT. Corre en localhost. No sube nada."

**Visual:** full-bleed background or right-side render of the galaxy (image slot 1,
or ideally the real flythrough video/GIF from `assets/`).

---

## 2. Live demo strip (Clarity proof)

One row, three moments, autoplaying muted loops or stills with captions:

1. Orbit the whole graph, dive into a cluster, labels fade in.
2. Click a node, note opens beside the map, click again and it's in Obsidian.
3. Voice command opens panels and drafts a document.

Caption (EN): "A 4,000-note vault. Every node and link rendered at once. Still smooth."
Caption (ES): "Un vault de 4,000 notas. Cada nodo y enlace renderizado a la vez. Sigue fluido."

---

## 3. Sound familiar? (Layer 2: Relevance, 6 pains)

**Section headline (EN):** Who is Solaris for?
**Section headline (ES):** ¿Para quién es Solaris?

Six pain cards. Each: pain title + 2-3 lines of why it hurts. All six are sourced
from real community complaints (see research doc for quotes and URLs).

1. **Your graph view froze years ago.**
   Past a few thousand notes, the built-in graph lags, pegs one CPU core while your
   GPU sits idle, and the official answer is "that's a limitation, not a bug."

2. **When it does render, it's a hairball.**
   A dense 2D blob where every cluster overlaps. You built the links; you still
   can't see the shape of what you know.

3. **Your knowledge is trapped in Word, PDF, and Google Docs.**
   Getting it into clean notes means paste-and-scrub sessions that eat half an hour
   per document and still leave formatting garbage behind.

4. **AI answers vanish into chat scroll.**
   You get a wall of text, it's gone by tomorrow, and none of it connects to the
   notes you already have.

5. **Every tool wants $10-20 a month.**
   One subscription per app, whether you used it this month or not. Renting your
   own second brain gets old.

6. **Cloud tools want your notes on their servers.**
   Your vault is years of your thinking. Uploading it to someone else's silo to get
   "AI features" is a bad trade.

---

## 4. What you get (Layer 3: Value, 6 counters, mirroring each pain)

**Section headline (EN):** Your vault, upgraded.
**Section headline (ES):** Tu vault, mejorado.

1. **A galaxy that stays smooth.** (counters pain 1)
   Thousands of notes and tens of thousands of links rendered at once, on your GPU.
   Orbit, dive, and read without a stutter. Big vaults are the point, not the edge case.

2. **Clusters you can actually read.** (counters pain 2)
   3D layout separates your domains into constellations. Color by folder or tag,
   filter with rules that persist, spot the bright strands between fields you never
   knew were related, and find the orphans and gaps.

3. **Drop a file, get a linked note.** (counters pain 3)
   PDF, Word, slides, or a web page. Clean
   preview first, saved into your vault only when you approve, connected to what you
   already have.

4. **Results that become notes, not scroll.** (counters pain 4)
   Web research arrives analyzed, and one click saves it as a note linked into your
   base. Select any text and launch the next question from it. Nothing you produce
   gets lost.

5. **Free core, cents-per-use extras.** (counters pain 5)
   The visualizer costs nothing, forever. Smart features run on your own pay-per-use
   keys. Semantic search over your notes is fully local and free.

6. **Everything stays on your machine.** (counters pain 6)
   Plain Markdown in your own folders. Nothing is uploaded unless you explicitly ask.
   Every write is previewed, guarded, and journaled. Obsidian stays one click away
   for hand-editing.

---

## 5. Talk to your second brain (Value peak, own section)

The single strongest differentiator gets its own full-width moment.

**Section headline (EN):** Don't just stare at your vault. Talk to it.
**Section headline (ES):** No te quedes mirando tu vault. Háblale.

Show a conversation, not a feature list. Five example commands rendered as a
voice-session mock (image slot or animated text):

- "What do I have on temporal knowledge graphs? Open the strongest one."
- "Search the web for what changed this year and give me the short version."
- "Draft a synthesis of this and the open note, then read it back."
- "Save that to my architecture wiki."
- "Link this note to the one about agent memory."

Supporting copy (EN):
> Real-time voice, in your language. Interrupt it mid-sentence; it keeps up. Correct
> it; it adapts. It opens panels, finds notes, researches, drafts documents, and
> files them where they belong. Three of the best voice engines available, your
> choice, your key. What you make together lands as linked notes, not chat history.

---

## 6. Why Solaris and not X (Layer 4: Differentiation)

**Section headline (EN):** There was no tool that did all three.
**Section headline (ES):** No existía una herramienta que hiciera las tres cosas.

Center piece: a three-circle diagram (image slot): "Fast 3D map" + "Real-time voice
agent" + "Local-first, your files". Solaris sits in the intersection; every
alternative covers at most one circle.

Comparison table (verify pricing before publish; sources in research doc):

| | Solaris | Obsidian graph | 3D graph plugins | TheBrain / InfraNodus | Voice note apps |
|---|---|---|---|---|---|
| Handles 5k+ notes smoothly | Yes, GPU | No (official limitation) | No (crash / disabled) | Sluggish, bloated | n/a |
| 3D navigable map | Yes | No | Partial, unmaintained | 2D-ish / cluttered | No |
| Real-time voice agent | Yes | No | No | No | Capture only |
| Your own Markdown files | Yes | Yes | Yes | Proprietary / cloud | Their cloud |
| Price | Free + BYO keys | Free | Free | $180/yr+ / €12-66/mo | $/mo subscriptions |

Tone rule: respectful toward Obsidian everywhere. Solaris complements it (one click
opens any note there); the contrast is with the graph view, not the editor.

---

## 7. Origin story (narrative section)

**Section headline (EN):** Born from an AI. Raised by a human.
**Section headline (ES):** Nacido de una IA. Criado por un humano.

Copy (EN):
> Solaris started as a repository with a single star, created by Fable, the most
> powerful AI in the world, and left open source. A human found it while hunting for
> a way to see a 5,000-note knowledge base that every other tool choked on. This one
> flew. He audited the code, adopted it, and has been evolving it since: voice,
> research, ingestion, versioning. Now it's yours too. MIT licensed, open to everyone.

Visual: timeline or "constellation being born" treatment (image slot).

---

## 8. Pricing truth (Value / no-money objection)

**Section headline (EN):** Free. And the smart parts cost cents, not subscriptions.
**Section headline (ES):** Gratis. Y las partes inteligentes cuestan centavos, no suscripciones.

Three columns:
1. **Always free:** the 3D universe, search, filters, themes, reader, Obsidian
   hand-off, note version history. Open source, MIT.
2. **Fully local, also free:** semantic search over your own notes. No key, no cloud.
3. **Bring your own keys, pay per use:** web research credits last months for cents
   per query; language models and voice are pay-as-you-go with efficient current
   models as defaults. No monthly fee, ever. Use it daily or once a month; you pay
   for what you use.

Contrast line (EN): "Comparable subscription tools run $10-20 per month, forever,
whether you open them or not." (Re-verify figures before publish.)

---

## 9. Trust model (no-trust objection, short section)

**Section headline (EN):** Your notes never leave home.
**Section headline (ES):** Tus notas nunca salen de casa.

Four short bullets, plain language:
- Runs entirely on your machine; the core uploads nothing.
- Web and AI features only activate when you turn them on, with your own keys.
- It never overwrites a note silently: writes are user-triggered, previewed, and journaled.
- All the code is open. Read it, fork it, or just use it.

---

## 10. Final CTA (no-hurry close)

**Headline (EN):** Your vault is already a universe. See it tonight.
**Headline (ES):** Tu vault ya es un universo. Míralo esta noche.

Copy (EN):
> One command. No signup, no migration, no config. If you have a folder of Markdown,
> you're 60 seconds from flying through it.

The "no hurry" close for a free tool is effort-based, not scarcity-based: the cost
of trying is nearly zero and the payoff is immediate (Hormozi: dream outcome high,
likelihood high because it works on the vault you already have, time delay one
command, effort none).

- Primary CTA: `npx solaris "path/to/YourVault"` copy box.
- Secondary: GitHub link + star count.
- Tertiary: "Prefer a desktop app?" link to the Electron build instructions.

---

## Social proof strategy (current gap, be honest)

Solaris has no user testimonials yet. Do not fabricate any. Until real quotes exist:

1. **Proof by demo:** real captures and loops of a 4,000+ note vault are the primary
   proof. Screens beat claims.
2. **Proof by community pain:** the pains in section 3 paraphrase real, linkable
   community complaints. Optionally footnote them ("sources") for credibility.
3. **Proof by openness:** GitHub star count, MIT license, "read the code" links.
4. **Backlog task:** collect 3-5 early-user quotes and insert one beside each CTA,
   per the Wynter framework. Highest-leverage missing asset on this page.

## Ziglar objection coverage check

- **No need:** section 3 (pains sourced from real complaints).
- **No desire:** sections 2, 4, 5 (demo + counters + voice showcase).
- **No trust:** sections 6, 7, 9 + open source badges + proof-by-demo.
- **No money:** section 8 (free core, cents per use, subscription contrast).
- **No hurry:** section 10 (60 seconds to value, zero effort, no migration).

## Image slot plan (10 x 2K, generation phase)

Real app captures beat generated images wherever possible; use generation for what
a screenshot can't show. Working allocation:

1. Hero galaxy render (or real capture, ideally the flythrough video).
2. Demo strip moment: cluster dive (real capture preferred).
3. Demo strip moment: reader pane + Obsidian hand-off (real capture preferred).
4. Voice session visual: waveform + panels opening.
5. Ingest moment: PDF/Word/web page turning into a clean linked note.
6. Three-circle differentiation diagram.
7. Origin story visual: constellation being born / one star becoming many.
8. Semantic clusters / gaps view (real capture preferred).
9. Mobile view composition.
10. Reserve / final CTA background texture.

## Implementation notes

- Static, self-contained page in this repo. No external requests (fits the
  local-first story; the page itself practices what it preaches).
- Bilingual EN/ES via a language toggle; EN default, `?lang=es` deep link.
- Look and feel follows the app: dark space background, neon node palette,
  glassy panels (see app screenshots and `web/src/theme.ts` palettes).
- Every claim on the page must trace to PRODUCT.md, the README, or the research
  doc. Re-verify competitor pricing figures at publish time.
