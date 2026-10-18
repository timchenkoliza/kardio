# Legal / Regulatory Gates — Russia, 2026

This is a product checklist for counsel, not legal advice.

## Gate 1 — Intended use / medical-device classification

Before public pilot, obtain a written memo answering:

> Is the product merely reference/search/education software, or does its intended use make it software that is a medical device?

Keep product claims narrow:
- find;
- navigate;
- explain source material;
- calculate transparent scores;
- summarize approved knowledge.

Avoid claims:
- diagnose;
- recommend treatment for a patient;
- monitor a patient;
- clinical decision support based on patient data.

Regulatory classification depends strongly on intended purpose.

## Gate 2 — Content rights

Build a rights matrix:

```text
source
owner
content type
linking allowed
indexing allowed
full-text storage allowed
snippet allowed
AI summarization allowed
translation allowed
offline copy allowed
branding allowed
contract required
```

Do not assume "publicly accessible" means "free to republish or summarize at scale".

## Gate 3 — Personal data

Even without patient data, accounts/search history/preferences may be personal data.

Before launch determine:
- operator status;
- privacy policy;
- legal basis;
- retention;
- processor/subprocessor contracts;
- localization requirements;
- notification obligations.

Do not collect health data about patients.

## Gate 4 — Recommender technologies

If the product begins to provide information based on collection/systematization/analysis of user preferences, legal review of Russian recommender-technology rules is required.

For the cheapest MVP, prefer:
- explicit specialty/topic filters;
- explicit follows/pins;
- deterministic editorial rules.

## Gate 5 — Advertising / pharma

Treat commercial content as a separate legal surface.

Do not mix it into clinical answers.

Before any pharma monetization:
- classify content as information vs advertising;
- check drug status;
- review Internet advertising restrictions;
- review labeling/reporting requirements;
- establish editorial independence.

Strong default:
**no pharma advertising in the first pilot.**

## Gate 6 — Clinical editorial responsibility

Require:
- named clinical editor;
- review checklist;
- source hierarchy;
- version/date;
- correction process;
- incident process;
- clear separation of source fact, editorial summary and AI-generated draft.

## Minimal legal team

Do not hire a full internal department.

Use:
- 1 external healthcare/regulatory lawyer;
- 1 privacy/data lawyer (may be same firm);
- 1 advertising/IP specialist on demand.

Request fixed-price deliverables, not open-ended consultation.

### Mandatory deliverables before pilot
1. intended-use / SaMD classification memo;
2. content-rights/licensing matrix;
3. privacy/data-processing memo;
4. advertising/pharma memo;
5. public terms + disclaimer review.
