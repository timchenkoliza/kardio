# Responsive Contract

## Principle

Do not design desktop and later "adapt it".

Every concept must define behavior at multiple sizes during Phase 1.

## Anchor viewports for exploration

Use at minimum:

- 390 × 844 — reference phone;
- 768 × 1024 — tablet portrait;
- 1440 × 1000 — desktop workspace.

During Phase 2 add:
- 360 px width;
- 430 px width;
- 1024 px width;
- larger desktop if useful.

## Device-role hypothesis

### Desktop
Primary mode for:
- dense chart review;
- encounter work;
- longitudinal comparison;
- multi-source context.

### Tablet
Primary mode for:
- room-to-room movement;
- patient context;
- result review;
- task confirmation.

### Phone
Primary mode for:
- queue;
- priority alerts;
- fast context;
- small case questions;
- follow-up/task actions.

Phone should **not** be a shrunk desktop EHR.

## Responsive rules

For every major component define:
- what stays visible;
- what becomes summarized;
- what moves into a sheet/drawer;
- what can scroll;
- what truncates;
- what becomes sequential;
- what must never disappear.

## Clinical safety rule

A responsive transformation may not hide:
- active patient identity;
- critical warning reason;
- source/provenance access;
- draft vs executed state;
- confirmation requirement.

## Layout guidance

Prefer:
- intrinsic layout;
- CSS Grid/Flex;
- content-driven wrapping;
- `clamp()`;
- container queries where appropriate.

Avoid:
- global `transform: scale`;
- absolute positioning as primary layout system;
- dozens of device-specific breakpoints.

## Long content tests

Every concept must survive:
- long patient names;
- multiple diagnoses;
- long drug names;
- 3–5 simultaneous source references;
- long task owner labels;
- missing values;
- abnormal value + explanation;
- Russian localization.
