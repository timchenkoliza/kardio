# Drug Intelligence + Synthetic Consilium — CURRENT → REFERENCE audit

Status: READ-ONLY REFERENCE INPUT

Primary references: Medscape for professional density, search, drug-tool hierarchy and evaluation; Meditopia only for focused setup/progression. This document is a geometry and interaction reference, not a license to copy branding, color, content, claims or proprietary UI.

## 1. Drug discovery / comparison

**CURRENT PRODUCT PATTERN**  
Search + sort controls above a two-column comparison/detail workspace. Ranked rows show trade name, INN, score and rating count.

**REFERENCE PATTERN**  
Medscape-style task-first drug lookup: search is dominant, results are dense, repeated identifiers are compact, evaluation is adjacent to the lookup rather than separated into dashboard cards.

**TARGET GEOMETRY**  
Desktop: 300–360 px bounded comparison rail + flexible detail surface. Tablet/mobile: comparison above detail. Search spans the available working width; sort remains secondary.

**PRIMARY JOB**  
Find the relevant drug quickly and compare it inside one indication.

**PRIMARY ACTION**  
Select a drug.

**SECONDARY ACTIONS**  
Search by trade name/INN; change ranking dimension.

**CONTENT ZONES**  
Search; sort; indication context; result rows; score/rating-count evidence.

**STICKY / SCROLL MODEL**  
Desktop comparison rail may remain sticky and independently scroll when long. Page must not horizontally scroll.

**REQUIRED STATES**  
Default; filtered; no match; selected; insufficient aggregate.

**KEEP**  
Indication-specific ranking; deterministic synthetic demo label; INN + trade name; rating-count threshold.

**ADAPT**  
Increase professional density; reduce card-like separation; strengthen selected-row state.

**MISSING**  
No-result message can be added when the dataset grows.

**DO NOT COPY**  
Medscape branding, navigation chrome, copy, severity taxonomy or commercial/formulary modules.

## 2. Drug detail

**CURRENT PRODUCT PATTERN**  
Class → trade name → INN → indication → multi-dimensional profile → peer comment → consilium handoff.

**REFERENCE PATTERN**  
Medscape-style compact monograph hierarchy: identity first, then the decision-relevant evidence and tools without decorative hero treatment.

**TARGET GEOMETRY**  
Flexible main detail column with a compact identity header separated from the evaluation profile by a rule. No image requirement.

**PRIMARY JOB**  
Understand why the selected drug ranks as it does for the current indication.

**PRIMARY ACTION**  
Inspect the evaluation profile.

**SECONDARY ACTIONS**  
Read demo peer comment; hand the exact drug/indication context to consilium.

**CONTENT ZONES**  
Identity; indication; five rating dimensions; aggregate state; comment; handoff.

**STICKY / SCROLL MODEL**  
Normal page flow; comparison rail can remain sticky beside it on desktop.

**REQUIRED STATES**  
Displayable aggregate; below-threshold aggregate; no comment.

**KEEP**  
No invented links; explicit synthetic-data disclosure; no patient context.

**ADAPT**  
Use denser spacing and stronger section boundaries instead of additional cards.

**MISSING**  
Real evidence links belong only when source-grounded data exists.

**DO NOT COPY**  
Drug monograph text, proprietary clinical wording or Medscape content structure beyond generic information hierarchy.

## 3. Rate drug

**CURRENT PRODUCT PATTERN**  
Five dimensions, 1–5 or cannot-rate, optional comment, browser-local persistence.

**REFERENCE PATTERN**  
Professional evaluation should feel like a compact instrument, not a survey form.

**TARGET GEOMETRY**  
Desktop: dimensions distributed across one bounded row. Narrow widths: single-column fields with 40+ px touch targets.

**PRIMARY JOB**  
Record the physician's own structured assessment without contaminating aggregate demo data.

**PRIMARY ACTION**  
Save my rating.

**SECONDARY ACTIONS**  
Set/clear individual dimension; add optional comment.

**CONTENT ZONES**  
Dimension legend; score controls; comment; local-only disclosure; save.

**STICKY / SCROLL MODEL**  
Normal flow below drug detail.

**REQUIRED STATES**  
Empty; partially rated; fully rated; saved; cannot-rate.

**KEEP**  
Local-only storage and separation from Golden Set.

**ADAPT**  
Tighter grouping and larger mobile targets.

**MISSING**  
No server aggregation until product/data governance explicitly approves it.

**DO NOT COPY**  
Sermo voting copy, community counts or claims about real physician consensus.

## 4. Consilium setup

**CURRENT PRODUCT PATTERN**  
Persistent list of five synthetic professional archetypes; 2–5 selectable; three selected by default.

**REFERENCE PATTERN**  
Meditopia-style focused setup/progression: a finite choice, clear selected state, minimal cognitive branching before entering the main session.

**TARGET GEOMETRY**  
Desktop: narrow left rail. Mobile/tablet: horizontal snap list above the conversation rather than a long vertical preamble.

**PRIMARY JOB**  
Choose which professional lenses participate.

**PRIMARY ACTION**  
Select/deselect a persona.

**SECONDARY ACTIONS**  
Review role and decision lens.

**CONTENT ZONES**  
Participant count; persona identity; role; lens; selected state.

**STICKY / SCROLL MODEL**  
Desktop setup rail may be sticky. Mobile persona list scrolls horizontally inside its own zone.

**REQUIRED STATES**  
2 selected minimum; 5 selected maximum; active/inactive.

**KEEP**  
Explicit synthetic-persona framing; specialty boundary.

**ADAPT**  
Reduce setup footprint on mobile; preserve full role/lens copy.

**MISSING**  
No onboarding wizard is required for the release candidate.

**DO NOT COPY**  
Meditopia visual identity, wellness language, illustrations or progression rewards.

## 5. Consilium conversation

**CURRENT PRODUCT PATTERN**  
One composer, ask-all or ask-one targeting, deterministic persona replies, per-message follow-up action.

**REFERENCE PATTERN**  
Focused session surface: the conversation is the dominant working region; controls stay close to the composer and secondary setup does not compete with it.

**TARGET GEOMETRY**  
Desktop: conversation is the widest column. Mobile: full-width conversation after setup, composer stacked vertically.

**PRIMARY JOB**  
Compare multiple professional reasoning lenses on one question.

**PRIMARY ACTION**  
Send a question.

**SECONDARY ACTIONS**  
Target one persona; return to all; clear session; ask a persona separately.

**CONTENT ZONES**  
Session header; message stream; target controls; composer.

**STICKY / SCROLL MODEL**  
Message stream scrolls inside the conversation on desktop; narrow layouts use page flow without horizontal overflow.

**REQUIRED STATES**  
Empty; all-persona round; single-persona follow-up; persisted session; cleared session.

**KEEP**  
Distinct persona replies; no patient-data workflow; deterministic demo engine.

**ADAPT**  
Give the chat the largest desktop column and reduce bubble/card visual weight.

**MISSING**  
No typing simulation or decorative AI animation is needed.

**DO NOT COPY**  
Consumer-chat branding, typing theatrics or claims that the synthetic output is medical advice.

## 6. Consilium synthesis

**CURRENT PRODUCT PATTERN**  
Four sections: agreement, disagreement, clarification, sources.

**REFERENCE PATTERN**  
Professional summary stays simultaneously visible beside the discussion on wide screens and becomes the final stage on narrow screens.

**TARGET GEOMETRY**  
Desktop: narrow sticky right rail. Tablet/mobile: full-width section after conversation.

**PRIMARY JOB**  
See where the professional lenses converge and diverge without flattening disagreement.

**PRIMARY ACTION**  
Review agreement/disagreement.

**SECONDARY ACTIONS**  
Review clarifications and source guidance.

**CONTENT ZONES**  
Agree; disagree; clarify; sources.

**STICKY / SCROLL MODEL**  
Sticky and independently scrollable on desktop; normal page flow on narrow widths.

**REQUIRED STATES**  
Pre-round empty state; post-round synthesis; single-persona follow-up must not erase prior disagreement context.

**KEEP**  
Separation of agreement and disagreement; no invented citations.

**ADAPT**  
Compact sticky rail on desktop; preserve reading order on mobile.

**MISSING**  
Source-grounded citations can be added only when the consilium engine is connected to real retrievable evidence.

**DO NOT COPY**  
Reference-site copy, color system, proprietary taxonomy or content.
