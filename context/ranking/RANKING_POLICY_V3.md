# Ranking Policy V3 — no patient context

## MVP

Prefer deterministic delivery over ML ranking.

Rank from:
1. explicit query intent;
2. specialty/topic match;
3. source type;
4. freshness;
5. editorial priority;
6. explicit pin/follow;
7. source trust/editorial status.

No inferred patient state.

## Candidate classes

- clinical guideline;
- authoritative society source;
- drug/reference source;
- calculator;
- practical scenario;
- VMP/referral information;
- journal/research update;
- expert/community/channel;
- educational item;
- user-added link.

## Hard separation

Keep these visibly distinct:
- official / guideline;
- evidence/research;
- editorial summary;
- expert opinion;
- community/social;
- pharma/commercial;
- user-added/unverified.

## Why shown

Every recommended update should be able to say:

> Показано: кардиология → ХСН → вы подписаны на РКО → материал обновлён недавно.

Do not generate fictional reasons after ranking.

## MVP recommendation technology minimization

For the first release:
- use explicit topic/specialty selection;
- editorial rules;
- recency;
- deterministic source/category filters;
- user pin/follow.

Avoid hidden behavioral profiling.

If algorithmic recommendation based on user preferences is introduced, legal review of Russian recommender-technology requirements is mandatory.

## Objective

Do not optimize for time spent.

Optimize for:
- successful answer;
- source verification;
- useful repeat use;
- low correction rate;
- trust.
