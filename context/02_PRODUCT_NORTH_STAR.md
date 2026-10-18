# Product North Star

## User

Primary persona for this prototype:
**outpatient cardiologist working in a dense clinical schedule**.

The broader architecture should remain extensible to other specialties, but the first design is allowed to be cardiology-specific.

## Core job

During a fragmented working day, help the clinician rapidly reconstruct context, notice important changes, document the encounter, and close follow-up actions **without forcing them to manually stitch together multiple systems**.

## JTBD

### Before the visit
"When the next patient is approaching, help me understand in under ~1–2 minutes what changed, what is unresolved, and what deserves attention."

### During the visit
"When I am speaking with the patient, help me capture and retrieve useful information without stealing attention from the conversation."

### After the visit
"When a clinical decision has been made, turn it into reviewable drafts and trackable tasks so nothing falls through."

### Between visits
"When new results, symptoms, or monitoring data appear, help me decide which cases deserve my attention now."

## Product value

The assistant is valuable if it compresses:
- time to context;
- time to relevant evidence;
- time to documentation;
- time to task closure;
- time to recognition of a critical result.

## Trust value

The clinician must be able to understand:
- where a fact came from;
- whether it is a fact vs interpretation;
- whether data are current;
- why something was prioritized;
- what the system is uncertain about;
- whether an action has merely been drafted or actually executed.

## Metrics to preserve in future instrumentation

- preparation time before visit;
- documentation time after visit;
- share of drafts accepted with minimal edits;
- time to critical-result review;
- false-priority rate;
- open tasks at 7/30 days;
- clinician CSAT/NPS;
- later: clinical outcomes for remote monitoring programs.

## Design implication

Speed is not equivalent to minimalism.

The UI may be information-dense if hierarchy is strong.

The target is:
**high information value per visual unit, low cognitive switching cost, explicit provenance, clear action state.**
