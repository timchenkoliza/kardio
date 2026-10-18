# Kardio — evidence-driven physician Gen-UI lab

This repository is a public design/interaction lab for an online physician assistant.

## Product hypothesis

The interface combines:

1. physician workflow context;
2. source/capability knowledge base;
3. editable physician profile;
4. context-aware ranking;
5. schema-constrained Gen-UI composition;
6. provenance and safe-action governance.

The product is **not** a generic chatbot and **not** an engagement-optimized medical feed.

## Current artifact

Open `prototype/kardio_genui_workspace_lab.html`.

It demonstrates:
- default cardiologist workspace;
- workflow phase switching;
- `Why shown?` explanations;
- source/tool capability library;
- custom link / Telegram source addition;
- editable workspace mode;
- draft Gen-UI composition.

## Public-repo rule

Do not commit raw physician research, interview data, patient data, private Telegram exports, or internal source annotations. Use synthetic fixtures and derived public-safe schemas only.

## Architecture docs

- `docs/KNOWLEDGE_ARCHITECTURE.md`
- `docs/PHYSICIAN_PERSONA_MODEL.md`
- `docs/RANKING_POLICY.md`
- `docs/GENUI_WORKSPACE_MODEL.md`
- `docs/HUMAN_AI_AND_RANKING_NOTES.md`

## Schemas

- `schemas/workspace-spec.schema.json`
- `schemas/physician-profile.schema.json`

## Status

Design discovery. No final visual system has been selected yet.
