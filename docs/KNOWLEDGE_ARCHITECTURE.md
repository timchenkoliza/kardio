# Knowledge Architecture

The product must not synthesize the physician experience from generic model knowledge alone.

## Four input layers

1. **Source Registry** — sources, tools, communities, experts and what job each serves.
2. **Content / Capability Index** — concrete items available now: guideline updates, articles, tools, calculators, people, events, tasks and custom links.
3. **Physician Model** — explicit and cautiously inferred professional context.
4. **Moment Context** — what the physician is doing right now.

The UI is a projection of these layers, not a fixed feed.

## Source Registry

Observed source metadata may include category, subcategory, specialty, mode, archetype, job and metadata completeness.

**Important:** appearance in physician research does not establish clinical trust. Metadata completeness is not evidence quality.

Production fields should separately model trust, evidence tier, commercial status, conflict of interest, ingestion method, freshness policy, jurisdiction, permissions and allowed surfaces.

## Content / Capability Index

Rank capabilities/items, not source names alone.

Typical fields:

```text
item_id
source_id
item_type
title
summary
published_at
verified_at
specialties[]
topics[]
jobs[]
modes[]
freshness
evidence_tier
commercial_status
patient_specific
actionability
provenance[]
```

## Physician Model

Stable: specialty, subspecialty, care setting, role, jurisdiction, language, pinned tools and chosen sources.

Semi-stable: interests, learning goals, preferred depth, formats, source preferences and interruption tolerance.

Dynamic: workflow phase, active case, current question, urgency, time budget, device and recent actions.

Any inferred field should carry confidence, evidence, recency and a user-editable flag.

## Moment Context

At minimum:

```text
pre_visit
in_visit
result_review
therapy_plan
post_visit
between_visits
research
learning
admin
```

## Typed UI Modules

Gen-UI composes approved modules such as patient brief, patient delta, timeline, evidence answer, guideline update, source feed, expert, Telegram channel, calculator, drug reference, result review, therapy safety, ambient note, task list, custom link, event and learning item.

The LLM composes modules. It does not invent arbitrary high-stakes clinical DOM.
