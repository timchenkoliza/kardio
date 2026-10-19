# Cardiology Harness 2027

## Thesis

The product is one professional Harness, not a menu of dozens of AI products.

A physician states a job in natural language. The Harness turns that job into a durable contract, selects the allowed context adapters and tools, executes the task when the required runtime exists, returns evidence-backed artifacts for review, and remembers the physician's accepted rules.

Primary loop:

`Intent -> Rules -> Context adapters -> Skills/tools -> Run -> Evidence -> Artifact -> Physician review -> Memory`

The 42 templates in the catalog are capability recipes over this common loop. They must not become 42 primary navigation destinations.

## Harness primitives

1. **Intent** — the professional job stated by the physician.
2. **Rules** — persistent constraints: topic, specialty, evidence policy, preferred sources, output shape and notification policy.
3. **Context adapters** — professional/public sources, user-owned materials, clinical systems and device systems when connected.
4. **Skills/tools** — search, evidence retrieval, comparison, calculators, structured extraction, document generation and validated external medical modules.
5. **Run** — one execution of a configured agent.
6. **Evidence package** — source identity, date, evidence type, provenance, uncertainty and primary-source links.
7. **Artifact** — delta, brief, comparison, watchlist or learning plan.
8. **Review** — physician accepts, rejects, corrects or changes the rules.
9. **Memory** — accepted preferences and prior reviewed outputs influence the next run.

## Execution tiers

### Tier A — professional-information agents

These can be configured without patient data. They operate on approved professional/public sources and user-owned materials.

Examples: guideline delta, research watch, trial watch, safety signals, regulatory changes, source watch, therapy comparison, calculator selection, Journal Club, learning, events and publication support.

A configured agent is not the same thing as an active background monitor. Until a scheduler/runtime exists, the product must say **configured**, never imply that monitoring is already running.

### Tier B — clinical-context agents

These require an explicit clinical connector before execution. They may use only the data exposed by that connector and must preserve source attribution.

Examples: pre-visit review, inbox triage, order drafts, follow-up plan, heart-failure monitoring, blood-pressure trends, lipid/prevention gaps, implanted-device follow-up, trial matching, documentation support, registry/quality and administrative documentation.

These templates may exist in the catalog before a connector is available, but must remain a **draft** and clearly state the missing dependency.

### Tier C — validated medtech agents

ECG, echocardiography and cardiac-imaging workflows require a validated/approved diagnostic or measurement module. The Harness may orchestrate and explain the structured output of that module; it must not silently replace it with free-form image interpretation.

Examples: ECG assistant, Echo assistant and cardiac-imaging review.

## 2027 cardiology capability map

### 1. Knowledge and evidence

- What changed in guidelines
- New therapy evidence
- Major trials / Hot Line
- Drug and device safety signals
- Label / indication changes
- Regulatory changes
- Single-source watch
- Topic map

### 2. Decision support and second opinion

- Practice brief
- Therapy strategy comparison
- Drug-safety check
- Calculator / score orchestrator
- Multi-perspective consilium
- Second-opinion pack
- Referral / expert-centre navigation

These are evidence and workflow aids for qualified professionals. The physician retains responsibility for clinical decisions.

### 3. Cardiology signals and longitudinal monitoring

- ECG assistant
- Echo assistant
- Cardiac imaging
- Rhythm / wearable signals
- Heart-failure monitoring
- Home blood-pressure monitoring
- Lipid and secondary-prevention gaps
- Implanted-device follow-up

### 4. Clinical workflow

- Pre-visit chart review
- Ambient/dictation documentation draft
- Draft orders
- Inbox and results triage
- Follow-up plan
- Prior authorization / administrative documents
- Coding and documentation completeness
- Registry and quality measures

### 5. Research and professional development

- Clinical-trial matching
- Journal Club
- Learning plan
- Events
- Publication / literature assistant
- Presentation and case-conference assistant

### 6. Partner formats

Partner content is a separate commercial plane. It is never an evidence source for independent medical ranking unless the same claim is independently retrieved and evaluated from a non-commercial source.

## Pharma contract: only the formats in the current commercial proposal

The current commercial proposal defines exactly five commercial formats. They are implemented one-to-one as commercial primitives:

| Commercial proposal format | Harness primitive | Package volume |
| --- | --- | --- |
| Статья | `partner_article` | 1 month |
| Полезное | `partner_useful` | 1 month |
| Медиа | `partner_media` | 1 month |
| Событие | `partner_event` | 1 month |
| Performance-продвижение | `partner_performance` | 50,000 clicks |

The proposal also defines a combined package containing all five formats for 5,000,000 RUB.

There is **no separate sixth format named “спецпроект” in the current proposal**. Therefore a special project may currently only be represented as a composition of the five approved primitives above. A new commercial primitive requires a new approved commercial specification; product code must not invent one.

### Commercial format semantics

**Статья** — expert material, interview, case analysis or research, with a concise summary at the beginning.

**Полезное** — checklist, infographic, collection, cards or practice cheat sheet; optimized for save/download/use actions.

**Медиа** — video, podcast or approved UGC; rights, author and sponsor disclosure are mandatory.

**Событие** — course/conference/webinar announcement, reminder flow and in-service registration where supported.

**Performance-продвижение** — distribution and campaign optimization against allowed physician actions. It is not a medical agent and cannot change evidence ranking, clinical synthesis or provenance.

## Mandatory separation of independent and commercial planes

`IndependentEvidencePlane != CommercialDistributionPlane`

Every partner artifact must have:

- explicit sponsor identity;
- commercial format type;
- approved corpus/source;
- legal/medical review status when the production system adds it;
- claim provenance;
- rights metadata for media;
- independent engagement metrics;
- mute/disconnect control.

Partner material must never:

- alter independent evidence ranking;
- become an unattributed medical claim;
- be injected into a consilium answer as independent evidence;
- influence a guideline/research delta without independent source support;
- be hidden behind a neutral-looking editorial label.

## Runtime contract for every physician agent

Every run should eventually persist:

- `agentId`
- `runId`
- `intent`
- `ruleVersion`
- `contextAdapters[]`
- `toolCalls[]`
- `startedAt` / `completedAt`
- `observations[]`
- `modelInterpretations[]`
- `evidence[]`
- `artifact`
- `uncertainties[]`
- `reviewStatus`
- `reviewedBy`
- `reviewedAt`
- `feedback`

Observed source facts and model-generated interpretation must remain distinguishable throughout the run.

## Product rule

Do not add another top-level section because a new capability appears.

A new capability should normally be expressed as one of:

- a new agent recipe;
- a new context adapter;
- a new tool/skill;
- a new artifact renderer;
- a new trigger;
- a new review policy.

Only a genuinely different user-owned object model should justify a new top-level product area.

## Release gates for Harness 2027

Before calling the Harness operational rather than architectural:

1. Agent configuration is durable across server instances.
2. Background scheduler creates real runs and retryable job state.
3. Every run records provenance and separates observed facts from model interpretation.
4. Evidence artifacts support physician review and correction.
5. Connector-gated agents cannot execute without their declared dependency.
6. Regulated imaging/signal agents cannot fall back to free-form diagnostic interpretation.
7. Independent and commercial ranking are technically isolated.
8. Pharma creation is limited to the five commercial-proposal formats.
9. Performance campaigns affect distribution metrics only, not evidence or synthesis.
10. One policy update can propagate across all relevant agent recipes and artifacts.
