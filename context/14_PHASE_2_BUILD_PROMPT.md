# PHASE 2 PROMPT — Selected Direction → Pixel-first Application

Use this only after the user has explicitly selected or combined a Phase 1 direction.

You are Claude Sonnet 5.5 with high reasoning effort.

## Objective

Turn the selected visual direction into a coherent, responsive, high-fidelity interactive application suitable for Vercel Preview review.

The working UI, rendered screenshots, tests, and codebase are stronger evidence than a verbal claim of completion.

## 1. Freeze design intent

Create:
- `design/design.md`
- `design/tokens.css`
- `docs/UI_MAP.md`
- `docs/STATES.md`
- `docs/RESPONSIVE.md`
- `docs/DECISIONS.md`

`design.md` must document:
- visual thesis;
- typography;
- spacing;
- density;
- surfaces;
- borders/elevation;
- semantic colors;
- motion;
- provenance pattern;
- AI presence pattern;
- anti-patterns.

## 2. Semantic tokens

Use semantic names, not arbitrary color names.

Examples:
- `text-primary`
- `text-secondary`
- `surface-base`
- `surface-raised`
- `border-subtle`
- `accent-primary`
- `status-critical`
- `status-warning`
- `status-neutral`
- `action-draft`
- `action-confirmed`

## 3. Technical baseline

Unless the existing repository requires otherwise:
- Next.js;
- React;
- TypeScript;
- CSS variables;
- deterministic mocks;
- Playwright.

Keep domain/business rules outside JSX.

## 4. State contract

Support relevant:
- idle;
- loading;
- empty;
- partial;
- error;
- low-confidence;
- selected;
- expanded;
- editing;
- draft;
- awaiting-confirmation;
- confirmed;
- executed;
- overdue.

## 5. Responsive contract

Visual acceptance viewports:
- 360
- 390
- 430
- 768
- 1024
- 1440

Preserve at all widths:
- active patient identity;
- priority reason;
- provenance access;
- unknown/uncertainty state;
- draft vs executed state;
- confirmation boundary.

## 6. Pixel-first visual QA

For every critical route:
1. render;
2. screenshot;
3. inspect;
4. identify largest visual/systemic mismatch;
5. fix one class of problem;
6. rerender;
7. verify other viewports.

Fix in this order:
1. geometry;
2. hierarchy;
3. typography;
4. spacing;
5. assets;
6. state styling;
7. color;
8. micro-interactions.

## 7. Anti-slop

Do not add:
- gratuitous gradients;
- glass;
- generic cards everywhere;
- marketing hero patterns;
- arbitrary pills/badges;
- random icons;
- decorative AI symbols.

## 8. Visual regression

Use Playwright screenshot tests for critical routes and anchor viewports.

Keep thresholds tight enough to detect accidental layout drift but realistic for cross-environment rendering.

## 9. Vercel

The app must be Vercel-ready from the working branch.

Before declaring ready:
- typecheck;
- lint;
- functional tests;
- visual tests;
- production build.

Use Preview Deployment as the review artifact.

## 10. Final report

Report:
1. selected visual thesis;
2. implemented routes;
3. responsive decisions;
4. test/build status;
5. visual QA viewports;
6. assumptions;
7. intentional deviations;
8. unresolved issues;
9. Preview URL when available.
