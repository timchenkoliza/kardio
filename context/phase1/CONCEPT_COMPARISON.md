# Phase 1 — Architecture Comparison

Status: **visual discovery only**. No direction is selected by this document.

All three concepts use `PHASE1_CONTENT_SET.md`.

## Evaluation criteria

Score each concept from 1 (weak) to 5 (strong):

- time to first useful answer;
- source/provenance visibility;
- cognitive load;
- calculator/tool access;
- repeat-use mechanics;
- scalability to other specialties;
- implementation cost for a 3.5-person team;
- fit for later explicit Gen-UI customization;
- mobile coherence;
- risk of becoming generic AI/SaaS UI.

---

# Concept A — Search-first Navigator

## Thesis

KARDIO behaves primarily like a high-trust professional search/navigation product.
The first screen is dominated by one search field, four explicit quick jobs, recent/frequent access, and one compact updates strip.

The user's mental model is:

> `I know what I need → KARDIO gets me to the answer/tool/source quickly.`

## Information hierarchy

1. Global search
2. Four quick jobs
3. Recent / pinned
4. One compact professional update
5. Source registry access
6. Secondary later customization

## Navigation model

Search-centric with lightweight top-level destinations:
- Search
- Guidelines
- Tools
- Sources
- Saved

The user should rarely need deep menu traversal.

## Desktop behavior

- search is the dominant horizontal element;
- results use a two-column reading pattern: result/content + provenance/source detail;
- quick jobs remain immediately visible but visually secondary after a search starts;
- source class is encoded structurally, not only by color.

## Tablet behavior

- search remains fixed near top;
- results become single-column with inline provenance drawer/sheet;
- quick jobs become a compact two-by-two or horizontal cluster.

## Phone behavior

- search + four jobs occupy the first viewport;
- recent/pinned follows;
- update remains one compact item;
- source details open in a sheet, never disappear.

## Strongest advantage

Fastest path to first value and closest fit to the current MVP architecture and metrics (`time to first successful answer`, `search → open`, `source-open rate`).

## Biggest risk

Can feel like a specialised search engine rather than a distinctive professional product if repeat-use mechanics and source navigation are weak.

## Gen-UI fit

Good as a later extension: custom screens can exist behind an explicit `Workspaces` or `My setup` entry without redefining the MVP shell.

## Preliminary score

| Criterion | Score |
|---|---:|
| Time to first useful answer | 5 |
| Source visibility | 5 |
| Cognitive load | 5 |
| Tool access | 4 |
| Repeat-use mechanics | 3 |
| Multi-specialty scalability | 5 |
| 3.5-person implementation fit | 5 |
| Later Gen-UI fit | 4 |
| Mobile coherence | 5 |
| Anti-generic differentiation | 3 |

---

# Concept B — Professional Toolbelt

## Thesis

KARDIO behaves like a compact professional instrument layer: search is always available, while trusted tools, guidelines, references, and chosen sources remain persistently one action away.

The user's mental model is:

> `These are the few professional capabilities I use repeatedly; search is the universal fallback.`

## Information hierarchy

1. Persistent toolbelt / command strip
2. Active tool or search workspace
3. Provenance/source panel
4. Recent/pinned capability history
5. Compact updates

## Navigation model

Capability-first rather than page-first.

Persistent actions:
- Search
- Guidelines
- Calculator
- Drug/reference
- VMP/referral
- Sources

Opening a capability swaps the central workspace instead of navigating through a deep hierarchy.

## Desktop behavior

- narrow persistent left rail or top command bar;
- central active workspace;
- optional right provenance/source rail;
- selected tool state is always obvious.

## Tablet behavior

- toolbelt becomes a compact top/bottom command strip;
- source details become a side sheet;
- active workspace occupies most of the screen.

## Phone behavior

- 4–5 primary capabilities become a bottom/action bar;
- search remains a first-class top action;
- secondary tools live in an explicit `More` sheet;
- no dense multi-pane layout.

## Strongest advantage

Best repeat-use ergonomics for calculators, guidelines, drug lookup, and source access. Creates a strong professional-tool identity without requiring personalization algorithms.

## Biggest risk

The persistent toolbelt can prematurely freeze the wrong taxonomy if the four quick jobs or initial capability set are not validated with cardiologists.

## Gen-UI fit

Very strong. Later user-created workspaces can rearrange or add approved capabilities without changing the core mental model.

## Preliminary score

| Criterion | Score |
|---|---:|
| Time to first useful answer | 4 |
| Source visibility | 4 |
| Cognitive load | 4 |
| Tool access | 5 |
| Repeat-use mechanics | 5 |
| Multi-specialty scalability | 4 |
| 3.5-person implementation fit | 4 |
| Later Gen-UI fit | 5 |
| Mobile coherence | 4 |
| Anti-generic differentiation | 5 |

---

# Concept C — Knowledge Workspace

## Thesis

KARDIO behaves like a structured professional knowledge workspace organised around topics, source collections, and reusable knowledge contexts, with search embedded everywhere.

The user's mental model is:

> `I maintain a compact professional workspace around the topics and sources that matter to me.`

## Information hierarchy

1. Topic / collection context
2. Search within or across the workspace
3. Guideline/source collection
4. Tools relevant to the topic
5. Saved/recent material
6. Compact updates

## Navigation model

Workspace/collection-first.

Examples of non-final workspace labels:
- `ХСН`
- `Мои КР`
- `Инструменты`
- `Источники`

These are demonstrative architecture labels, not approved product taxonomy.

## Desktop behavior

- left collection/topic navigator;
- central reading/search canvas;
- right source/provenance stack when useful;
- strong support for switching between source, guideline, tool, and saved material within one professional context.

## Tablet behavior

- collection navigator collapses to a drawer;
- central canvas remains primary;
- source/provenance uses a sheet.

## Phone behavior

- workspace selector becomes a top switcher;
- content is sequential;
- search remains visible;
- no attempt to preserve desktop multi-pane geometry.

## Strongest advantage

Strongest long-term information architecture for explicit user ownership, source collections, cross-specialty expansion, and later Gen-UI workspaces.

## Biggest risk

Higher setup cost and slower first value. It can overbuild the MVP before search/retrieval utility is proven.

## Gen-UI fit

Excellent structurally, but dangerous if introduced too early: users may be asked to configure a system before they have experienced baseline value.

## Preliminary score

| Criterion | Score |
|---|---:|
| Time to first useful answer | 3 |
| Source visibility | 5 |
| Cognitive load | 3 |
| Tool access | 4 |
| Repeat-use mechanics | 5 |
| Multi-specialty scalability | 5 |
| 3.5-person implementation fit | 3 |
| Later Gen-UI fit | 5 |
| Mobile coherence | 3 |
| Anti-generic differentiation | 5 |

---

# Current product recommendation before visual rendering

Do **not** select a winner from scores alone.

However, the evidence creates a useful hypothesis:

- **Concept A** is the strongest MVP baseline because it maps most directly to current product boundaries, first-screen source of truth, pilot metrics, and resource constraints.
- **Concept B** is the strongest challenger because it may create superior repeat utility and a more distinctive professional identity without requiring algorithmic personalization.
- **Concept C** should be tested as the long-term architecture / later customization direction, but it has the highest risk of overbuilding before core search utility is proven.

The Phase 1 visual prototypes should therefore test one decisive question:

> Can Toolbelt or Workspace produce materially better repeat-use and professional-product clarity than Search-first **without** increasing first-value time or implementation burden enough to damage the MVP?

## Selection gate after prototype review

A direction should only win if it demonstrates:

1. first value is obvious within the first screen;
2. source class/provenance is visible without clutter;
3. four core jobs are reachable without navigation ambiguity;
4. repeat use improves without inferred personalization;
5. phone layout is native, not a collapsed desktop;
6. architecture remains feasible for a 3.5-person team;
7. later Gen-UI can be added without making AI the primary UI.
