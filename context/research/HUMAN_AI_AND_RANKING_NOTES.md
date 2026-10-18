# Human-AI + Ranking Research Notes

These sources are inputs to product principles, not templates to copy.

## Microsoft — Guidelines for Human-AI Interaction

Source:
https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/

Most relevant requirements for this product:

- time AI services based on current context;
- show contextually relevant information;
- support efficient invocation;
- support efficient dismissal;
- support efficient correction;
- scope service when uncertain;
- explain why the system did what it did;
- remember recent interactions;
- learn from behavior;
- adapt cautiously;
- collect granular feedback;
- show consequences of user actions;
- provide global controls;
- notify users when behavior/capabilities change.

Translate directly into interaction acceptance tests.

## Anthropic — Emotion concepts and their function

Source:
https://www.anthropic.com/research/emotion-concepts-function

Use as a model-behavior governance input:
- latent internal representations can shape behavior;
- visible tone alone is not enough to audit model behavior;
- stable product behavior needs evaluation, not just prompting.

Do NOT use this as evidence that physicians should be emotionally profiled.

## Anthropic — Persona vectors

Source:
https://www.anthropic.com/research/persona-vectors

Use as a reason to:
- test for assistant-persona drift;
- test sycophancy/hallucination/overconfidence;
- keep professional behavior stable across user profiles.

## Ilya Sutskever / Dwarkesh — emotions and value functions

Source:
https://www.dwarkesh.com/p/ilya-sutskever-2

Useful product analogy:
the recommender needs an explicit **intermediate value function**.

For this product that value is not "engagement".
It is closer to:
- did the physician reach the right information;
- did it arrive at the right moment;
- did it reduce work;
- was the reason understandable;
- was the task closed safely?

Treat this as conceptual inspiration, not UX evidence.

## Yann LeCun — autonomous intelligence architecture

Source:
https://openreview.net/pdf?id=BZ5a1r-kVsf

Useful architecture analogy:
separate:
- perception/context;
- world model/state;
- actor/proposals;
- critic/evaluation;
- cost/objective.

Product translation:
- context layer;
- candidate generator;
- ranker/composer;
- policy critic;
- utility/safety constraints.

Do not copy neuroscience/agent claims into user-facing product language.

## Netflix — GenRec, 2026

Source:
https://netflixtechblog.com/genrec-towards-llm-native-recommendation-at-netflix-f20be6f643e3

Transferable ideas:
- model ranking from user + history + current context;
- context engineering matters;
- optimize multi-objective long-term value rather than one short-term metric;
- LLM rankers need catalog constraints because unconstrained LLMs may hallucinate items and over-recommend popular content.

Healthcare adaptation:
- catalog = approved source/capability registry;
- utility = professional/clinical task value;
- hard safety and provenance gates precede ranking.

## Real-world recommender systems survey

Source:
https://arxiv.org/html/2509.06002v1

Use for:
- multi-stage retrieval/ranking;
- real-time constraints;
- offline + online evaluation distinction.

## Contextual bandits

Example:
https://www.nature.com/articles/s41598-025-89920-2

Use only for low-risk exploration:
- educational content;
- professional updates;
- source discovery.

Do NOT explore critical clinical actions using bandit logic.

## Google REGEN

Source:
https://research.google/blog/regen-empowering-personalized-recommendations-with-natural-language/

Useful direction:
natural language can express preference/context that clicks alone miss.

Product implication:
allow physicians to state:
"меньше фармы", "больше РКО", "показывай исследования только вечером", "на приёме только patient-specific".
