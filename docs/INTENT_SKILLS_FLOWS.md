# Intent Skills & Flows

Status: in progress on `feature/intent-skills-flows`, stacked on `feature/intent-evidence-experience`.

- **Capability baseline:** `b5317b5`. Every candidate is compared against it.
- **Mode:** shadow-first. A Skill becomes primary only after a differential evaluation passes.

The physician contract does not change: one professional intent in, the system decides how to execute it, one coherent interactive result out. Skills, Flows and plans are internal execution contracts. They are never navigation, never a catalogue, and never a source picker.

## Execution classes

| Class | When | Execution |
| --- | --- | --- |
| A. `IntentSkill` | a known, repeatable physician job | a versioned contract (match rules, evidence needs, source policy, experience policy, evaluation) that runs its Flow |
| B. `IntentFlow` | a known multi-step process | a versioned, inspectable DAG with evidence-dependent branches |
| C. Dynamic plan | a novel intent with no confident Skill | the existing SourcePlanner over the compiled intent (`dynamic_plan_used`) |
| Clarify | ambiguity that changes the execution | one bounded `ClarificationManifest`, then execute |

Free-form planning is never used when a proven Skill or Flow exists.

This document is filled in as the contracts land.
