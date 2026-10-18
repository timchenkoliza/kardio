# Product Boundaries

## What we are building

A professional cardiology navigator for physicians.

The product helps a physician:
- find an answer in a guideline quickly;
- open the exact supporting source;
- run a calculator;
- verify drug information;
- understand what changed in a guideline or evidence base;
- navigate referral / VMP information;
- save and revisit useful material;
- follow selected professional sources.

## What we do not know

We do not know:
- who the patient is;
- whether the physician is currently seeing a patient;
- the physician's appointment schedule;
- diagnosis, laboratory results, ECG, imaging or therapies for a real patient;
- clinical urgency.

Therefore the product must never pretend it knows these things.

## Allowed context

### Explicit
- specialty/subspecialty selected by the user;
- query;
- selected topic;
- selected source;
- pinned tools;
- saved items;
- manually chosen update frequency;
- manually added links/channels.

### Behavioral, later and opt-in
- recent searches;
- recent opened materials;
- saves;
- source follows;
- explicit feedback.

Do not infer clinical context from them.

## Positioning

The company is not the clinical authority.

The product is the interface and distribution layer over authoritative or contractually approved medical knowledge.

## Trust contract

For every medical answer:
- identify source;
- identify source type;
- show publication/update date when available;
- distinguish quote/fact from AI summary;
- do not fabricate missing evidence;
- provide path to original source.
