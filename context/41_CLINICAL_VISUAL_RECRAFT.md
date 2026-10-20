# 41 · Clinical Visual Recraft (image ↔ article matching stage)

**SOURCE IMAGE = medical truth. DESIGN SYSTEM = the way it is drawn.** Never: source image = inspiration for a new picture.

## Where it runs

At the image ↔ article matching stage of the media pipeline, for editorial use only
(`/admin/media-recraft`, API `POST /api/media/recraft`, roles: editorial, admin).

```
article + source image
  → 0. content mapping (CARDIOLOGY CONTENT MAPPING)  lib/recraft/gates.ts · checkMapping
  → match gate                                     decideMatch
  → 1–2. source visual passport = semantic lock      passportStops
  → 3. redraw strategy                              strategyFor · transformationStrength
  → 4. design-system translation                    buildRedrawPrompt (DESIGN_LOCK)
  → 5. 3 candidates (image-to-image)                server/recraft/providers.ts
  → 6. source-vs-output critic                      criticVerdict · outsideSemanticBoundary
  → one regeneration round with the critic's failures
  → final derivative, or an explicit stop status
```

Nothing is returned as final unless the critic passed it. Statuses: `completed`,
`needs_source_verification`, `replace_image`, `do_not_use`, `needs_deidentification`,
`rejected_by_critic`, `unavailable`, `failed`.

## Content mapping rules (deterministic, after the model proposes)

- Mapping = intersection of image, caption, article and Content Passport; the caption outranks the title.
- No upgrades: risk → disease, symptom → diagnosis, context → nosology, device → complication. A disease
  binding without a diagnosis cue in the sources is downgraded, gets `NO CODE` and low confidence.
- ICD-10 only when supported: invalid format, context/mechanism bindings and low confidence → `NO CODE`.
- Specificity: a subcategory code (I25.1) stays only when the sources name the subcategory; otherwise the rubric (I25).
- Conflict rule: `prompt_conflict` → confidence low, `NO CODE`, require source verification, no generation.
- Every visual element must map to an approved statement (image semantic boundary).

## Match gate

| Grade | Production rule | Pipeline |
|---|---|---|
| EXACT, STRONG | USE | generate |
| MEDIUM | USE WITH CAVEAT | generate, label «Иллюстрация к теме, не к конкретному случаю» |
| PARTIAL | SECONDARY ONLY | generate only for `digest`; card/hero → `replace_image` |
| WEAK PROXY | REPLACE | stop · `replace_image` |
| NO VALID MATCH | DO NOT USE | stop · `do_not_use` |

## Semantic lock and fidelity

The passport fixes source type, primary anchor, view/projection, structures and relationships to preserve,
finding location, laterality, flow direction, what must not be invented, diagnostic markers, visible patient
identifiers. Identifiers stop the pipeline (`needs_deidentification`). Diagnostic sources (angiography, CT, MRI,
echo, ECG) get transformation strength 0.2–0.35; editorial sources 0.45–0.6. Per-type hard constraints are in
`FIDELITY_RULES`.

## Visual system lock

2:1; background #FFFFFF / #F2F2F2; primary #898BFF / #7275FF / #5759EF; secondary #DABDFF / #AFA2FF; accent only
if needed #FDABC1 / #F367D0; brand attention ≤ 20 %; negative space 65–80 %; anchor 20–35 % of the frame inside the
central 60–70 % crop-safe zone; no gradients, glow, stock or advertising look.

## Critic

Pass requires: same structure, same view/side, finding in the same place, no new clinical information, semantic
and style fidelity, no hallucinations, no element outside the approved statements, and none of the nine
self-reject conditions (anatomy differs, finding moved, side/projection changed, structure invented, generic
cardiology picture, decoration dominates, different clinical concept, stock/advertising look, outside the
visual system).

## Providers

- Vision (mapping, passport, critic): Anthropic Messages API — `ANTHROPIC_API_KEY`, optional `RECRAFT_VISION_MODEL`.
- Image-to-image: OpenAI Images edits — `OPENAI_API_KEY`, optional `RECRAFT_IMAGE_MODEL`.
- Without keys the pipeline reports `unavailable`; with vision only it returns the semantic lock without generation.

## Feed illustrations (same match gate)

Feed cards use licensed Wikimedia Commons illustrations stored as 2:1 crops in `public/media/cardiology`
(`lib/ui/approved-medical-media.ts`). `matchCardioIllustration` returns only STRONG or MEDIUM matches, most specific
object first; weak proxies are not shown. Four of every five article cards carry an illustration
(`visualResultIds`); images are labelled «Иллюстрация» and are never evidence.
