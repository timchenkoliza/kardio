# Information Architecture — Working Hypothesis

This file distinguishes **source-derived required surfaces** from **design hypotheses**.

## SOURCE — required work surfaces

The source research explicitly identifies these useful surfaces:

1. Morning / queue
2. Patient context
3. In-visit
4. Result review
5. Therapy safety
6. Between-visits monitoring

It also requires post-visit task closure.

## DESIGN_HYPOTHESIS — product shell

Do not treat the following as final navigation. Test it.

Suggested conceptual hierarchy:

- **Today**
  - queue
  - priority cases
  - incoming results
  - open tasks

- **Patient workspace**
  - now / what changed
  - timeline
  - diagnostics
  - medications
  - open questions
  - tasks
  - sources/provenance

- **Visit mode**
  - ambient note
  - clarifiers
  - evidence
  - safety
  - draft plan

- **Follow-up**
  - pending tasks
  - overdue actions
  - trajectories
  - patient messages

- **Ask / command**
  - contextual input available throughout
  - never the only navigation model

## Core object model

### Patient
Stable identity/context.

### Encounter
One visit or episode of interaction.

### Observation
Lab, vital sign, ECG finding, imaging result, patient-reported symptom, telemetry/device signal.

### Change
Difference over time that may be clinically relevant.

### Evidence
Source supporting a statement: patient record, measurement, diagnostic report, guideline, approved knowledge source.

### Insight
Assistant synthesis/interpretation based on evidence.

### Unknown
Missing or unresolved data.

### Action
Something that could be done.

### Draft
Prepared but not executed action/document.

### Task
Assigned follow-up with owner, state, deadline.

### Alert/Priority
Reason attention is requested now.

### Audit event
Who/what/when/why.

## One-screen-one-decision principle

Each primary screen must answer one dominant decision.

Examples:

### Today
"Which cases need my attention first?"

### Patient / pre-visit
"What changed and what must I resolve?"

### Visit
"What should I capture, clarify, or verify right now?"

### Results
"What changed and is it important?"

### Therapy safety
"What makes this plan safe/unsafe/incomplete?"

### Follow-up
"What remains unresolved and who owns it?"

## Anti-patterns

Do not create:
- a dashboard where every module has equal visual weight;
- 20 simultaneous alerts;
- a giant patient chart with no current-question hierarchy;
- a chat pane that hides source context;
- duplicated timeline/data representations with no clear decision purpose.
