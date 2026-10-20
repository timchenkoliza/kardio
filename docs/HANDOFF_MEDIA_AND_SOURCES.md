# Handoff — real media and physician-validated sources (in progress)

Branch: `feature/agent-first-workspace`. State on 2026-10-20: agent-first workspace and the Yandex Med design system are done and verified (see `MIGRATION_REPORT.md`). This file records the next phase so it can be resumed in a new session.

## Request (2026-10-20)

1. Real media (photo and video) for cardiology from the Google Drive folder `1XKfcIiRWc6OfSMD-Z08RQTGya5CSr3JJ` (the "telegram" collection in `data/drive-source-registry.json`). For oncology, the Yandex Disk folder `disk:/oncology-media-source/telegram`.
2. Agents rely on sources confirmed by physicians: the "Валидация источников B2D" sheet. It is saved as `data/source-validation-b2d.json`, 59 rows exactly as the medical trainers decided.

## Decisions made by the product owner

- **Media rights:** the Telegram-channel photos and videos are **cleared for display** (decided by L, 2026-10-20). Show them credited to their channel. The existing registries pin `production_url_eligible: false` / `rightsState: "unknown"`. These must become an explicit, dated rights decision per collection, not a silent flip.
- **Access:** the Google Drive connector for this workspace, plus a Yandex Disk OAuth token (`YANDEX_DISK_ACCESS_TOKEN`). The existing sync code already reads `GOOGLE_DRIVE_ACCESS_TOKEN` / `YANDEX_DISK_ACCESS_TOKEN`. For production, Drive needs a long-lived credential (a service account the folder is shared with), not a 1-hour OAuth token.

## What already exists in the repo (reuse, do not rebuild)

- `server/ingestion/google-drive-api.ts`, `yandex-disk-api.ts`: raw-archive providers (`listChildren`, `getMetadata`, `readText`, `materializeBinary`).
- `server/ingestion/telegram-html.ts`: `parseTelegramDesktopHtml` turns `messages.html` into posts with media candidates.
- `server/ingestion/telegram-media-resolution.ts`: resolves a post's media href to a raw archive artifact. It currently blocks everything as `blocked_rights_unknown`.
- `data/article-media-source-registry.json` and `data/drive-source-registry.json` (the telegram exports per channel), plus `scripts/sync-article-media-inventory.ts` (DB inventory).

## Findings from applying the sheet to the agent layer

- **rnmo.ru is "опровергнуто"** (a secondary aggregator with an unknown owner). 14 of the 18 events in `server/agents/snapshots/events.ts` are sourced from rnmo.ru. They must be re-sourced to the organiser (scardio.ru) or the official НМО portal `edu.rosminzdrav.ru` (whitelisted), or dropped.
- **PubMed is "частично", not whitelisted:** journals and study types have to be selected. Whitelisted journals: Nature Medicine, Cochrane. Conditional, peer-reviewed articles only: BMJ, BMJ EBM, BMJ Digital Health, Lancet specialty journals. Lancet: confirmed, whitelist unspecified.
- **FDA:** confirmed but not whitelisted. **MedWatch** (`/safety/medwatch`) is whitelisted. **EMA:** conditional (PRAC/EPAR safety signals only).
- **Not in the sheet:** ESC, РКО (scardio.ru), NEJM, news outlets (Коммерсантъ, AJMC, TCTMD). Treat them as "not yet reviewed by physicians", with a label and no automatic upgrade.
- **cr.minzdrav.gov.ru** (whitelisted): cards need the status and the year of revision.

## Plan

**A. Source policy.** Add `lib/agents/source-policy.ts`, which reads `data/source-validation-b2d.json`. Match on host + path + journal. Each source gets a standing:
- `approved` for whitelist «Да»;
- `conditional` for «Условно», with its condition;
- `reviewed_not_whitelisted` for confirmed or partial with «Нет»;
- `rejected` for «опровергнуто»;
- `unreviewed` for sources not in the sheet.

Apply it across the agent layer:
- Put the standing on `Provenance`.
- `rejected`: excluded from results and refused by connectors.
- `reviewed_not_whitelisted`: verification capped at «частично» with the trainer's note.
- `approved`: ranks first.
- PubMed: default journal filter = approved and conditional journals; each article gets the standing of its journal.
- Settings: «Источники, проверенные врачами» with the decision and comment.
- Result cards: a quiet tag («Источник одобрен врачами» / «Не проверен врачами»).
- Tests for each tier.

**B. Events.** Re-source the 14 rnmo.ru records: verify on scardio.ru or edu.rosminzdrav.ru, keep the retrieval date, drop any that can't be verified.

**C. Media library.**
- Registry v2: per collection (cardiology Drive "telegram", oncology Yandex telegram root), `media_kinds: ["photo","video"]` and a dated rights decision (`cleared_by_owner`).
- `scripts/sync-media-library.ts`: read each channel's `messages.html` → posts → resolve photos and videos → manifest entries (channel, post date, caption ≤ 280 chars, topics from `topicsMentioned`, kind, provider item id, mime, size). Mirror cleared files to a CDN: Vercel Blob, or the existing `NEXT_PUBLIC_MEDIA_CLOUD_BASE_URL`. Drive stays an ingestion archive, never a production URL.
- Connector `media-library` per specialty: LIVE when a manifest exists, UNAVAILABLE otherwise.
- Tool `searchMedia` (by topic and recency). Used by «Что нового» («Видео и фото по вашим темам»), «Моё обучение» (videos) and «Исследовать тему».
- Results carry `media {kind, src, poster, credit, caption}`. `ResultCard` renders `<img>` / `<video controls preload="metadata">` with credit. Captions are not evidence: verification is UNKNOWN, with the note «подпись из канала не проверялась». The channel's standing is `unreviewed`.

## Verification bar (unchanged)

typecheck, lint (eslint + design tokens + product copy), `npm test` with and without `DATABASE_URL`, `npm run test:integration`, `npm run build`, e2e with and without a DB, real-browser screenshots at 390 / 768 / 1440 with no horizontal overflow and no console errors.

## Status after QA pass (branch feature/agent-first-qa)

Done:
- Physician-validated sources (B2D) drive fact-check, supervisor drops and ranking; Settings lists them.
- Clinical Visual Recraft at the image ↔ article matching stage: `lib/recraft`, `server/recraft`,
  `/admin/media-recraft`, `POST /api/media/recraft`, spec `context/41_CLINICAL_VISUAL_RECRAFT.md`.
  Without `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` it reports «недоступно» and never fabricates output.
- Feed illustrations: nine licensed Wikimedia Commons images stored as 2:1 crops in `public/media/cardiology`,
  gated matcher (weak proxies dropped), four of every five article cards illustrated, neighbours not repeated.
- Partner cabinet: all five placement formats of the commercial offer with examples (Статья, Полезное,
  Медиа, Событие, Бренд-страница компании); content studio outputs follow the same five formats.

Still blocked by access:
- Google Drive cardiology folder and Yandex Disk oncology folder: no Drive connector and no Yandex token in
  this environment, so the real Telegram media library is not ingested yet.
- Events from rnmo.ru stay hidden (rejected source) until re-sourced from scardio.ru / edu.rosminzdrav.ru.
