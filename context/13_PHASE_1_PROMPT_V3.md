# Claude Sonnet 5.5 High Reasoning — Phase 1 V3

Read `00_START_HERE.md` and every required file before coding.

## Hard boundary

You have NO:
- patient data;
- EHR;
- appointments;
- encounter context;
- clinical results;
- task list from a medical system.

If you create any of these, the concept is invalid.

## Mission

Discover the strongest interface architecture for a Russian cardiology professional navigator with a 3.5-person implementation team.

## First prove the core

Design around:
- search;
- authoritative sources;
- calculators;
- drugs/reference;
- practical scenarios;
- VMP/referral navigation;
- saved/recent;
- important updates.

## Compare at least 3 architectures

1. Search-first Navigator
2. Professional Toolbelt
3. Knowledge Workspace

Only after those exist, show Gen-UI/custom workspace as an extension.

## Knowledge base

Use `knowledge/source_registry.cardiology.json` as observed source research.

Important:
a source being observed does NOT mean it is clinically endorsed.

Visually distinguish:
- official/guideline;
- professional society;
- evidence/research;
- journal/editorial;
- expert/community;
- pharma/commercial;
- user-added.

## MVP constraints

No required registration.
No patient data.
No AI chat as primary surface.
No inferred recommendation profile.
No infinite feed.

## Responsive

Show:
- 390×844
- 768×1024
- 1440×1000

## Comparison

For each concept assess:
- time to first useful answer;
- source visibility;
- cognitive load;
- calculator/tool access;
- repeat-use mechanics;
- scalability to other specialties;
- implementation cost for 3.5 people;
- fit for later Gen-UI.

Stop before final design system selection.
