# Product communication contract

Status: ACTIVE PRODUCT CONTRACT

This contract applies to every user-facing surface in Cardiology and Oncology: navigation, feed blocks, tools, empty states, settings, events, education, imaging, external-resource cards and assistant entry points.

## 1. Professional, calm, non-social tone

The product is a professional workspace, not a social network. Copy must not use engagement pressure, popularity as evidence, public likes/comments/shares, advertising-style urgency, fear or gamified persuasion.

Private controls such as `Полезно`, `Меньше такого`, `Скрыть`, `Закрепить` are presentation or relevance feedback. They are not public social proof.

## 2. Claim → evidence → implication

Clinical or professional claims must be tied to an identifiable source. Where relevant, show source, publication/update date, version/current status and jurisdiction. A claim must not become stronger than the source supports.

Distinguish:

- source fact;
- product interpretation or grouping;
- hypothesis / item still under review.

Popularity, frequency of mention and ranking position are not evidence of clinical correctness or consensus.

## 3. No personalized clinical prescription

The product must not present itself as making a diagnosis, choosing therapy, changing medication, determining eligibility for care or replacing professional judgment.

Calculators and scales are reference tools. Their outputs must be framed as source-backed scores, not patient-specific prescriptions. The primary source and interpretation limits remain visible.

## 4. No patient-data workflow

No patient node, EHR/MIS workflow, encounter state, patient routing or patient-linked device state is introduced by copy or UI.

When a local file may be opened, the interface explicitly restricts the prototype to de-identified or educational material and states whether the file stays local. The viewer does not claim diagnostic interpretation when no validated renderer/algorithm is connected.

## 5. Provenance over fluency

A polished summary never replaces provenance. Editorial, partner/sponsored, community and external content must remain distinguishable. Verified identity does not imply that every identity must be publicly exposed.

Clinical images are shown only when product media policy allows them. Decorative art must not imitate a real clinical scan, specimen or diagnostic result.

## 6. Honest prototype and external-resource states

Demo, placeholder, external and not-yet-integrated states are named plainly. Do not imply that a 3D model, DICOM/NIfTI renderer, oncology calculator or AI capability works natively when it is only a link or reserved interface slot.

External resources remain external until separately reviewed and imported. User-facing copy should say this in plain language; internal terms such as ontology, canonical promotion, currentness, source-grounded and cold start should not be required to understand the product.

## 7. User-owned state is explicit and reversible

Saved items, pins, collections, history, hidden blocks and UI preferences belong to the user. `Скрыть`, `Показывать реже`, `Закрепить выше` and restore actions change presentation only; they do not delete professional objects or silently retrain a hidden engagement optimizer.

Search/history behavior must be described accurately. Do not promise privacy properties the implementation does not provide.

## 8. Specialty boundaries are visible

Cardiology and Oncology have separate catalog authority and separate visual identity. Cardiology content must never be relabeled as Oncology. If Oncology lacks an internal verified object, use an explicitly external professional source or a truthful empty state rather than synthetic content.

## 9. Language rules

Use clear Russian professional language in the primary UI. Expand or avoid internal engineering jargon. English source names, validated scale names and file-format names may remain as proper names.

Avoid absolute claims such as `гарантированно`, `точно`, `безошибочно` unless they are a verbatim source fact shown with its source and are necessary to the task.

## 10. Automated gate

`scripts/check-product-copy.mjs` checks high-risk wording across user-facing TSX files. It is deliberately conservative and supplements, rather than replaces, product review.
