# Kardio — agent-first physician workspace

A workspace where a physician delegates professional jobs to agents — what changed in my topics, guideline and drug changes, research questions, events, learning, my own materials — and every output comes with its source and verification status.

**USER sees JOBS → AGENTS own GOALS → TOOLS own CAPABILITIES → CONNECTORS own ACCESS.** Navigation: Главное · Мои агенты · Мои материалы (+ Настройки). No feed, no chat, no prescribing, no image interpretation, no patient data.

- Product direction: `context/40_AGENT_FIRST_WORKSPACE.md`
- Architecture: `docs/AGENT_FIRST_ARCHITECTURE.md`
- Migration from the previous feed interface: `CURRENT_APP_MAP.md` (before) and `MIGRATION_REPORT.md` (what changed, live vs mock integrations, tests)

## Run locally

```bash
npm ci
cp .env.example .env.local          # DATABASE_URL optional
npm run db:local                    # optional: local PostgreSQL on :55432
npm run db:migrate && npm run db:seed
npm run dev                         # http://127.0.0.1:3000/cardiology
```

Without `DATABASE_URL` the app runs on the bundled Golden Set with in-memory state (agent settings are mirrored to an HttpOnly cookie). With it, profiles, runs, results, materials and actions persist in PostgreSQL.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration` (needs PostgreSQL), `npm run build`, `npm run test:e2e`.

## Earlier design lab

The sections below describe the original Gen-UI design lab that preceded the app.

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

Agent-first workspace implemented on `migration/agent-first-workspace` (see `MIGRATION_REPORT.md`). The previous interface remains available as an archive at `/[specialty]/legacy`.
