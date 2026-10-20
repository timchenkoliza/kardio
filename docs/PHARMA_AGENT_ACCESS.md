# Pharma agent access — vertical slice

Status: role-scoped partner surface, preview access admin, and persisted Content Studio draft packages are implemented on `feature/pharma-content-studio`.

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

**Публикатор / Content Studio** now creates a real persisted aggregate instead of a plan-only preview:

`Brief -> ContentStudioRun -> PublicationPackage -> Article / Useful / Media / Event / Performance -> Review`

The aggregate contains:

- the raw partner brief;
- inferred physician audience and campaign goal for workflow metadata;
- source URLs found in the brief;
- a persisted Content Studio run with the transparent plan;
- five editable publication drafts;
- package/draft lifecycle status;
- audit fields for creator, timestamps and review request.

Partner demo roles share one `partner_demo` workspace. This means a package created while `pharma_demo` is active is visible after switching the same browser session to `editorial_demo` or `admin_demo`, which models the handoff from pharma to Yandex Med editorial review.

### Persistence

- with `DATABASE_URL`, packages are persisted inside the existing anonymous session JSON state;
- without a database, development uses an in-process memory store, matching the existing demo fallback model;
- the UI shows which storage mode handled a mutation;
- this is a vertical-slice persistence model, not the final organization/workspace data model.

### Safety rule

The current drafts are **template scaffolds**. They intentionally do not invent medical claims. Every draft is marked `evidenceStatus = not_checked`; evidence extraction, compliance, fact-checking and real text generation are separate upcoming steps.

The current lifecycle stops at `in_review`. Approval and publication are intentionally not simulated yet even though editorial/admin capabilities already exist in the access contract.

## Next commits

1. Source material ingestion and claim map.
2. Reuse FactCheck/Evidence services + add pharma compliance gate.
3. Article / Useful generators with explicit provenance.
4. Editorial approval workflow: in_review -> approved -> publishable.
5. Distribution handoff to the Feed and campaign analytics.
6. Replace Preview impersonation with trusted SSO + persisted admin ACL.
