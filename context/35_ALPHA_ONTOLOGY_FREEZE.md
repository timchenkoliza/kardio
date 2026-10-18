# Alpha ontology freeze and productization cut

Status: **ALPHA FREEZE**  
Date: 2026-10-18

## Decision

The ontology/ingestion research track is frozen for the first usable alpha. No additional exploratory gates are required before product implementation.

Current safe foundation:

- canonical cardiology Golden Set: 54 content objects / 18 sources;
- ontology baseline: 131 nodes / 504 edges / 634 evidence records / 257 state facts;
- Telegram distribution staging: 3,515 present post candidates, 8,570 links, 3,572 media references, zero promotions;
- event-reference staging: 277 original URL candidates / 449 present mentions;
- transport-normalized event references: 262 groups / 277 memberships;
- Oncology canonical fallback remains zero.

## Gate 13 conclusion

Calendar evidence is useful as source evidence, but it is **not safe enough to become canonical event identity during alpha**.

Observed constraints:

1. Most event transport groups have literal calendar expressions in surrounding Telegram post text.
2. One post can mention multiple dates and multiple event links; whole-post text is therefore not link-local evidence for a specific URL.
3. Relative cues (`сегодня`, `завтра`, `послезавтра`) are retained as unresolved literal evidence and are not resolved against publication time.
4. Structural year tokens can exist on child/event-surface pages and must not by themselves create a `ProfessionalEvent` occurrence.
5. Page surfaces, event occurrences and recurring series remain separate identity hypotheses.

Therefore alpha must not promote event-reference staging into canonical ontology merely to increase coverage.

## Alpha presentation policy

For product read models:

- canonical Golden Set objects may be rendered according to their stored source/currentness/rights state;
- unresolved event references may be shown only as source-grounded reference/update material when a product surface explicitly supports them;
- do not display an inferred canonical event date, organizer, speaker or occurrence identity from Gate 13;
- ambiguous and unresolved are valid states, not release blockers;
- no Cardiology evidence may populate Oncology.

## Productization priority

The critical path is now:

`real data -> deterministic read model -> Explore home -> object detail -> related chain -> save/state -> search -> responsive QA`

The first implementation target is one excellent Cardiology Explore/Navigator vertical slice using real database content. Toolbelt and Workspace remain the same product/data model and follow after the Explore slice is usable.

## Re-opening ontology research

Re-open event identity work only when a concrete product requirement needs canonical event occurrences/series, or when stronger link-local evidence becomes available. Any future persistence must preserve provenance, explicit review and unresolved states.
