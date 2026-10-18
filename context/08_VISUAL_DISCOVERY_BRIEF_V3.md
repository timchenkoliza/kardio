# Visual Discovery Brief V3

## Do not design a clinical dashboard

There is no patient, encounter or EHR context.

The visual problem is:

> How can a cardiologist reach trusted professional knowledge or a tool in seconds, while preserving source visibility and allowing later customization?

## Required concepts

All concepts must use the same content and jobs.

### A. Search-first Navigator
Dominant search + quick tasks + recent + compact updates.

### B. Toolbelt
Persistent compact professional tools/sources; search remains prominent.

### C. Knowledge Workspace
Collections/topics/sources as a navigable professional workspace.

### D. Optional Gen-UI extension
Show only as a secondary concept:
explicitly customizable screens from approved modules.

## Required scenes

- home;
- search result;
- guideline answer with citation;
- calculator;
- drug/reference entry;
- source registry;
- guideline/update item;
- save/recent;
- add/pin source;
- later Gen-UI customization.

## Visual principles

- professional;
- compact;
- fast;
- source-first;
- no hospital dashboard aesthetic;
- no patient cards;
- no AI chatbot as home screen;
- no engagement feed;
- no generic SaaS card soup.

## Specialty identity layer

The specialty visual system is defined separately and is authoritative in:

- `19_SPECIALTY_VISUAL_IDENTITY.md`
- `20_SPECIALTY_VISUAL_TOKENS.json`

Do not invent a new palette per A/B/C shell.

All three shells must share one Yandex Med base identity and one Cardiology specialty identity.

Core rule:

> **Yandex Med owns the interface. Specialty owns the atmosphere.**

Cardiology uses `PULSE / PERFUSION` with `FLOW` visual physics.
Oncology is reserved as the next extensible specialty using `CELL / PRECISION` with `CLUSTER / TARGET` visual physics.

Pinterest/moodboard references are art-direction references only and must never be rendered as medical content assets.

Do not apply the specialty identity to placeholder/demo content. Real-content binding and editorial-image resolution precede the visual-identity pass; pixel-first polish follows it.