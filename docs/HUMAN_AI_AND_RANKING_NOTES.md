# Human-AI + Ranking Research Notes

These are product inputs, not templates to copy.

## Microsoft — Guidelines for Human-AI Interaction

https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/

Translate into acceptance criteria:
- time AI services based on current context;
- show contextually relevant information;
- support efficient invocation, dismissal and correction;
- scope service when uncertain;
- explain why the system did what it did;
- learn from behavior and adapt cautiously;
- collect granular feedback;
- show consequences of user actions;
- provide global controls.

## Anthropic — Emotion concepts and their function

https://www.anthropic.com/research/emotion-concepts-function

Use for model-behavior governance: latent internal representations can causally shape behavior, so stable professional behavior needs evaluation rather than tone prompting alone.

Do not use this as evidence for emotional profiling of physicians.

## Anthropic — Persona vectors

https://www.anthropic.com/research/persona-vectors

Use to motivate monitoring for assistant-persona drift, sycophancy, hallucination and unjustified certainty.

## Yann LeCun — A Path Towards Autonomous Machine Intelligence

https://openreview.net/pdf?id=BZ5a1r-kVsf

Useful architecture analogy: separate context/state, world model, actor/proposals, critic/evaluation and objectives/costs.

Product translation: context layer → candidate generator → ranker/composer → policy critic → utility/safety constraints.

## Ilya Sutskever / Dwarkesh

https://www.dwarkesh.com/p/ilya-sutskever-2

Useful conceptual analogy: intermediate value signals. For Kardio the value function is professional utility and safe task completion, not engagement.

## Netflix — GenRec

https://netflixtechblog.com/genrec-towards-llm-native-recommendation-at-netflix-f20be6f643e3

Transferable ideas:
- user/history/current context for ranking;
- context engineering;
- catalog constraints;
- multi-objective long-term value.

Healthcare translation: catalog = approved source/capability registry; hard safety/provenance gates precede ranking.

## Google — REGEN

https://research.google/blog/regen-empowering-personalized-recommendations-with-natural-language/

Natural language can express preferences clicks miss. Example physician controls: `меньше фармы`, `больше РКО`, `исследования вечером`, `на приёме только patient-specific`.

## Contextual bandits

Use only for low-risk informational exploration such as education, professional updates and source discovery. Never use exploratory ranking policy for critical patient-specific decisions.
