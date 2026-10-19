# Oncology starter gate

Status: ACTIVE — external source layer, not canonical import

## Goal

Oncology must provide professional value now without relabeling Cardiology content or pretending that an internal oncology Golden Set already exists.

## Current boundary

- canonical oncology `ContentObject` count remains zero until a dedicated verified import is approved;
- Cardiology objects are never reused under Oncology;
- the Oncology home may show an external starter layer with direct links to professional primary sources;
- external starter cards do not acquire canonical ontology status through rendering;
- Oncology uses its own visual palette and must not inherit Cardiology's blood/burgundy identity.

## Starter sources

Observed / verified public professional sources used by the prototype:

- Association of Oncologists of Russia — adult clinical guidelines, including a 2026 section;
- RUSSCO — practical recommendations, supportive-care recommendations, anticancer therapy protocols, education and event calendar;
- ESMO — guideline news / Clinical Practice Guidelines / Living Guidelines;
- RUSSCO 2026 event programme and the XXX Russian Oncology Congress page;
- user-provided oncology calculators remain external links only.

## Product surfaces

The starter layer can populate:

- Explore / feed;
- recommendation filter;
- clinical-material filter;
- evidence/update filter;
- Education;
- Events;
- Sources;
- Reference;
- external calculator entry points.

Saved content remains user-owned and can correctly start empty.

## Communication

Every external oncology card must make the source visible and link to the source. Copy must not convert a guideline or protocol into patient-specific advice, prognosis or treatment selection.

The interface must state when a resource is external and when a capability is not integrated. Internal engineering terms are not required to understand the state.

## Visual distinction

Cardiology: blood/burgundy + bone/ivory + carbon with cool imaging neutrals.

Oncology: deep indigo/periwinkle + sage + ivory/stone. Red/pink is reserved for semantic alerts or source media, not specialty identity.

Diagnostic/case imagery is not palette-tinted. Editorial photography may receive a light specialty harmonisation layer.

## Acceptance

- oncology canonical content invariant remains zero;
- no cardiology-only source leaks into the oncology starter;
- oncology starter covers guideline, clinical, evidence, learning and event entry points;
- communication lint passes;
- design-token lint passes;
- unit/integration/build/DB verification remain green.
