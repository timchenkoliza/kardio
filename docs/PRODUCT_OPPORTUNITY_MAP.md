# Product opportunity map — homepage prominence

Date: 2026-10-21. Decides what earns space on the portal home. Evidence: 1,400 random PBZ physician requests (category shares below) and the source atlas, which shows a large consumption mode without a pre-formulated intent.

Scores are 1–5. **Cost** is operational cost (5 = most expensive), so it divides. `Score = frequency × retention × commercial × confidence × readiness ÷ cost`. Readiness is what this branch actually ships, verified by running the path.

| Opportunity | PBZ share | Freq | Retention | Commercial | Confidence | Readiness | Cost | Score | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reference answer (incl. symptoms, diagnostics) | 46.7% (+5.1 +4.7) | 5 | 4 | 3 | 5 | 3 | 2 | 450 | **The input itself (Layer A).** Default route for clinical questions |
| Drug: reference, safety, dosage | 3.9% + 3.2% + share of reference | 4 | 4 | 5 | 4 | 3 | 3 | 320 | **Shortcut 1** «Препарат» |
| Clinical recommendations, regulatory, treatment choice | 5.6% + 12.4% | 4 | 4 | 2 | 4 | 3 | 3 | 128 | **Shortcut 2** «Клинические рекомендации» |
| Professional updates without intent («Для вас») | source atlas, no % | 4 | 5 | 4 | 3 | 3 | 3 | 240 | **Layer C**, directly under the input |
| Deep investigation / research interpretation | 1.9% (+ comparisons inside treatment choice) | 2 | 3 | 2 | 4 | 4 | 2 | 96 | **Shortcut 3** «Разобрать по исследованиям» |
| Events | not in PBZ categories | 2 | 3 | 4 | 2 | 2 | 4 | 24 | No shortcut. Card in «Для вас» when a real upcoming event exists; routed from the input |
| Learning | 2.7% | 2 | 4 | 3 | 3 | 2 | 3 | 48 | No shortcut. One contextual next-step card in «Для вас» and in results |
| Calculators and scales | 1.6% | 1 | 3 | 1 | 4 | 1 | 2 | 6 | Not on home. Two cardiology calculators stay in the legacy archive |
| Documentation | 2.8% | 2 | 2 | 1 | 4 | 0 | 4 | 0 | Not advertised: no capability exists |
| Saved materials | — | 2 | 4 | 1 | 3 | 4 | 1 | 96 | Primary navigation («Мои материалы»), not a home tile |

## Decisions

1. **The input is the product.** Reference demand is ~47% of explicit physician requests, so the first screen is a single professional input with deterministic routing, not a menu.
2. **Three shortcuts, not seven tiles.** Drug, clinical recommendations, investigate a question. Each opens the same input pre-scoped to the job. «Разобрать по исследованиям» takes the third place over learning and events because treatment-choice questions (12.4%) need a deeper evidence mode and it is the most ready capability; updates score higher but live in «Для вас», not behind a button.
3. **«Для вас» is the return loop.** It sits directly below the input and mixes updates, guideline and drug signals, the one learning next step and disclosed partner material in one card contract.
4. **Events and learning stay reachable but are not P0.** Their frequency does not justify prime space; fixing them does not change that.
5. **No fake buttons.** Calculators, documentation and patient-specific treatment selection are not advertised.

## What would change the map

- Real retention data per first successful job (see `lib/portal/metrics.ts`) replaces the frequency column.
- An approved RU guideline source (rubricator API or editorial snapshot) raises readiness of shortcut 2 for all six specialties.
- A Russian-language synthesis layer with validation raises readiness of the reference answer, which today is quote-based.
