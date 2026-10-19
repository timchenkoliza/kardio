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

## Real-content invariant

All three shells consume the same canonical Cardio Golden Set.

The same `golden_id` must resolve to the same:
- title;
- summary;
- expert/author;
- organization;
- publication metadata;
- source URL;
- provenance;
- currentness/version state;
- trust/editorial status;
- commercial status;
- QA metadata.

A/B/C may rank and group the objects differently. They may not rewrite or simplify canonical facts independently.

Use the fixed evaluation manifest in `data/cardio-evaluation-slice-v1.json` for fair initial comparison.

## Editorial-image invariant

Image selection is shared editorial metadata, not shell-owned decoration.

The same `golden_id` should resolve to the same verified/source-grounded image asset across A/B/C unless a shell intentionally renders that object image-free because of density/layout.

The shells may vary crop/composition only within the semantic constraints of `18_EDITORIAL_IMAGE_POLICY.md`.

Never let one shell use an unrelated generic doctor photo merely because its card format expects imagery.

If there is no semantically correct real image, use an image-free card.

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

The pixel-first build contract applies to all three shells **after real-content binding is stable**.

Visual QA must evaluate each shell independently at the required anchor viewports while checking that shared content and business rules remain consistent.
