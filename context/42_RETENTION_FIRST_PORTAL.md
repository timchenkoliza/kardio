# 42 — Retention-first professional portal (product authority)

Status: **current product authority**. Date: 2026-10-21. Supersedes `40_AGENT_FIRST_WORKSPACE.md` as product direction and information architecture. Branch: `feature/retention-first-portal`.

## What the product is testing

Whether a professional B2D portal has a right to exist. The verdict is retention and repeated useful use by real physicians — not feature count, agent count, card count, a clean DS audit or impressive demo output.

## Thesis

One professional product · one simple primary entry · many hidden capabilities.

```
USER INTENT → PORTAL MANAGER → INTENT + CONTEXT ROUTING → CAPABILITY / TOOL / RETRIEVAL
            → VALIDATION + PROVENANCE → JOB-SPECIFIC RESULT → NEXT BEST ACTION / RETURN LOOP
```

Agent = implementation unit. Job/result = user experience unit. Physicians never need to understand agents, tools, connectors, pipelines or model names.

## Launch specialties

Therapist (`therapy`), pediatrician (`pediatrics`), obstetrician-gynecologist (`obgyn`), cardiologist (`cardiology`), neurologist (`neurology`), endocrinologist (`endocrinology`). Oncology remains reachable as a non-launch specialty with no canonical dataset.

## Surface

- **Layer A — immediate task.** One large input: «Что хотите узнать или сделать?». Deterministic routing to a job; never «everything goes to research».
- **Layer B — high-frequency shortcuts.** Chosen by `docs/PRODUCT_OPPORTUNITY_MAP.md`, not by what is implemented.
- **Layer C — «Для вас».** One cross-type card contract: what it is, why it matters, why shown, source, freshness, topic, primary action, next action. Partner material is disclosed in words.
- **Layer D — job-specific result modes.** Answer, drug, guidelines, research, events, learning, updates, materials.

## Honesty states

Internal taxonomy `LIVE · SNAPSHOT · DERIVED · MOCK · UNAVAILABLE · BROKEN · UNVERIFIED`. MOCK never appears as a real result; SNAPSHOT never pretends to be live; UNAVAILABLE never returns a fabricated success; UNVERIFIED is never presented as established fact.

## Hard boundaries that remain in force

No patient data, no EHR/MIS, no patient-specific treatment recommendations, emergency and image-interpretation blocks, de-identification of input, confirmation for anything outside the product, disclosed advertising, Golden Set immutability and provenance. These are real safety, privacy and disclosure requirements, not legacy.

## What is legacy (implementation asset, not authority)

Agent-first IA, «Мои агенты» as primary navigation, agent tiles on the home page, topic configuration before first value, «Поручить задачу агенту» wording, cardiology-only assumptions, the feed/shell model. Legacy routes stay as compatibility wrappers.
