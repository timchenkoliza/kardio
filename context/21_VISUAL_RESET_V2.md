# KARDIO / YANDEX MED — VISUAL RESET V2

Status: **AUTHORITATIVE VISUAL DIRECTION FOR THE NEXT UI IMPLEMENTATION PASS**

Date: 2026-10-18

This document supersedes the current active cardiology UI styling direction for future visual implementation. It does **not** supersede the approved product boundaries, Golden Set, shared data/runtime layer, multi-shell product decision, source/currentness/provenance logic, or editorial image policy.

The existing implementation remains useful as a data/runtime prototype. The visual surface must be rebuilt.

---

# 1. NORTH STAR

Build a physician product that feels:

- as alive, easy, pleasant and habit-forming as a strong consumer product such as Yandex Lavka;
- as calm and confident in information hierarchy as Apple;
- as intelligent and low-friction as Claude / Codex;
- as fast to scan and socially alive as Twitter/X;
- as credible, source-aware and editorially controlled as a serious medical journal;
- visually closer to the supplied Yandex Med / partner-page references than to a medical SaaS dashboard.

The target is **not** “a nicer medical dashboard”.

The target is:

> an intelligent professional environment for physicians where trusted knowledge, tools, experts, discussions, events and partner content behave as one living product.

The product must be useful enough for work, light enough for daily use, and visually desirable enough that opening it does not feel like opening an enterprise system.

---

# 2. BRAND FEELING

## 2.1 Core emotional qualities

The interface should feel:

- light;
- intelligent;
- optimistic;
- fast;
- calm;
- premium but not luxurious;
- modern but not futuristic;
- professional but not bureaucratic;
- medical but not hospital-like;
- playful enough to be memorable, never playful enough to reduce clinical credibility.

## 2.2 Desired tension

The visual language should deliberately sit between:

**consumer delight** × **professional credibility**

and between:

**editorial content product** × **working tool**

The design is successful when neither side wins completely.

Too much consumer delight → looks unserious.

Too much professional utility → becomes another internal medical portal.

## 2.3 Product personality

The product should communicate:

> “I understand what matters to you, I have already organized the complexity, and I will show you the source.”

It should not communicate:

> “Here are 12 modules and 34 filters. Please configure your workspace.”

---

# 3. VISUAL REFERENCE INTERPRETATION

The supplied Yandex Med / partner-page references are the primary visual evidence for the reset.

Use the following principles from them:

- very light canvas;
- soft milky / cool-lilac / blue-white atmospheric background;
- subtle depth through layered surfaces rather than heavy borders;
- strong black typography;
- restrained purple as an interaction/brand signal;
- large confident editorial headlines;
- content cards with meaningful imagery, not decoration;
- gentle surface elevation and soft shadows;
- clear separation between publisher / source / format / content;
- prominent but calm partner attribution;
- tab systems that feel native to the product rather than like admin filters;
- compact iconography;
- rounded geometry used intentionally, not on every object;
- clean modular composition with visual rhythm.

The abstract Pinterest references are **visual-system references only**. They support:

- soft gradients;
- data/network metaphors;
- translucent color fields;
- controlled glow;
- scientific diagrams;
- soft topology / cluster / signal motifs.

They are **not** permission to add decorative abstract graphics to every screen.

---

# 4. WHAT TO KEEP

The following are product/data assets and remain authoritative:

- current no-patient / no-EHR boundary;
- Golden Set facts;
- source registry;
- 24-object evaluation slice;
- current / review / superseded / archive logic;
- source URLs;
- provenance;
- semantic editorial image policy;
- saved / recent / pinned state;
- common search/ranking/filter logic;
- three user-selectable working models A/B/C;
- content must remain source-grounded;
- image-free is better than semantically wrong imagery.

Do not throw away the runtime because the current UI direction failed.

---

# 5. WHAT TO KILL

For the new visual baseline, do not inherit the following visual grammar from the current prototype:

- medical SaaS dashboard look;
- strong specialty-colored canvas covering the whole product;
- burgundy/blue cardiology theme dominating the interface;
- large quantity of bordered rounded cards;
- “card soup” where every object is a container;
- pill navigation for every secondary choice;
- decorative gradients that compete with content;
- generic enterprise sidebars;
- oversized service chrome;
- debug/product-internal language visible in normal UX;
- “Golden Set”, “evaluation slice”, provenance engineering terminology in consumer-facing copy;
- equal visual treatment for all content types;
- generic stock-doctor photography;
- fake medical imagery;
- repeated identical card template across heterogeneous content;
- oversized specialty selector or mode selector as a central product experience.

Existing CSS files may remain in history, but they are **not** the visual source of truth for the new implementation:

- `phase2/kardio-real.css`
- `phase2/kardio-pixel.css`
- `phase2/specialty-surface.css`
- `phase2/kardio-pixel-polish.css`

The next implementation should use a new isolated visual layer / new page rather than trying to rescue the current cascade with additional overrides.

---

# 6. PRODUCT SHELL: ONE PRODUCT, THREE WORKING MODES

A/B/C remain valid, but they are no longer presented as three visibly unrelated products.

All three modes share:

- brand;
- content components;
- typography;
- imagery;
- source grammar;
- interaction language;
- saved state;
- search;
- intelligence layer.

They differ by **layout primitive and working model**.

## A — Explore / Navigator

Purpose: quickest path from curiosity/question to useful professional material.

Composition:

- editorial feed;
- prominent search / command field;
- discovery modules;
- topic and source follow-ups;
- minimal persistent navigation.

This is the best default for first-time and casual repeat use.

## B — Practice / Toolbelt

Purpose: fast repeated use during professional work.

Composition:

- same editorial content system;
- compact persistent utilities;
- quick access to guidelines / calculators / references / saved;
- source/provenance support where useful;
- denser information architecture than A.

No dark admin sidebar.

## C — Workspace

Purpose: longitudinal organization of professional knowledge.

Composition:

- topic / collection / saved-work structure;
- same content grammar;
- more dense and stable spatial organization;
- collections, followed themes, sources, saved material.

C may feel more “workbench-like”, but must still belong to the same visual product family.

## Mode selection

Mode selection is a preference/settings interaction, not a visual hero.

A doctor should be able to switch working model without feeling that they opened another app.

---

# 7. NEW HOME / FEED NORTH STAR

The first new implementation target is **one excellent 1440 px Explore/Navigator home screen on real content**.

Do not build the whole product first.

## 7.1 Desktop frame

Reference composition:

- global product navigation on the left or compact top-left product area;
- content center column with strong vertical rhythm;
- optional contextual right-side surface only when it adds real value;
- content width should feel editorial, not dashboard-wide;
- white/light canvas with subtle atmospheric depth.

## 7.2 Global navigation

Recommended first-level items:

- Поиск
- Лента
- Калькуляторы
- Справочник
- Мои материалы
- События
- Курсы
- Обсуждения

These are IA candidates, not permission to fabricate missing content.

If Golden Set does not support a destination yet, the product may show a clear controlled empty/data-gap state.

Navigation should be visually calm. Selected state may use a soft lilac field.

## 7.3 Feed header

At the top of feed:

- `Лента`
- primary tabs such as:
  - Для вас
  - Медицинские новости
  - Клинические рекомендации
  - Исследования
  - Курсы
  - optionally other source-grounded categories

Tabs should use one clear selected treatment and minimal chrome.

## 7.4 Feed rhythm

The feed must intentionally mix heterogeneous modules.

Do **not** produce ten visually identical cards.

A strong 8–10 object first screen could contain:

1. compact research/story card;
2. large editorial / featured story;
3. compact guideline update;
4. partner or publisher story when appropriate;
5. text-only update;
6. expert-led object;
7. clinical/source-visual object;
8. event / learning module;
9. saved-resurfacing or related topic module;
10. short professional update.

Visual rhythm should alternate density and media use.

---

# 8. CONTENT BLOCK TAXONOMY

Each content type should choose an editorial template based on semantics.

The template is determined by the content object, not by a desire to make the grid look varied.

## 8.1 Compact editorial story

Use for:

- research;
- journal update;
- professional news;
- short guideline update.

Structure:

- source icon/name;
- date / reading-time only if factual;
- headline;
- short deck;
- optional small semantic visual;
- save / source / discussion actions where available.

## 8.2 Featured editorial story

Use when the ranking/content warrants emphasis.

Structure:

- meaningful large visual or image-free typographic composition;
- source / format / date;
- large headline;
- deck;
- one primary next action;
- optional related sub-items.

Featured does not mean “gradient hero every time”.

## 8.3 Guideline document

Should feel closer to a trusted document than a social post.

Structure:

- official source;
- title;
- currentness/version status;
- publication/update date;
- clinically useful short explanation;
- source CTA;
- explicit newer-version relationship if superseded.

Avoid decorative photography unless it belongs to the actual source/material.

## 8.4 Clinical visual / figure-led material

Use for:

- Echo;
- ECG;
- imaging;
- clinical figure;
- original journal/source visual.

Rules:

- image is evidence/content, not decoration;
- preserve aspect ratio;
- no aggressive crop;
- optional caption / source;
- allow larger display than ordinary thumbnail.

## 8.5 Expert-led material

Use only when a real expert identity and image are available.

Structure:

- real portrait;
- name;
- role / organization;
- topic/title;
- concise contribution;
- source.

Never replace missing portrait with generic doctor photography.

## 8.6 Event-led material

Use real event imagery, stage/speaker/venue asset or original organizer graphic.

Structure:

- event visual;
- organizer;
- date/location where factual;
- title;
- relevance/action.

## 8.7 Video / lecture

Use:

- real speaker frame / cover;
- duration only if factual;
- speaker;
- topic;
- format.

The play affordance should be visually obvious without dominating the entire object.

## 8.8 Partner / brand story

Must be unmistakably attributed as partner content but not visually degraded into an ad banner.

In-feed representation:

- brand identity;
- `Партнёрский материал` / equivalent explicit disclosure;
- semantic visual;
- title/deck;
- optional category chips;
- clear transition to partner page.

No dark patterns. Partner status must be visible before click.

## 8.9 Text-only story

Text-only is a first-class template.

Use when no semantically correct image exists.

The typography and spacing must make the object feel intentional, not unfinished.

## 8.10 Micro-update

Use for:

- small important update;
- changed guideline version;
- new event date;
- source alert.

Compact row, not full card.

---

# 9. EDITORIAL IMAGE SYSTEM

The existing editorial image policy remains mandatory.

Priority:

1. exact original/source asset;
2. source-document figure/cover;
3. real expert portrait;
4. real event imagery;
5. semantically matched real clinical asset with provenance/rights tracking;
6. credible primary external source asset;
7. no image.

Never use generic stock doctor imagery as fallback.

Never force an image because a template looks empty.

The visual rhythm should intentionally include image-free content.

A high-quality feed may look like:

`visual → text-only → visual → text-only → portrait → figure → text-only → event`.

This is preferable to repeating the same thumbnail position in every card.

---

# 10. PARTNER PAGE NORTH STAR

The supplied NovoNordisk page is a structural visual reference, not approved medical copy.

A partner page should feel native to Yandex Med while clearly owned/managed by the partner.

## 10.1 Header

- back;
- Yandex Med identity;
- save;
- share;
- overflow actions.

## 10.2 Partner identity row

- real brand logo/avatar;
- brand name;
- verified/partner status only if supported;
- explicit `Партнёрская страница` disclosure;
- `О бренде` / brand information entry.

## 10.3 Brand hero

Hero can use stronger art direction than ordinary feed cards.

Structure:

- strong headline;
- short deck;
- one CTA;
- brand/source visual;
- partner-owned imagery.

No generic doctor stock imagery unless it is genuinely supplied/owned by the partner and semantically correct for that exact material.

## 10.4 Capability strip

Examples, only when content exists:

- Клинические данные
- Видео и лекции
- Кейсы из практики
- Интерактивные калькуляторы
- Вопросы экспертам

## 10.5 Disclosure

Mandatory native disclosure block:

- who creates/manages the page;
- that content/materials/updates are provided by the brand where applicable;
- commercial/source layer remains separate in ranking/trust semantics.

## 10.6 Partner navigation

Potential sections:

- Обзор
- Научные данные
- Кейсы
- Материалы
- Калькуляторы
- Вопросы
- События

Again: only display sections that have real source-grounded content.

## 10.7 Content below hero

Use the same shared editorial component family as the main product, adapted for partner attribution.

Do not build a separate microsite design language.

---

# 11. INTELLIGENCE / AI BEHAVIOR LAYER

The product should feel intelligent primarily through **behavior and organization**, not through chatbot chrome.

No permanent “AI assistant” bubble is required.

## 11.1 Core principle

The system should answer:

> “What is the most useful next professional object/action for this physician, given explicit intent and product context?”

without pretending to know patient context.

## 11.2 Inputs allowed for intelligence

Within current boundaries, use only allowed signals such as:

- explicit search query;
- selected specialty;
- followed topics;
- saved/pinned content;
- recent content interactions;
- source preference where explicit;
- current surface / mode;
- freshness/currentness;
- editorial priority;
- trust/source type;
- explicit user settings.

Do not infer patient state or encounter context.

## 11.3 Intelligent behaviors

### Query-to-object

Search should return not only documents but structured next paths:

- current guideline;
- source;
- related explanation;
- related learning object;
- tool if a real source-grounded tool exists.

### Related chain

After opening an item, surface 2–4 meaningfully related next objects.

Relationship must be explainable through topic/source/type/version, not engagement manipulation.

### Version intelligence

If a material is superseded:

- do not hide history;
- visibly route to the newer version;
- explain the relationship.

### Resurfacing

Saved/recent material may return when relevant to explicit current intent.

### Mode adaptation

A/B/C change composition:

- Explore emphasizes discovery;
- Practice emphasizes utility and speed;
- Workspace emphasizes organization and continuity.

The underlying facts/ranking constraints remain shared.

### Intelligent density

The system may choose a large/compact presentation based on information role and priority.

Do not make every high-ranked item a hero.

## 11.4 Explainability

For important recommendations, the interface should be able to answer in human terms:

- why this is shown;
- source;
- freshness/version;
- relationship to the current topic/query.

Do not expose raw ranking scores.

---

# 12. INTERACTION PRINCIPLES

## 12.1 Consumer-level responsiveness

Interaction must feel immediate.

- optimistic local save/pin state;
- no unnecessary modal chains;
- no multi-step configuration for common actions;
- touch targets remain usable;
- animations short and purposeful.

## 12.2 Motion

Motion can provide some “Lavka energy”, but must not become entertainment.

Allowed:

- gentle 120–220 ms elevation/translation;
- smooth tab/content transition;
- subtle image reveal;
- compact save confirmation;
- soft expansion of contextual actions.

Avoid:

- bouncing clinical content;
- continuous ambient animation;
- decorative loading loops;
- parallax that harms reading.

Respect `prefers-reduced-motion`.

## 12.3 Progressive disclosure

Default state should remain simple.

Advanced source/provenance/details appear when needed, not as a permanent wall of metadata.

Source itself must remain easy to reach.

---

# 13. DESIGN SYSTEM TOKENS V2

These are directional implementation tokens for the reset, not a final brandbook replacement.

## 13.1 Base palette

```css
--v2-bg: #F7F8FC;
--v2-bg-elevated: #FFFFFF;
--v2-surface-soft: #F3F3FA;
--v2-surface-lilac: #F1EDFF;
--v2-surface-blue: #EEF4FF;
--v2-surface-warm: #FAF7F2;

--v2-text: #0B1026;
--v2-text-secondary: #5F6478;
--v2-text-tertiary: #9297A8;
--v2-border: rgba(33, 39, 67, 0.09);
--v2-border-strong: rgba(33, 39, 67, 0.15);

--v2-brand: #7047FF;
--v2-brand-hover: #6137F3;
--v2-brand-soft: #EEE8FF;
--v2-blue: #769CFF;
--v2-lilac: #B5A0FF;
--v2-cyan: #A9D9F5;
```

The product should **not** be a purple interface.

Purple is an interaction/identity accent, not the canvas color.

Clinical/status colors stay semantic and separate.

## 13.2 Atmospheric gradient

Use sparingly on top-level surfaces / brand hero only.

Example direction:

```css
background:
  radial-gradient(circle at 18% 12%, rgba(181,160,255,.20), transparent 36%),
  radial-gradient(circle at 80% 18%, rgba(118,156,255,.16), transparent 34%),
  #F7F8FC;
```

Never place a gradient behind every card.

## 13.3 Typography

Use YS Text if this remains the approved product font.

Recommended hierarchy:

```text
Display / page hero       40–48 / 1.02–1.08 / medium
Page title                30–36 / 1.10
Feature story title       26–34 / 1.08–1.14
Standard story title      18–21 / 1.20–1.28
Compact story title       15–17 / 1.25–1.32
Body                      14–16 / 1.45–1.58
Metadata                  11–13 / 1.30
```

Long titles are allowed to breathe.

Do not introduce a “font zoo”.

Use size/weight/spacing intentionally and consistently.

## 13.4 Radii

```css
--v2-radius-control: 10px;
--v2-radius-card: 16px;
--v2-radius-feature: 22px;
--v2-radius-sheet: 24px;
--v2-radius-pill: 999px;
```

Pill radius only for true chips/tags/toggles.

Do not use pills for ordinary navigation rows or every status label.

## 13.5 Shadow

Soft only.

```css
--v2-shadow-card: 0 8px 28px rgba(30, 37, 67, .06);
--v2-shadow-float: 0 20px 60px rgba(30, 37, 67, .10);
```

Many content objects should use **no shadow** and rely on surface/border/spacing.

## 13.6 Spacing

Use an 8 px base rhythm with controlled exceptions:

```text
4 / 8 / 12 / 16 / 24 / 32 / 40 / 56 / 72
```

Editorial vertical rhythm is more important than making all modules the same height.

---

# 14. LAYOUT PRIMITIVES

The new system should be built from a small set of layout primitives rather than dozens of unrelated cards.

## 14.1 App frame

- global nav;
- primary content viewport;
- optional contextual rail;
- floating/sheet overlays when necessary.

## 14.2 Editorial stack

Vertical composition of heterogeneous stories with variable density.

## 14.3 Split story

Text + semantic image.

Can alternate image position when justified by composition, but do not create random checkerboard rhythm.

## 14.4 Feature canvas

Large story / partner hero / major editorial object.

## 14.5 Horizontal rail

Use for:

- related items;
- courses;
- event collections;
- partner current materials;
- topic exploration.

## 14.6 Utility strip

Compact professional tools/actions, not content cards.

## 14.7 Context sheet

For source, provenance, save organization, share, or secondary detail.

## 14.8 Workspace collection

A compact grouping primitive used in C, not a decorative dashboard tile.

---

# 15. RESPONSIVE PRINCIPLES

Design desktop and mobile as related compositions, not scaled copies.

Acceptance anchors remain:

- 390;
- 768;
- 1440.

## 1440

- full product navigation may be visible;
- editorial center remains constrained;
- featured media can be large;
- partner page may use broad hero composition;
- optional contextual rail.

## 768

- navigation compresses;
- media and text remain readable;
- heterogeneous feed rhythm survives;
- secondary contextual rail becomes sheet/drawer or disappears;
- horizontal content rails remain touch/trackpad friendly.

## 390

- bottom or compact top navigation;
- one-column editorial flow;
- feature stories recompose, not merely shrink;
- image can move above/below headline;
- labels/tabs may become horizontally scrollable;
- primary headline remains prominent;
- source remains visible;
- no horizontal page overflow.

---

# 16. CONTENT / UI LANGUAGE

Normal user-facing UI must never expose implementation terminology such as:

- Golden Set;
- evaluation slice;
- ranking score;
- runtime;
- provenance_type;
- source_id;
- debug IDs.

Translate source/trust concepts into clear physician-facing language.

Examples:

- `Официальный источник`
- `Клинические рекомендации`
- `Есть более новая версия`
- `Требует проверки актуальности`
- `Партнёрский материал`

Do not over-label obvious content.

---

# 17. PARTNER / COMMERCIAL LAYER

Partner content is allowed to be visually strong and beautiful.

It must never be visually deceptive.

Requirements:

- explicit partner attribution;
- commercial/source layer available to ranking/trust logic;
- native visual integration;
- no fake editorial independence;
- no hidden sponsor status;
- no product UI that makes partner material look like an official clinical recommendation.

Partner pages can have richer branding while remaining recognizably inside Yandex Med.

---

# 18. AI / GENERATIVE UI BOUNDARY

Do not redesign the product as a chatbot.

AI can appear as:

- smart search;
- summarization;
- structured explanation;
- related-object suggestions;
- topic synthesis;
- query refinement;
- dynamic composition;
- source-aware answer surfaces;
- later Gen-UI modules where explicitly allowed.

AI must not appear as:

- fictional autonomous clinician;
- patient-aware copilot;
- diagnostic agent;
- treatment recommender for an individual patient;
- unexplained engagement algorithm.

The most intelligent interface may often look simpler, not more “AI”.

---

# 19. IMPLEMENTATION ORDER

## Phase V2.0 — freeze old visual direction

Do not continue polishing the old CSS stack.

Keep it for reference/history only.

## Phase V2.1 — North Star Explore desktop

Create a NEW isolated implementation target, for example:

- `phase3/north-star-explore.html`
- `phase3/north-star-v2.css`
- `phase3/north-star-v2.js`

Requirements:

- 1440 px first;
- real Golden Set objects only;
- 8–10 objects;
- at least 5 distinct editorial templates;
- semantic image policy;
- no generic stock imagery;
- YS Text;
- visual direction based on supplied Yandex Med references;
- no reuse of old visual CSS cascade.

**Gate:** do not scale to B/C until this one screen is approved.

## Phase V2.2 — Partner page North Star

Build one partner page using the same shared component grammar.

Use real partner/source content only when available. Otherwise build structure without inventing medical claims.

## Phase V2.3 — design-system extraction

After Explore + Partner visual approval, extract:

- tokens;
- typography;
- card/story templates;
- nav;
- source badges;
- controls;
- media treatment;
- responsive rules.

Do not define the system before the strongest screens exist.

## Phase V2.4 — Apply to B / Practice

Build B from the approved same components plus utility layout.

## Phase V2.5 — Apply to C / Workspace

Build C from the same approved component family plus topic/collection structure.

## Phase V2.6 — responsive

Explicit 768 / 390 recomposition.

## Phase V2.7 — interaction intelligence

Add:

- related-object behavior;
- resurfacing;
- intelligent next actions;
- saved flows;
- explainable recommendations;
- mode persistence.

## Phase V2.8 — visual QA / Vercel Preview

Only after the new direction is stable:

- screenshot QA;
- 390 / 768 / 1440;
- long-title stress;
- no-image states;
- source/version states;
- event/expert/partner states;
- Vercel Preview;
- final merge gate.

---

# 20. NORTH STAR SCREEN ACCEPTANCE CRITERIA

The first Explore screen should be rejected if any of the following are true:

- it looks like an internal dashboard;
- more than half the visible objects use the same card template;
- generic stock doctor imagery appears;
- specialty colors dominate the canvas;
- content hierarchy is weaker than navigation chrome;
- long titles are truncated to preserve card geometry;
- source identity is hard to find;
- every object is inside a heavy rounded container;
- there is no visual rhythm between text-only and visual content;
- partner content is visually ambiguous;
- UI implementation/debug language is visible;
- the experience looks “medical because burgundy/blue”, rather than medical because the content and information design are credible;
- it could be mistaken for a generic AI-generated SaaS dashboard.

The screen is directionally successful when:

- it feels immediately lighter and more desirable than the current prototype;
- real medical content looks like the hero, not the chrome;
- the product feels alive despite no patient data;
- source/trust/version state is available without clutter;
- the design could plausibly belong to the same product family as the supplied Yandex Med references;
- the UI is pleasant enough for daily use and serious enough for physician work.

---

# 21. FINAL DESIGN PRINCIPLE

Do not make medicine “fun” by adding playful decoration.

Make the product enjoyable by making professional complexity feel:

- lighter;
- clearer;
- faster;
- more intelligent;
- more beautiful;
- better organized.

The visual system should create delight through precision, rhythm, motion, relevance and high-quality content presentation.

That is the intended meaning of:

> **“Yandex Lavka-level product energy for medicine.”**
