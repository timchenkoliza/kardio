# Phase 1 — Architecture Comparison

Status: **comparison complete; user selected all three architectures as first-class product shells**.

The original purpose of this document was to compare three structurally different concepts on the same content and jobs. That comparison remains useful, but the decision gate has changed: KARDIO will not collapse them into one winner.

## Shared content / jobs

All concepts use the same MVP capability set:
- search;
- clinical guidelines;
- calculators/tools;
- drugs/reference;
- referral/VMP navigation;
- recent;
- explicit pins/follows;
- compact important updates;
- source registry;
- provenance/source separation.

No concept may add patient data, EHR, appointment/encounter state, patient-specific alerts or clinical tasks.

## Concept A — Search-first Navigator

### Thesis
The fastest path to first value is one dominant search entry point with four explicit quick jobs.

### Strengths
- lowest onboarding burden;
- fastest path for unknown or explicit intent;
- strongest MVP fit;
- easiest to keep source visibility adjacent to results;
- lowest implementation complexity.

### Risks
- may feel less distinctive for high-frequency users;
- repeated switching across tools/sources can require more navigation than Toolbelt.

### Best role in the multi-shell product
Default candidate for physicians who prefer question-first retrieval and minimal navigation.

## Concept B — Professional Toolbelt

### Thesis
A cardiologist repeatedly uses a relatively small set of professional capabilities, so keep those capabilities persistently available around a central working surface.

### Strengths
- strong repeat-use mechanics;
- rapid transitions between guideline, calculator, drug/reference and source registry;
- creates professional muscle memory;
- distinctive without relying on generic dashboard/feed patterns.

### Risks
- persistent navigation consumes more screen area;
- requires excellent responsive transformation on mobile;
- can become feature-heavy if capability governance weakens.

### Best role in the multi-shell product
High-frequency operating mode for physicians who want stable, persistent access to core professional capabilities.

## Concept C — Knowledge Workspace

### Thesis
The durable unit is a professional topic/collection rather than a page or feed; search is embedded globally while topic context persists.

### Strengths
- strongest for deeper recurring topic work;
- naturally supports collections, saved knowledge and professional source context;
- best structural bridge to later explicit custom workspaces / Gen-UI;
- scales conceptually to other specialties.

### Risks
- highest architecture complexity;
- topic/workspace concepts can burden first-time users;
- must not require setup before first value;
- biggest risk for a 3.5-person team if treated as the only MVP shell.

### Best role in the multi-shell product
Deep-work mode for physicians who organize professional information by durable topics/collections.

## Decision

The user explicitly selected **A + B + C**.

KARDIO therefore uses a **multi-shell architecture**:

```text
shared domain / state / content / trust rules
                ↓
      ┌─────────┼─────────┐
      ↓         ↓         ↓
 Search-first  Toolbelt  Workspace
 Navigator
```

The physician explicitly selects a shell and may change it later.

The shells must not fork:
- factual content;
- source/trust status;
- business rules;
- saves;
- recent history;
- pins/follows;
- search history;
- legal/safety behavior.

They may differ in navigation, hierarchy, composition, density and responsive behavior.

Canonical decision document:
- `context/phase2/MULTI_SHELL_ARCHITECTURE.md`

Current shared-state prototype:
- `phase2/kardio-app.html`

## Validation question now

The product question is no longer "Which shell wins?"

It is:

> For which physician/work pattern does each shell produce the highest useful-task success while preserving trust and low cognitive cost?

Compare by:
- time to first successful answer;
- source verification rate;
- search → result/source open;
- tool completion;
- repeat useful use;
- WUP;
- retention;
- shell switch rate;
- explicit user preference.

Do not optimize shell recommendation for time spent or engagement.
