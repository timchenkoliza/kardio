# Pharma agent access — vertical slice

Status: role-scoped partner surface + preview access admin are implemented on `feature/pharma-content-studio`.

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

## Second vertical slice: access admin

`/admin/agent-access` provides a Beta access matrix for the Preview deployment:

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

## First pharma agent

**Публикатор / Content Studio**

Job: turn a checked partner brief/source material into a publication package for Yandex Med.

Input:
- brief;
- source material;
- campaign goal;
- target physician audience.

Planned outputs:
- article;
- useful format (check-list / cards / cheat sheet / infographic);
- media;
- event placement;
- performance placement.

Required workflow before a real publish action exists:

1. parse brief and audience/goal;
2. extract claims and evidence;
3. run fact/evidence + compliance checks;
4. generate candidate publication formats;
5. human approval;
6. publishing action through confirmation gate.

The current Content Studio only builds a transparent deterministic plan. It deliberately does **not** simulate content generation or publishing.

## Next commits

1. Content Studio request/run domain model and persistence.
2. Source material ingestion and claim map.
3. Reuse FactCheck/Evidence services + add pharma compliance gate.
4. Article / Useful generators with explicit provenance.
5. Approval workflow: draft -> medical review -> approved -> publishable.
6. Distribution handoff to the Feed and campaign analytics.
7. Replace Preview impersonation with trusted SSO + persisted admin ACL.
