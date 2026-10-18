# Ranking Policy

## Product objective

Do not optimize for CTR, session length, scroll depth or raw engagement.

The primary utility is:

> Deliver the smallest set of items/modules most likely to help the physician make or close the current professional decision safely.

Different surfaces have different objectives.

---

## Pipeline

### Stage 0 — Hard safety / eligibility gates

Before ranking, remove candidates that are not allowed in the current context.

Examples:
- patient-specific clinical surface cannot silently contain commercial promotion;
- source has insufficient provenance for a clinical claim;
- item is stale beyond its policy;
- capability lacks required permission;
- user muted the source;
- module is not safe on this device/context;
- unknown-registry source cannot auto-surface as clinical evidence.

### Stage 1 — Candidate generation

Candidates come from distinct pools:

1. active patient/workflow;
2. explicit user subscriptions and pinned modules;
3. specialty-relevant registry;
4. recent professional updates;
5. approved tools/capabilities;
6. user-added links/channels;
7. low-risk exploration pool.

Keep pool origin as a feature.

### Stage 2 — Contextual scoring

Score dimensions:

- `task_match`
- `workflow_phase_match`
- `specialty_match`
- `explicit_user_preference`
- `source_trust`
- `evidence_relevance`
- `freshness`
- `actionability`
- `continuity_with_recent_work`
- `novelty`
- `time_fit`
- `device_fit`

### Stage 3 — Multi-objective re-ranking

Apply constraints:
- source diversity;
- avoid repeated near-duplicates;
- cap a single source's concentration;
- reserve attention budget;
- balance urgent / required / useful;
- distinguish evidence from opinion;
- keep commercial content separated and labeled;
- preserve pinned items.

### Stage 4 — Explanation

Every surfaced item must be able to answer:

**Почему показано?**

Use real ranking features, not generated post-hoc rationalization.

Example:

> Показано, потому что вы кардиолог, подписаны на РКО, материал относится к ХСН, обновлён 2 дня назад и вы закрепили клинические рекомендации в экране «Сегодня».

### Stage 5 — Feedback

Support:
- useful / not useful;
- show more like this;
- show less;
- mute source;
- pin;
- move to another screen;
- change frequency;
- "never interrupt me with this during visit".

Feedback updates future ranking visibly and reversibly.

---

## Exploration policy

Contextual-bandit style exploration may be tested only for **low-risk informational discovery**.

Do not use exploration to choose:
- patient-specific safety alerts;
- treatment recommendations;
- critical-result prioritization.

Clinical priority must use explicit validated rules/models and governance.

---

## LLM role

The LLM can:
- reason over context;
- label semantic relevance;
- generate an explanation;
- propose a workspace composition.

The LLM must not be the sole source of:
- source trust;
- evidence level;
- criticality;
- access permission;
- execution permission.

---

## Research transfer

Current recommender research supports using user history + current context + time/surface and optimizing beyond short-term clicks.

For this product, translate that into:
- context engineering;
- multi-objective utility;
- long-term professional value;
- explicit constraints;
- explainability;
- user control.

Do not import entertainment-domain engagement objectives.
