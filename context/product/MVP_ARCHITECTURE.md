# MVP Architecture — resource-minimal

## First release

### 1. Search
One dominant entry point.

Jobs:
- guideline question;
- calculator/tool;
- drug/reference lookup;
- route/VMP;
- find an authoritative source.

### 2. Four quick jobs
Example:
- КР
- Калькуляторы
- Препараты
- Маршрутизация / ВМП

The exact labels should be validated with cardiologists.

### 3. Recent
Recent searches, tools and opened references.

May be local/on-device in the earliest prototype.

### 4. Frequent
Frequently used tools/sources.

Start deterministic or explicitly pinned.

### 5. One updates row
Only important professional updates.

Not an infinite feed.

### 6. Source registry
Searchable catalog of:
- professional societies;
- guidelines;
- journals;
- references;
- calculators;
- education;
- experts/channels;
- events.

## Suggested content scope

From the source research:
- 10 nosologies;
- 40–60 practical scenarios;
- 20 algorithms;
- 10 calculators;
- 30 drugs/reference entries;
- 20 guideline/research explainers;
- 10 VMP/referral scenarios;
- offline mode;
- cited search.

## Minimal architecture

```text
UI / PWA
  ↓
Search + navigation + calculators
  ↓
Structured content/index owned by product
  ↓
Licensed/public/partner knowledge sources
```

## Resource principle

Do not build:
- own medical corpus where an approved structured source/API exists;
- own MIS;
- patient integration;
- generic medical LLM.

Use AI for:
- tagging;
- retrieval assistance;
- query understanding;
- draft summaries;
- editorial operations.

Keep final medical publication under clinical editorial governance.
