# KARDIO — Editorial Image Policy

Status: **authoritative visual-content rule**.

Date: 2026-10-18.

## Core correction

`Real images` does **not** mean `attach any real medical photo to any medical card`.

KARDIO must use editorial image-to-content matching at the quality bar of a serious medical journal / Apple News-quality professional product.

Semantic correctness outranks image coverage.

If no semantically correct real image exists, **an image-free card is better than irrelevant stock photography**.

## Resolution priority

For every content object, resolve images in this order:

1. original visual asset from the exact source/article/event/publication;
2. figure/cover/portrait/clinical image from supplied source material;
3. uploaded real asset only when the semantic match is strong and provenance/rights are tracked;
4. external real asset from the original publisher, professional society, hospital/university, journal, conference organizer or credible licensed repository;
5. no image.

Do not drop to generic stock merely to fill a card.

## Match by editorial role

### Clinical material
Prefer:
- real clinical/source imaging;
- source figure;
- ECG/imaging/procedure/device image that actually relates to the content object.

Do not use a generic doctor portrait as a substitute.

### Expert content / lecture
Prefer:
- real portrait of the named expert;
- original speaker frame supplied by the source;
- event/session photography with that expert.

If identity cannot be verified, render without portrait.

### Event / congress
Prefer:
- real event photograph;
- venue/stage/session imagery;
- named speaker photography;
- official event artwork only when it is the actual event asset.

### Journal / editorial material
Prefer:
- original publication image;
- figure;
- issue cover;
- journal-provided visual asset.

### Clinical guideline
Prefer:
- guideline cover/document identity;
- professional-society identity;
- an exact source figure when editorially useful.

A generic physician photo is usually worse than no image.

### Calculator / utility
Photography is normally unnecessary.

## Uploaded-asset classification from current task

The following assets must **not** be auto-used simply because they are medical:

- Pinterest screenshots: **reference-only moodboard**, never production content imagery.
- Hyperkalemia/ECG meme-style graphics: not eligible as high-end editorial imagery without exact provenance and deliberate editorial use.
- historical CT comparison graphic: requires source/provenance/rights and a matching content object.
- device/occluder graphic: requires exact device/topic/source validation.
- donor/ex-vivo heart photography: real and strong, but currently no Golden Set object in the evaluation slice is semantically close enough; do not force-fit it.
- cardiac MRI/cine and coronary angiography uploaded videos: potentially valuable real clinical media, but exact content mapping and rights/source must be verified first.
- 3D mechanical circulatory-support animation: synthetic illustration, not counted as real clinical photography.

The uploaded ultrasound-exam photograph is semantically suitable for echocardiography-related material such as `fact-ar-echo-2025`, subject to provenance/rights review.

## Enrichment object

Image metadata lives outside the canonical Golden Set facts:

```json
{
  "golden_id": "...",
  "image_url": "...",
  "image_origin": "source | pdf | uploaded | external",
  "image_source_name": "...",
  "image_source_url": "...",
  "image_credit": "...",
  "image_usage_note": "...",
  "image_semantic_role": "clinical | expert | event | publication | research | anatomy",
  "image_status": "verified | needs_review",
  "render_policy": "publishable | prototype_only_until_rights_verified | do_not_render"
}
```

Never overwrite canonical Golden Set facts with image enrichment.

## Anti-repetition rule

Do not reuse one real photo across multiple unrelated cards merely for visual consistency.

Repeated imagery is allowed only when it is genuinely the shared source/series identity and that repetition is editorially meaningful.

## Cropping

Clinical/source imagery:
- preserve the medically relevant subject;
- avoid aggressive decorative crop;
- preserve aspect ratio;
- use intentional `object-position`;
- do not upscale low-resolution assets substantially.

Expert portraits:
- preserve face/identity;
- crop as portrait, not generic landscape.

Publication covers/figures:
- preserve legibility and identity;
- avoid cropping away labels that are part of the source asset.

## Missing image state

The design system must treat `no image` as a first-class editorial state, not an error state.

A high-quality image-free card should rely on:
- title;
- source identity;
- date/version when available;
- content type;
- trust/currentness state;
- concise source-grounded summary.

No empty image placeholder box should appear.

## QA questions

Before rendering an image, answer:
1. Is this the same source/object or an exact semantic match?
2. Does the image improve professional comprehension or source identity?
3. Is provenance recorded?
4. Are rights/status recorded?
5. Would a serious medical journal plausibly pair this image with this content?

If the answer to #1 or #5 is no, do not render the image.