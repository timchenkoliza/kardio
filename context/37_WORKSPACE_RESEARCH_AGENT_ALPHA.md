# Workspace Research Agent — Alpha

Status: **ACTIVE ALPHA PRODUCT CONTRACT**

## Purpose

Give a physician a user-owned place to state a nosology / professional interest and receive an explainable route through the already verified catalog. The workspace must not become another generic feed.

## Allowed inputs

- explicit nosology or professional-interest text entered by the physician;
- existing saved / pinned / recent / collection state;
- optional **aggregate-only** TXT / CSV / MD summary processed locally in the browser.

## Hard privacy boundary

Patient-level records are not accepted, even when names are removed. Do not upload rows representing individual patients, identifiers, dates of birth, contact details, medical-record numbers, insurance identifiers, or equivalent patient-linked fields.

In alpha, optional aggregate files:

- are capped at 128 KB;
- are read only in the browser;
- are not persisted;
- are not sent to `/api/state`, analytics, or any model endpoint;
- are used only as transient lexical signals for catalog retrieval.

## Recommendation behavior

Alpha recommendations are deterministic and explainable. They rank existing source-grounded catalog objects by explicit overlap with the entered topic / aggregate summary. They do not generate diagnoses, treatment decisions, or patient-specific inference.

A generative model layer may be added later only after a dedicated privacy/input contract and evaluation gate. Until then the UI must not claim that generated clinical reasoning occurred.

## Expert recommendations

Do not invent clinicians from prose, authorship, or organization names. `Who to discuss with` remains a controlled empty state until a verified expert registry exists with explicit identity, specialty, organization, evidence/provenance, and an allowed contact/navigation path.

Target resolution contract:

`explicit topic → verified physician → specialty → organization → reason for match → allowed way to navigate/contact`

## Ontology boundary

Research interest is user state, not a professional-world ontology node. Aggregate upload is transient UI context, not a canonical dataset and not an ontology artifact.
