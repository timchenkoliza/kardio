# Knowledge Architecture

## Principle

The assistant is not allowed to synthesize the product experience from generic model knowledge alone.

Every concept must be composed from four explicit layers:

1. **Source Registry** — what sources/tools/communities exist and what job they serve.
2. **Content / Capability Index** — concrete items available now: articles, guideline updates, tools, calculators, people, events, tasks.
3. **Physician Model** — explicit and inferred user context.
4. **Moment Context** — what the physician is doing right now.

The UI is a projection of these layers, not a fixed feed.

---

## 1. Source Registry

The supplied source research contains:
- source name and URL;
- category/subcategory;
- specialty mapping;
- delivery mode;
- archetype;
- job;
- metadata completeness.

### Critical semantic rule

`completeness` means **completeness of registry metadata**.

It is NOT:
- evidence quality;
- trust;
- clinical reliability;
- editorial endorsement;
- user preference.

Do not use it as a trust/ranking signal.

### Required additional fields for production

Each source should eventually receive:

- `trust_status`
- `clinical_evidence_tier`
- `commercial_status`
- `conflict_of_interest`
- `ingest_method`
- `refresh_policy`
- `last_checked_at`
- `jurisdiction`
- `permissions`
- `allowed_surfaces`
- `safety_scope`

These must be verified independently.

---

## 2. Content / Capability Index

A source is not the thing we rank.

We rank **candidate capabilities/items** produced by or linked to sources.

Examples:

- a new RKO guideline update;
- a MedVestnik article;
- a Telegram post;
- a drug-reference lookup;
- a calculator;
- an expert profile;
- an open clinical task;
- a patient delta;
- an event;
- a saved custom link.

Required item fields:

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

---

## 3. Physician Model

Never reduce "persona" to an invented fictional biography.

Use an explicit state model:

### Stable / user-declared
- specialty;
- subspecialty;
- practice setting;
- role;
- patient population;
- language;
- region/jurisdiction;
- chosen sources;
- pinned tools.

### Semi-stable
- professional interests;
- learning goals;
- source preferences;
- preferred depth;
- preferred formats;
- interruption tolerance.

### Dynamic
- current workflow phase;
- active patient/case;
- current question;
- urgency;
- available time;
- device;
- recent actions;
- recent dismissed suggestions.

### Inferred fields
Must contain:
- value;
- confidence;
- evidence;
- last_updated_at;
- user-editable flag.

The user must be able to inspect and correct them.

---

## 4. Moment Context

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

Ranking and layout depend heavily on moment context.

A calculator can be top priority during an active decision and irrelevant during a morning queue scan.

---

## 5. UI Module Registry

The Gen-UI renderer may only compose approved typed modules.

Examples:

```text
patient_brief
patient_delta
timeline
evidence_answer
guideline_update
source_feed
expert
telegram_channel
calculator
drug_reference
result_review
therapy_safety
ambient_note
task_list
custom_link
event
learning_item
```

Each module declares:
- data contract;
- allowed sizes;
- allowed surfaces;
- patient-specific flag;
- provenance behavior;
- actions;
- required confirmations;
- mobile fallback.

The LLM composes modules.
It does not invent arbitrary DOM for high-stakes information.
