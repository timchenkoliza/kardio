# Ranking Policy

## Objective

Do not optimize for CTR, session length or scroll depth.

Rank the smallest set of modules/items most likely to help the physician make or close the current professional decision safely.

## Stage 0 — Hard gates

Remove candidates that fail permissions, provenance, freshness, surface eligibility, commercial separation or explicit user settings.

Patient-specific clinical surfaces must not silently mix commercial promotion with clinical decision support.

## Stage 1 — Candidate pools

1. active patient/workflow
2. explicit subscriptions and pinned modules
3. specialty-relevant registry
4. recent professional updates
5. approved tools/capabilities
6. user-added links/channels
7. low-risk exploration pool

Keep pool origin as a feature.

## Stage 2 — Contextual score

Potential dimensions:

- task match
- workflow phase match
- specialty match
- explicit user preference
- verified source trust
- evidence relevance
- freshness
- actionability
- continuity with recent work
- novelty
- available-time fit
- device fit

Weights are experimental and must be validated; they are not clinical policy.

## Stage 3 — Re-ranking constraints

- preserve critical workflow items
- preserve pinned modules
- source diversity
- duplicate suppression
- source concentration cap
- attention budget
- evidence/opinion distinction
- commercial separation and labeling

## Stage 4 — Explanation

Every surfaced item must be able to answer **Почему показано?** using the real ranking features that affected the result.

Do not generate post-hoc fictional explanations.

## Stage 5 — Feedback

Support granular controls:

- useful / not useful
- show more / less
- mute source
- pin
- move to another screen
- change frequency
- never interrupt me with this during visit

Feedback should be visible and reversible.

## Exploration

Contextual-bandit-style exploration may be tested for low-risk professional discovery or learning content.

Never use exploration as the policy for critical-result triage, safety alerts or patient-specific treatment decisions.

## LLM role

The LLM may reason over context, propose relevance and compose a workspace. It must not be the sole source of source trust, evidence level, clinical criticality, access permission or execution permission.
