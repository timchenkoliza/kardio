# Trust, Safety, and Action Contract

This is a product/UI contract, not legal advice.

## Human authority

The clinician remains the final interpreter and signer.

The assistant does not:
- autonomously establish the final diagnosis;
- autonomously sign a note;
- autonomously prescribe;
- autonomously cancel medication;
- autonomously hospitalize;
- silently write into authoritative clinical systems.

## Action classes

### 1. Read-only
Examples:
- read schedule;
- read EHR data;
- read results;
- read device data;
- retrieve approved knowledge.

UI requirement:
Clearly show source freshness and access provenance where material.

### 2. Draft-only
Examples:
- draft clinical note;
- draft referral;
- draft message;
- draft task;
- draft patient instructions.

UI requirement:
Use explicit `DRAFT` state and editable review.

### 3. Write-back
Examples:
- sign/write EHR record;
- create final order;
- send confirmed instruction;
- change booking;
- issue prescription.

UI requirement:
Requires explicit human confirmation.

Never visually blur "prepared" and "executed".

## Required safety affordances

### Grounding
Case-specific claims must be traceable.

### Citations / provenance
The clinician must be able to inspect where a clinical statement came from.

### Confidence
Low-confidence output must visually look different from high-confidence output.

### Uncertainty
Separate:
- fact;
- interpretation;
- recommendation/option;
- assumption.

### Escalation
Critical signals must route to clinician/emergency workflow, not trigger autonomous treatment.

### Audit
Design for an inspectable history of:
- user;
- patient;
- request;
- data used;
- generated draft;
- confirmation;
- execution.

### Consent
Ambient recording / telemetry / AI processing states must be representable.

## Visual anti-patterns

Avoid:
- authoritative green "AI approved" stamps;
- probability percentages without meaning;
- warning colors for routine information;
- hidden source links;
- autonomous-sounding CTA labels;
- silent background write-back;
- clinical recommendations mixed with commercial content.
