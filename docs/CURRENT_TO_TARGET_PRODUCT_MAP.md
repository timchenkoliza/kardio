# Current → target product map

Audit of `main` @ `213c9a1` (PR #12) on 2026-10-21, before the retention-first portal. Every failure below was reproduced by reading or running the path, not assumed.

Legend for the decision column: **Reuse** (keep as is behind the portal), **Refactor** (keep the asset, change behaviour or contract), **Remove from primary IA** (keep code and route, unlink from the first screen).

| Capability | Current UI | Current route | Current service | Data source | Live state | Known failure | Decision | Target job |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home | «Что нового для вас» feed + «Поручить задачу агенту» composer + «Ваши агенты» tiles (7) + topic setup | `/[specialty]` | `getWorkspaceView`, `getHomeFeed` | Golden Set catalog + agent results | Catalog LIVE (snapshot), cardiology only | Agent-first IA; empty for every specialty except cardiology; `?q=` always redirected to Research | Refactor | Portal home: input, three shortcuts, «Для вас» |
| Intent routing | Live «Возьмётся агент …» under the composer + agent picker | client `routeIntent` | `lib/agents/intent.ts` | — | Deterministic | Fallback is always Research; drug INN list is cardiology-only; no reference/answer job | Refactor | `lib/portal/router.ts`: job routing with reference as default |
| What's new | Agent page | `/agents/whats-new` | `whatsNew` executor | Catalog, ESC/regulatory snapshots, PubMed | PubMed LIVE; rest SNAPSHOT | Needs selected topics: with none, PubMed term is null → only catalog (cardiology) | Refactor | Updates in «Для вас» with specialty scope and since-last-visit |
| Guidelines | Agent page | `/agents/guidelines` | `guidelineDiff` | Catalog version chains + ESC snapshot | SNAPSHOT | Returns `[]` for any specialty but cardiology | Refactor | Guidelines job: catalog (cardiology) + PubMed practice guidelines (all) + rubricator hand-off |
| Drugs | Agent page with change counters | `/agents/drugs` | `findDrugChanges` + PubMed RCT search | Curated regulatory snapshot (9 records) | SNAPSHOT (declared LIVE) | Monitoring only, cardiology only; no way to look up one drug | Refactor | Drug job: openFDA label sections (LIVE) + snapshot signals + PubMed safety |
| Research | Agent page with report, comparison, export | `/agents/research` | `research` executor, background jobs | Catalog + PubMed | PubMed LIVE | Russian questions outside cardiometabolic concepts produce no PubMed term → empty | Reuse + Refactor (lexicon) | Research job (deep investigation); full report stays on the legacy route |
| Reference answer | — | — | — | — | — | Does not exist although it is ~47% of demand | New | Answer job: conclusions of systematic reviews and guidelines, quoted with source |
| Events | Agent page with bulk calendar | `/agents/events` | `searchEvents` | 18-record curated snapshot (rnmo.ru, ESC, AHA) | SNAPSHOT (declared LIVE) | Cardiology only; other specialties get an empty list without explanation; rnmo.ru listings are flagged «rejected» by physicians and hidden by the validator | Refactor | Events job: finite list, freshness, organiser, CTA; honest limited state + organiser hand-offs elsewhere |
| Learning | Agent page «Маршрут» | `/agents/learning` | `generateLearningPlan` | Catalog + ESC snapshot + events | SNAPSHOT | Default profile has no topics → effective topics `[]` → 0 modules; cardiology only | Refactor | Learning next step from real signals; cold start from specialty + intent |
| Materials | Materials page | `/materials` | `MaterialService` | User content | LIVE (memory without DB) | — | Reuse | Saved materials (primary nav) |
| Partner content | Labelled slot in feed and agent pages | — | `PartnerService`, `placement-formats` | Synthetic fixture | MOCK | Cardiology only (correct boundary) | Reuse | Disclosed partner card contract in «Для вас» |
| Agent catalogue | «Мои агенты» primary nav + tiles | `/agents` | `getWorkspaceView` | — | — | Agent-first mental model | Remove from primary IA | Settings → background checks |
| Settings | Topics, sources, connectors, privacy, demo | `/settings` | — | — | — | Copy assumes agents | Reuse | Settings |
| Legacy shell | Feed, shells, consilium, imaging, tools | `/legacy`, `/education` | legacy | Catalog | — | Binary «cardiology : oncology» copy would show oncology wording to every new specialty | Remove from primary IA | Archive (cardiology/oncology only; others redirect home) |
| Pharma studio | Content studio for pharma role | `/pharma` | `content-studio` | — | — | Audience label «Кардиологи : Онкологи» | Refactor (labels) | Commercial back office |
| Telemetry | — | `POST /api/events`, `/api/agents/metrics` | `telemetry.ts` | ring buffer + `analytics_events` | LIVE | No activation / first value / return events | Refactor | Retention contract in `lib/portal/metrics.ts` |
| DS audit | CI workflow | — | `tools/ds-audit` | deployments | LIVE | Visual correctness only | Reuse | Regression gate (not release evidence on its own) |

## Specialty assumptions found

| Finding | Class | Action |
| --- | --- | --- |
| `SpecialtyId = "cardiology" \| "oncology"` | implementation gap | Six launch specialties added |
| Catalog, guideline diff, drug changes, events, learning, partner return `[]` unless cardiology | legitimate data boundary (Golden Set and snapshots are cardiology) | Kept; other specialties use live sources and honest states |
| Learning and events had no non-cardiology path at all | missing source adapter | PubMed reviews (learning), organiser hand-offs (events) |
| `education`, `legacy`, `reference-hub`, `content-studio` use `cardiology ? … : <oncology copy>` | product bug for new specialties | Neutral copy or redirect |
| Composer examples, topic vocabulary, PubMed concepts are cardiometabolic | implementation gap | Per-specialty vocabulary and lexicon |
| Approved media and illustrations are cardiology assets | legitimate boundary | Image-free rendering for other specialties |
