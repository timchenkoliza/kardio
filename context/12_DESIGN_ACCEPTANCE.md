# Design Acceptance Criteria

Phase 1 is accepted only if Claude produces structurally different concepts and makes them comparable.

## Phase 1 required output

### Routes
At minimum:
- `/concept-a/today`
- `/concept-a/patient`
- `/concept-a/visit`
- `/concept-a/closure`

Repeat for B and C.

Optional:
- `/compare`

## Same data rule

All concepts use `11_MOCK_SCENARIOS.json`.

Do not change the data to make one concept look better.

## Each concept must demonstrate

### Information
- active patient identity;
- priority reason;
- "what changed";
- unknown/missing data;
- provenance entry point;
- draft action state;
- explicit confirmation boundary.

### Interactions
At minimum:
- select patient;
- expand source/evidence;
- ask contextual question;
- open draft action;
- edit/confirm/cancel draft;
- switch responsive layout.

### Visual quality
- consistent typography;
- deliberate spacing;
- no default component-library look;
- no decorative AI aesthetic;
- no card soup;
- no meaningless dashboard metrics.

## Comparison artifact

Create a concise comparison page showing:
- screenshot/preview of each concept;
- thesis;
- strongest use case;
- biggest risk;
- scorecard from `09_VISUAL_CONCEPTS_TO_EXPLORE.md`;
- unresolved questions.

## Phase 2 acceptance

After one direction is selected:

- selected concept is converted into semantic tokens;
- final `design.md` exists;
- component/state inventory exists;
- responsive behavior is documented;
- Playwright visual snapshots exist;
- production build succeeds;
- Vercel Preview deployment is ready;
- no critical state is hidden at mobile width;
- draft and executed states are unambiguous;
- provenance is accessible without losing current task context.
