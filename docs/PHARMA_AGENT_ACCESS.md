# Pharma agent access — vertical slice

Status: role-scoped partner surface, preview access admin, persisted Content Studio draft packages, source ingestion and Claim Map are implemented on `feature/pharma-content-studio`.

## Product rule

The product has one delegation input, but the agent catalogue is scoped by the current workspace subject. The UI must never expose every agent to every user.

Default demo subjects:

| Subject | Role | Primary surface | Default agent access |
| --- | --- | --- | --- |
| physician_demo | physician | physician workspace | whats_new, guidelines, drugs, research, events, learning, materials |
| pharma_demo | pharma | partner workspace | content_studio |
| editorial_demo | editorial | partner workflow | content_studio + approve/publish capability |
| admin_demo | admin | admin + both workspaces | all current agents |

The same composer pattern may be reused across surfaces. Routing must happen only inside the set of agents allowed for the resolved subject.

`eligibleAgents = grants(subject, workspace) -> router(input, eligibleAgents)`

The router must never pick an agent that the entitlement layer did not return.

## Access admin

`/admin/agent-access` provides a Beta access matrix for the Preview/development environment:

- switch the current demo subject;
- inspect subject -> agent grants and capabilities;
- enable/disable grants that already exist in the policy contract;
- reset Preview overrides;
- verify that pharma/editorial users are routed away from the physician workspace;
- verify that the physician agent API returns 403 for pharma/editorial demo subjects.

Preview overrides are stored in HttpOnly cookies for that browser only. They are intentionally ignored outside Preview/development. This makes the demo interactive without pretending that browser state is production RBAC.

## Important security boundary

`lib/access/agent-entitlements.ts` is the policy contract. `server/access/request-access.ts` resolves the current request against it.

The current Preview still does **not** have production identity. Therefore:

- Preview impersonation contains no confidential campaign data;
- query parameters do not grant roles;
- pharma/editorial cannot call the physician agent API while their demo subject is active;
- production ignores demo impersonation/override cookies;
- a future identity adapter must resolve the subject from trusted SSO/admin data and persist ACL changes server-side.

## Content Studio domain flow

**Публикатор / Content Studio** now creates a persisted aggregate and moves it through a trust-aware preparation flow:

`Brief -> ContentStudioRun -> PublicationPackage -> Sources -> Claim Map -> Compliance -> Article / Useful / Media / Event / Performance -> Review`

The aggregate contains:

- the raw partner brief;
- inferred physician audience and campaign goal for workflow metadata;
- source URLs found in the brief;
- a persisted Content Studio run with the transparent plan;
- five editable publication drafts;
- ingested source assets;
- extracted claim candidates;
- per-claim evidence/compliance status;
- package/draft lifecycle status;
- audit fields for creator, timestamps and review request.

Partner demo roles share one `partner_demo` workspace. This means a package created while `pharma_demo` is active is visible after switching the same browser session to `editorial_demo` or `admin_demo`, which models the handoff from pharma to Yandex Med editorial review.

### Source ingestion

Content Studio accepts two source kinds:

- `partner_material` — the partner's own material; useful for extracting claims but never independent evidence;
- `external_reference` — an external source supplied by the user with an optional HTTP(S) URL and supplied text/file.

There are two ingestion paths:

1. paste source text directly in the Content Studio package;
2. upload a source file through the existing safe parser pipeline.

File upload reuses `MaterialService.parseUpload`, so TXT/MD/CSV/HTML/DOCX can be converted to de-identified text before Claim Map. The original binary is not persisted by Content Studio. Files are limited to 4 MB. PDF currently returns the existing honest `parser_unavailable` status because PDF text extraction is not connected yet.

The server does **not** fetch arbitrary user URLs. The URL is metadata for source-policy matching; claim extraction only uses text explicitly supplied by the user or extracted from an uploaded file. This avoids SSRF and prevents the product from pretending that it independently read a page it did not retrieve.

### Shared source policy

`server/agents/services/source-policy.ts` reads the existing physician-validation registry `data/source-validation-b2d.json` and returns one standing:

- `approved`;
- `conditional`;
- `reviewed_not_whitelisted`;
- `rejected`;
- `unreviewed`.

The standing contract lives in `lib/agents/source-policy.ts`; the server resolver is shared trust infrastructure, not a pharma-only rule. Content Studio is its first runtime consumer in this branch.

### Claim Map and compliance gate

Claim extraction is deterministic in the current Beta: it selects concrete medical/assertive sentences from the supplied text and does not invent missing claims.

Rules are intentionally conservative:

- partner material -> `needs_review`; it is input, not evidence;
- physician-rejected source -> `blocked`;
- external source without a URL -> `blocked`;
- external source whose supplied fragment fails FactCheck -> `blocked`;
- an external fragment that lexically/numerically supports its claim is capped at `PARTIALLY_SUPPORTED` until the original page is independently retrieved;
- approved/conditional/other external sources -> still `needs_review` because the supplied fragment has not yet been independently retrieved from the original page;
- no claim receives an allowed publication format automatically in this slice.

The existing shared `FactCheckService` is reused for lexical/numeric consistency on external-source fragments. Source standing can only constrain the result; it never upgrades user-supplied text into verified medical evidence.

A package cannot be sent to review until it has at least one source and at least one extracted claim. Review can contain blocked claims because that is exactly what medical/editorial reviewers need to resolve; publication will later require a stronger gate.

### Persistence

- with `DATABASE_URL`, packages are persisted inside the existing anonymous session JSON state;
- without a database, development uses an in-process memory store, matching the existing demo fallback model;
- older persisted packages are normalized with empty `sources` / `claims` collections so the domain extension is backward-compatible;
- the UI shows which storage mode handled a mutation;
- this is a vertical-slice persistence model, not the final organization/workspace data model.

### Safety rule

The publication drafts are still **template scaffolds**. They intentionally do not insert extracted claims into Article / Useful / Media automatically. Every draft remains `evidenceStatus = not_checked` until the next evidence-bound generation slice.

The current lifecycle stops at `in_review`. Approval and publication are intentionally not simulated yet even though editorial/admin capabilities already exist in the access contract.

## Next commits

1. Evidence-bound Article / Useful generation from reviewed claim objects, with explicit provenance.
2. Editorial medical-review workflow: resolve/reject claims, request changes, approve package.
3. Distribution handoff to the physician Feed with partner disclosure and ranking policy.
4. Campaign analytics and a pharma Campaign Agent.
5. Replace Preview impersonation with trusted SSO + persisted admin ACL.
