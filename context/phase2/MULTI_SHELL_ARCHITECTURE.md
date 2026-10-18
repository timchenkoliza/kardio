# KARDIO — Multi-shell Architecture Decision

Status: **user-selected product direction**.

Decision date: 2026-10-18.

## Decision

Do not select one Phase 1 concept as the sole product shell.

KARDIO will support three first-class interface assemblies over the same product capabilities and data model:

1. **Search-first Navigator** — dominant search, quick jobs, recent, compact updates.
2. **Professional Toolbelt** — persistent access to tools/sources with a central working area.
3. **Knowledge Workspace** — topic/collection-oriented navigation for deeper repeated work.

The physician explicitly chooses the preferred assembly and may switch later.

This is not personalization inferred by the system. It is a direct user setting.

## Architectural invariant

The three assemblies are different shells over the same domain layer.

Shared across all shells:
- search/query model;
- result objects;
- guideline/source provenance;
- calculators/tools;
- drug/reference entry points;
- VMP/referral navigation;
- source registry;
- saves;
- recent history;
- explicit pins/follows;
- trust/editorial status;
- legal/safety gates;
- analytics events;
- user settings.

Shell-specific:
- navigation model;
- composition;
- density;
- module placement;
- hierarchy;
- responsive transformation.

Do not fork content or business rules by shell.

## User-control contract

- First use may present a neutral assembly chooser.
- The chosen assembly is persisted as an explicit preference.
- A visible `Сменить сборку` control must remain accessible.
- Switching shell must not delete or reset saved items, pins, follows, recent activity or source settings.
- The system must not silently switch assemblies based on behavior.
- Later, the product may suggest another assembly, but switching still requires explicit confirmation.

## MVP implementation principle

For the prototype, shell selection may be stored locally.

For production, model it as a user-owned setting, e.g.:

```text
ui_shell = search_first | toolbelt | knowledge_workspace
```

This setting is not a clinical or psychological profile.

## Current implementation proof

`phase2/kardio-app.html` is the current shared-state prototype.

It implements:
- explicit first-use shell selection;
- switching between all three shells;
- shared query state;
- shared recent history;
- shared saved items;
- shared pinned capabilities;
- one common source registry / trust model;
- persistence in local storage for prototype review.

The older `phase2/kardio-multishell.html` is only an iframe-based selection wrapper and should not be treated as the target production architecture.

## Why keep all three

### Search-first Navigator
Best for:
- first value;
- uncertain intent;
- fast retrieval;
- lightweight onboarding.

### Professional Toolbelt
Best for:
- repeat utility;
- rapid switching between common professional tools;
- high-frequency users.

### Knowledge Workspace
Best for:
- deeper topic-oriented work;
- recurring collections;
- future explicit Gen-UI/workspace extension.

These are different operating models, not cosmetic themes.

## Product metric implication

Compare shells on the same utility metrics:
- time to first successful answer;
- search → source open;
- calculator/tool completion;
- source verification;
- repeat useful use;
- correction rate;
- WUP;
- retention.

Do not optimize shell selection for time spent or engagement.

## Analytics requirement

Capture explicit shell selection and switching as product events, for example:

```text
shell_chooser_viewed
shell_selected
shell_switched
shell_returned
```

Measure utility by shell, but do not infer clinical context from shell choice.

## Phase 2 consequence

The previous gate "select one Phase 1 direction" is replaced by:

> Freeze the three-shell product architecture and build them against one shared domain/content contract.

The pixel-first build contract now applies to all three shells.

Visual QA must evaluate each shell independently at the required anchor viewports while checking that shared content and business rules remain consistent.

## Verification status

- Multi-shell product decision: VERIFIED by explicit user instruction.
- Shared-state prototype: IMPLEMENTED.
- Browser visual QA at anchor viewports: NOT VERIFIED in the current session.
- Vercel Preview: NOT VERIFIED because no connected Vercel team/project is available in the current session.
