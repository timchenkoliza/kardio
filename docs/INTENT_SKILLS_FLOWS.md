# Intent Skills & Flows

Status: implemented on `feature/intent-skills-flows` (Draft PR #17), stacked on `feature/intent-evidence-experience`. Preview only.

- **Capability baseline:** `b5317b5`. Every candidate is compared against it.
- **Rollout:** the three Skills ran in shadow first and became primary after a differential evaluation (`CHG-2026-10-22-intent-skills-primary`).

The physician contract does not change: one professional intent in, the system decides how to execute it, one coherent interactive result out. Skills, Flows and plans are internal execution contracts. They are never navigation, never a catalogue and never a source picker. Physicians see what is being done in their own words («Сравниваем текущую и предыдущую версии рекомендаций»), never «запущен skill …».

## Execution classes

```
UserIntent → IntentCompiler → known Skill?        → its Flow (fast path)
                            → ambiguous?          → one ClarificationManifest
                            → large comparison?   → explicit plan, one click
                            → novel               → dynamic plan (SourcePlanner)
```

| Class | When | Execution |
| --- | --- | --- |
| A. `IntentSkill` | a known, repeatable physician job | a versioned contract (match rules, context, evidence needs, source policy, experience policy, evaluation) that runs its Flow |
| B. `IntentFlow` | the Skill's process | a versioned, inspectable DAG; branches depend on the evidence found |
| C. Dynamic plan | a novel intent with no confident Skill | the existing SourcePlanner over the compiled intent; `dynamic_plan_used` with a text-free signature |
| Clarify | ambiguity that changes what is executed | one bounded `ClarificationManifest`, at most one turn |

Free-form planning is never used when a Skill exists. Nothing generates frontend code: an LLM (none is used today) could only ever produce the native structures (intent, plan, evidence graph, manifest, patch, clarification, Skill candidate).

## IntentSkill (`lib/mesh/skills/types.ts`)

`id, version, domain {specialties, nosologies}, matches {families, jobs?, requires {drug?, nosology?, population?}, signals[], excludes[], threshold}, requiredContext, optionalContext, clarificationPolicy {askWhenMissing, maxTurns: 1}, evidenceNeeds, optionalEvidence, executesAs, preferredCapabilities, sourcePolicy, flowId, experiencePolicy {modules, takeaway per family, explanation}, evaluationContract {cases, noRegressionAgainst: "generic", maxUnsupportedClaims: 0}, safety, rollout {mode: shadow | primary, change}`.

A Skill only **adds** to the generic intent: `applySkill` unions the generic requirements with the Skill's evidence needs and the generic modules with the Skill's order. No-regression holds by construction for evidence; the differential evaluation checks it for results.

## The three Skills

| Skill | Matches | Executes | Flow |
| --- | --- | --- | --- |
| `cardiology.guideline_change@1.0.0` | «Что изменилось в рекомендациях по ХСН?», «Какие новые рекомендации по ХСН-сФВ?», «Сравни текущие рекомендации по ХСН с предыдущими» | `guideline_check` with the Russian guideline, research, official status; society guideline when available | `guideline_change.flow` |
| `cardiology.drug_evidence@1.0.0` | «Эмпаглифлозин при ХСН-сФВ — что сейчас известно?» (drug + disease + current state) | exactly the golden path (same intent id, requirements, optional evidence, modules as «Эмпаглифлозин при ХСН с сохранённой ФВ — что сейчас с рекомендациями?») | `drug_evidence.flow` |
| `pediatrics.drug_reference_children@1.0.0` | «Амоксициллин у детей», «Ибупрофен детям: противопоказания» (pediatrics only) | `drug_reference` with pediatric sections; children information first | `pediatric_drug_reference.flow` |

The other specialties (therapy, obgyn, neurology, endocrinology) have empty libraries and use the generic path.

## IntentFlow (`lib/mesh/flows/*`)

`id, version, inputs, steps [{id, kind: resolve | retrieve | derive | branch | validate | compile, label, requirements?, operation?, branch? {when, then, otherwise}}], dependencies, stopConditions, fallbackPolicy {onFailure: "generic_path"}, outputContract`.

`guideline_change.flow` (15 steps):

```
resolve_topic → resolve_scope → retrieve_current ─→ official_status ─┬─ then ──────────────→ current_version
                              └→ retrieve_research                    └─ otherwise → official_gap ┘
current_version → retrieve_previous → has_previous ─┬─ then → version_delta ─┬→ affected_claims → conflicts_currentness → validate → compile
                                                    └─ otherwise → current_state ┘
```

- Official Russian guideline found? yes → compare; no → hand-off to the rubricator, professional copy, explicit gap.
- Previous version found? yes → version delta with the changed assertions marked; no → current-state experience with the revision date.

The flow runtime (`lib/mesh/flow-runtime.ts`) walks the DAG over the evidence the one source plan gathered (retrieval is still the SourcePlanner's), evaluates branch conditions deterministically, records the path taken (`official_status:then`, `has_previous:otherwise`, …) and turns derive steps into bounded directives: props on approved modules, explicit gaps, takeaway priority. Any failure — a flow error or a manifest the policy gates reject — falls back to the generic compile of the same evidence (`compileWithSkill`).

## Matching (`lib/mesh/skills/match.ts`)

Layered, never one regex: domain graph (specialty, nosology) → job family (an explicitly chosen job is never overridden) → required entities → weighted phrase signals and exclusions → confidence vs threshold. Returns `matchedSkill, confidence, reasons, alternatives`, and a Skill whose job is clearly asked for but whose context is missing. Several Skills with the same execution → chosen silently; different executions within 0.1 → one question.

## Clarification (`lib/mesh/clarification.ts`)

`ClarificationManifest {schema: kardio.clarification/0.1, id, question, options [{id, label, effect {job?, focus?, entity?, completeText?, edit?}}], allowFreeText: true, reason: facet_changes_execution | entity_unresolved | skills_disagree, original {text, specialty}}`.

- «Подходит ли семаглутид?» → «Что важно уточнить про семаглутид?» Показания · Безопасность · Дозирование · Сравнить препараты · Новые данные (or own words).
- «Семаглутид — что с ним?» → no question.
- «этот препарат» → resolved from the session when one recent drug is clearly meant; two equally recent → which one; none → «О каком препарате речь?».
- «Что изменилось в рекомендациях?» → the topic from the session, otherwise «По какой теме?».
- One turn: an answered request (an option, or the physician's own words) is never asked again; next-action buttons never stop for a question.

## Result as context

`ExperienceContext` (`lib/mesh/refine.ts`) — bounded references, never the conversation: run, manifest version, intent, entities, graph id, visible modules and documents in display order, current view, previous patches, validated sources.

A follow-up typed on an open result is first read as an `IntentDelta` of that result:

| Follow-up | Delta | Answered from |
| --- | --- | --- |
| «Оставь только российские источники» | `filter_jurisdiction RU` | the graph |
| «Покажи только изменения после 2024 года» | `filter_since 2025` | the graph |
| «Покажи данные после 2025 года» | `fresh_since 2026` | the graph, or one PubMed search with that start year |
| «Сравни только дозировки» | `focus dosing` | the graph, or one re-read of the instruction's dosing section |
| «Раскрой второй источник» | `expand 2` | the graph |
| «А что изменилось относительно прошлой версии?» | `version_delta` | the graph, or the society-guideline source if it was not asked |
| «Покажи всё» | `reset` | the graph |

Dependency resolution: `IntentDelta → affected requirements → graph nodes → modules → patch`. A merged retrieval keeps the graph id, so module identities survive. A new drug or disease in the follow-up is a new question (with the session as context), never a refinement.

## ExperiencePatch v0.2 (`lib/mesh/patch.ts`)

`schema, runId, parentManifestVersion, manifestVersion, modulesAdded[], modulesUpdated[], modulesRemoved[], preservedModules[], changes [ModulePatch {moduleId, family, fields, claimsAdded, claimsRemoved}], reason {kind: source_result | final | refinement, intentDelta, affectedEvidence {requirements, documentIds, claimIds}, retrieval}, status`.

A refinement patches the same run: same URL, same module ids, the follow-up input stays mounted, saved results stay saved. The chain is kept on the run (`run.patches`, last 10).

## SessionContext (`lib/mesh/session-context.ts`)

Recent completed runs of this session within 24 h (max 5), active entities (drug, nosology, subtype — ids and labels from validated results) with confidence decaying by recency and age, clarification choices (ids), saved count, the current result's patch chain. No text, no inferred traits, no patient data, no MIS/EHR. What a run was decided with (resolved entity ids, the answered clarification, a confirmed plan) is persisted on the run, and execution re-decides the strategy from exactly that.

## Explicit plan

Only for large work — today: a comparison of three or more drugs. «Я проверю: 1… 4. [Продолжить]». Everything else stays one click.

## Learning without self-modification

`dynamic_plan_used` carries a text-free signature (`specialty|job|nosology|subtype|drug|populations`). A signature repeated ≥ 3 times by ≥ 2 sessions in 14 days becomes a `SkillCandidate` and a PROPOSED Control Plane Change whose release decision BLOCKs; an editor curates the evaluation set, the differential evaluation runs, a human approves, and only then a new versioned Skill is written in code.

## Connectors

`Connector = SourceConnector | ActionConnector` (`lib/mesh/connectors.ts`). Sources only read. Every action requires the physician's confirmation; this phase adds no external action.

## Observability

`intent_skill_matched, intent_skill_missed, intent_skill_ambiguous, clarification_shown, clarification_resolved, intent_flow_started, intent_flow_step_completed, intent_flow_branch_taken, experience_patch_compiled, experience_patch_applied, skill_candidate_created, dynamic_plan_used` (+ `intent_skill_shadow_compared`, `plan_preview_shown`). Ids, categories, counts and timings only — never the physician's text. The run stores how it was executed (`run.execution`: class, Skill, confidence, flow trace, signature, fallback, shadow, timings); the status endpoint exposes it for diagnostics.

## Shadow → primary

1. Skills shipped in `shadow`: the generic path answers, the Skill runs after the answer is saved and is compared (`compareShadow`: lost modules, lost answering sources, unsupported claims shown, fallback; additions allowed; latency reported).
2. Local live differential (`tests/live/skills-differential.test.ts`, 14 cases, live MEDI/PubMed/openFDA): 14/14 pass.
3. Remote shadow on the real Preview of `f797c7f` (Neon): 14/14 runs with verdict pass.
4. `CHG-2026-10-22-intent-skills-primary` records the evidence; each Skill's rollout names it.

## Forced source failure (Preview only)

`KARDIO_FAULT_SOURCE_DELAY="<source>:<ms>"` + `KARDIO_FAULT_BRANCH="<branch>"` delay one source before it is called, only on a Preview of exactly that branch (`injectedDelayMs`, unit-tested to be inert in production, on other branches, locally, or without both settings). Used once on `ca50a21` with `pubmed:30000`, then disabled.
