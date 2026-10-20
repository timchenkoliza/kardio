# Pharma agent access — first vertical slice

Status: first implementation commit for partner-facing agents.

## Product rule

The product has one delegation input, but the agent catalogue is role-scoped. The UI must never expose every agent to every user.

Roles:

| Role | Primary surface | Default agent access |
| --- | --- | --- |
| physician | physician workspace | whats_new, guidelines, drugs, research, events, learning, materials |
| pharma | partner workspace | content_studio |
| editorial | partner/admin workflow | content_studio |
| admin | admin + both workspaces | all agents |

The same input pattern may be reused across surfaces. Routing happens only inside the set of agents allowed for the resolved role.

`eligibleAgents = entitlements(role, workspace) -> router(input, eligibleAgents)`

The router must never pick an agent that the entitlement layer did not return.

## Important security boundary

`lib/access/agent-entitlements.ts` is the product policy contract, not authentication. The current public demo uses anonymous browser sessions and cannot securely prove that a visitor is a pharma user, editor or administrator.

Until identity is connected:

- `/[specialty]/pharma` is an unlinked beta/demo surface;
- it must not contain confidential campaign data;
- no admin-only mutation is implemented;
- the UI explicitly says that real ACL is not connected.

For production, the server must resolve role/workspace membership from trusted identity/admin data. Client-supplied role/query/cookie values must not grant access.

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

The first commit implements only entitlement-aware discovery, the dedicated partner surface, one shared input and a transparent deterministic plan preview. It deliberately does **not** simulate content generation or publishing.

## Next commits

1. Server identity contract + admin-managed role/agent entitlements.
2. Content Studio request/run domain model and persistence.
3. Source material ingestion and claim map.
4. Reuse FactCheck/Evidence services + add pharma compliance gate.
5. Article / Useful generators with explicit provenance.
6. Approval workflow: draft -> medical review -> approved -> publishable.
7. Distribution handoff to the Feed and campaign analytics.
