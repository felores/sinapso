# Sinapso Landing Page: Wynter 4-Layer Structure

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
| 6 | Why Sinapso and not X | Differentiation | No trust, no money |
| 7 | Origin story | Differentiation / narrative | No trust |
| 8 | Pricing truth (free local + optional paid continuity) | Value | No money |
| 9 | Continuity, mobile, and sharing roadmap | Value / growth | No desire, no trust |
| 10 | Trust model | Differentiation | No trust |
| 11 | Final CTA | Close | No hurry |

CTA appears after sections 1, 4, 6, 8, and 11. Same primary action everywhere: copy the
one-line install command + GitHub link. Proof element accompanies each CTA (see
"Social proof strategy" below).

---

## 1. Hero (Layer 1: Clarity)

The 15-second test: what is it, what do I get, and what stays free.

**Headline (EN):**
> Your whole knowledge world, ready to talk, research, and decide with you.

**Headline (ES):**
> Todo tu mundo de conocimiento, listo para conversar, investigar y decidir contigo.

Checklist: audience outcome (their whole knowledge world), active value (conversation,
research, decisions), and personal grounding. The objection lives in the subtitle.

**Subtitle (EN):**
> Sinapso is a free, open local platform for linked Markdown and YAML files you own.
> Explore thousands of notes in 3D, talk with a grounded voice assistant, research,
> and turn decisions into durable work. No account required. Optional managed
> continuity services are planned, not part of the product today.

**Subtitle (ES):**
> Sinapso es una plataforma local, abierta y gratuita para archivos Markdown y YAML
> enlazados que tú controlas. Explora miles de notas en 3D, conversa con un asistente
> de voz basado en tu conocimiento, investiga y convierte decisiones en trabajo
> duradero. No requiere cuenta. Los servicios administrados de continuidad están
> planeados y todavía no forman parte del producto.

**CTA block:**
- Primary: copyable command box: `npx sinapso "path/to/YourVault"` with a copy button.
  Label EN: "One command. Your vault, in orbit." / ES: "Un comando. Tu vault, en órbita."
- Secondary: "Star on GitHub" + live star count.
- Under-CTA microcopy (risk reversal): EN "MIT licensed. The current local core runs
  on localhost and sends no vault data elsewhere." / ES "Licencia MIT. El núcleo
  local actual corre en localhost y no envía los datos de tu base a otros servicios."

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

**Section headline (EN):** Who is Sinapso for?
**Section headline (ES):** ¿Para quién es Sinapso?

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

5. **You should not need a subscription to use your own files.**
   A local knowledge platform should remain useful without an account or recurring
   fee. Paid continuity should earn its price through synchronization, recovery,
   and support, not by holding local access hostage.

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

5. **Free local core, BYO-key AI.** (counters pain 5)
   The local platform is free forever and requires no account. Smart features run
   on your own pay-per-use keys. Planned paid services cover optional managed
   continuity, not mandatory AI access.

6. **Your files remain the source of truth.** (counters pain 6)
   Plain Markdown and YAML stay in your own folders. The current local core does not
   send vault data elsewhere; Web, LLM, and Git actions require explicit user action.
   Every app-authored write is guarded and journaled. Obsidian handoff is optional.

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

## 6. Why Sinapso and not X (Layer 4: Differentiation)

**Section headline (EN):** There was no tool that did all three.
**Section headline (ES):** No existía una herramienta que hiciera las tres cosas.

Center piece: a three-circle diagram (image slot): "Fast 3D map" + "Real-time voice
agent" + "Local-first, your files". Sinapso sits in the intersection; every
alternative covers at most one circle.

Comparison table (verify pricing before publish; sources in research doc):

| | Sinapso | Obsidian graph | 3D graph plugins | TheBrain / InfraNodus | Voice note apps |
|---|---|---|---|---|---|
| Handles 5k+ notes smoothly | Yes, GPU | No (official limitation) | No (crash / disabled) | Sluggish, bloated | n/a |
| 3D navigable map | Yes | No | Partial, unmaintained | 2D-ish / cluttered | No |
| Real-time voice agent | Yes | No | No | No | Capture only |
| Your own Markdown files | Yes | Yes | Yes | Proprietary / cloud | Their cloud |
| Independent of a host note app | Yes | No | No | Yes | Yes |
| Price | Local core free; BYO-key AI; managed continuity planned paid | Free; Sync optional paid | Free | $180/yr+ / €12-66/mo | $/mo subscriptions |

Tone rule: respectful toward Obsidian everywhere. Sinapso is independent of it, while
one-click handoff remains available for users who choose Obsidian as an editor. The
contrast is with the graph view, not the editor.

---

## 7. Origin story (narrative section)

**Section headline (EN):** Born from an AI. Raised by a human.
**Section headline (ES):** Nacido de una IA. Criado por un humano.

Copy (EN):
> Sinapso started as a repository with a single star, created by Fable, the most
> powerful AI in the world, and left open source. A human found it while hunting for
> a way to see a 5,000-note knowledge base that every other tool choked on. This one
> flew. He audited the code, adopted it, and has been evolving it since: voice,
> research, ingestion, versioning. Now it's yours too. MIT licensed, open to everyone.

Visual: timeline or "constellation being born" treatment (image slot).

---

## 8. Pricing truth (Value / no-money objection)

**Section headline (EN):** The local platform stays free. Continuity is optional.
**Section headline (ES):** La plataforma local sigue siendo gratuita. La continuidad es opcional.

Three columns:
1. **Local core, free forever:** the 3D universe, search, filters, themes, reader,
   optional Obsidian handoff, and local workflows. Open source, MIT, no account.
2. **Bring your own keys:** Web research, language models, and voice remain
   pay-per-use through the user's chosen providers. Managed continuity is not a
   requirement for AI access.
3. **Managed continuity, planned and paid:** opt-in private synchronization,
   encrypted backup, recoverability, versioning, and mobile access. Do not publish
   a price, launch date, encryption algorithm, or zero-knowledge claim until those
   details are approved and implemented.

Contrast line (EN): "Use your local knowledge platform for free. Subscribe only if
managed continuity across devices is worth it to you."

Contrast line (ES): "Usa gratis tu plataforma local de conocimiento. Suscríbete solo
si para ti vale la pena tener continuidad administrada entre dispositivos."

---

## 9. Continuity, mobile, and sharing roadmap

**Section headline (EN):** Your knowledge stays yours, wherever you need it.
**Section headline (ES):** Tu conocimiento sigue siendo tuyo, donde lo necesites.

Frame all roadmap content as planned and opt-in:

- Managed continuity: private synchronization, encrypted backup, recoverability,
  versioning, and mobile access while local files remain canonical.
- Mobile companion first: grounded conversation, research, decisions, search,
  capture, and reading. Full mobile 3D parity comes later.
- Selective document sharing first: recipients get immediate value and an invitation
  to create their own workspace.
- Explicitly deferred: live co-editing, presence, and complex permission matrices.

---

## 10. Trust model (no-trust objection, short section)

**Section headline (EN):** Local by default. External actions stay explicit.
**Section headline (ES):** Local por defecto. Las acciones externas siempre son explícitas.

Four short bullets, plain language:
- The current core scans, renders, searches, and reads on your machine.
- Web, AI, and Git network actions only run when you explicitly trigger them.
- It never overwrites a note silently: writes are user-triggered, previewed, and journaled.
- All the code is open. Read it, fork it, or just use it.

---

## 11. Final CTA (no-hurry close)

**Headline (EN):** Your vault is already a universe. See it tonight.
**Headline (ES):** Tu vault ya es un universo. Míralo esta noche.

Copy (EN):
> One command. No signup, no migration, no config. If you have a folder of Markdown,
> you're 60 seconds from flying through it.

Copy (ES):
> Un comando. Sin registro, migración ni configuración. Si tienes una carpeta de
> Markdown, estás a 60 segundos de recorrerla.

The "no hurry" close for a free tool is effort-based, not scarcity-based: the cost
of trying is nearly zero and the payoff is immediate (Hormozi: dream outcome high,
likelihood high because it works on the vault you already have, time delay one
command, effort none).

- Primary CTA: `npx sinapso "path/to/YourVault"` copy box.
- Secondary: GitHub link + star count.
- Tertiary: "Prefer a desktop app?" link to the Electron build instructions.
- Roadmap link: "Want sync and mobile continuity? Follow the roadmap." / "¿Quieres
  sincronización y continuidad móvil? Sigue la hoja de ruta."

---

## Social proof strategy (current gap, be honest)

Sinapso has no user testimonials yet. Do not fabricate any. Until real quotes exist:

1. **Proof by demo:** real captures and loops of a 4,000+ note vault are the primary
   proof. Screens beat claims.
2. **Proof by community pain:** the pains in section 3 paraphrase real, linkable
   community complaints. Optionally footnote them ("sources") for credibility.
3. **Proof by openness:** GitHub star count, MIT license, "read the code" links.
4. **Backlog task:** collect 3-5 early-user quotes and insert one beside each CTA,
   per the Wynter framework. Highest-leverage missing asset on this page.

## Ziglar objection coverage check

- **No need:** section 3 (pains sourced from real complaints).
- **No desire:** sections 2, 4, 5, 9 (demo + counters + voice showcase + roadmap).
- **No trust:** sections 6, 7, 9, 10 + open source badges + proof-by-demo.
- **No money:** section 8 (free local core, BYO-key AI, optional paid continuity).
- **No hurry:** section 11 (60 seconds to value, zero effort, no migration).

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
