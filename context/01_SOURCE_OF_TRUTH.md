# Source of Truth

## Priority

When evidence conflicts, use:

1. Explicit user instruction in the current task.
2. This pack's source-derived product constraints.
3. Original research in `/source`.
4. Selected visual direction after Phase 1.
5. Existing codebase behavior, if later supplied.
6. External UI references.
7. Model inference.

Never override higher-priority evidence with generic design convention.

## Product facts from source research

The assistant is **not a generic medical chatbot**.

It is a **contextual information and action layer over the clinician's workflow**, intended to understand:
- which patient or queue item is active;
- what phase of work the clinician is in;
- which patient facts and longitudinal changes matter;
- which clinical/operational decision is pending;
- which actions may be drafted or require explicit confirmation.

Core product formula:

> assistant = context + retrieval + safe actions

The assistant should reduce:
- searching across fragmented systems;
- manually assembling longitudinal context;
- documentation burden;
- follow-up/task closure burden.

It must **not replace clinical judgment**.

## Required product principle

The UI should answer:

> What does the clinician need to see and decide right now?

rather than:

> What should be done with this patient?

## Required interaction principle

The product is not "chat first".

The source describes a **contextual panel/workspace that changes by phase of work**.

It supports three interaction modes:
1. proactive cards;
2. questions about the active case;
3. commands that prepare an action.

## Required response anatomy

When the assistant gives a case-specific answer, the product must be able to expose:
- concise conclusion;
- supporting evidence from the patient record / approved knowledge;
- what is unknown;
- possible actions;
- confidence / uncertainty;
- what requires clinician confirmation.

## Scope discipline

First product slice:
- pre-visit brief;
- ambient note draft;
- AI-ECG triage / change highlighting;
- task closure.

Later:
- trajectory monitoring;
- implantable-device integrations;
- richer remote monitoring.

## Non-goals for first visual exploration

Do not prioritize:
- news feed;
- pharma promotion;
- social network;
- courses;
- community;
- generic wellness;
- full hospital information system replacement;
- autonomous diagnosis/prescribing.

These may exist in other products, but they are not the visual-design problem being solved here.
