# Physician Persona Model

## Do not use stereotyped personas

The product should not assume:
"cardiologist = older / conservative / research-heavy" or any similar stereotype.

Specialty is one signal, not personality.

## Model the physician as a state vector

### Professional identity
- primary specialty
- subspecialties
- role
- care setting
- common patient cohorts
- jurisdiction

### Work style — preferably explicit, otherwise inferred cautiously
- `depth_preference`: quick / balanced / deep
- `interruptibility`: low / medium / high
- `novelty_appetite`: low / medium / high
- `format_preference`: text / visual / calculator / video / mixed
- `source_conservatism`: established-only / balanced / exploratory
- `workflow_automation`: low / medium / high

### Source relationship
For every source:
- followed / neutral / muted
- pinned
- manually added
- last used
- save rate
- dismiss rate
- explicit trust
- explicit "show less/more"

### Learning state
- topics to learn
- planned education
- recent difficult cases converted into learning questions

### Current context
- current mode
- active case
- current task
- urgency
- time budget
- device

## Cardiology seed profile

Use this only as a prototype seed:

```json
{
  "specialty": "Кардиолог",
  "care_setting": "Амбулаторный приём",
  "depth_preference": "balanced",
  "interruptibility": "low_during_visit",
  "novelty_appetite": "balanced",
  "format_preference": ["compact_text", "trend", "calculator"],
  "source_conservatism": "balanced",
  "pinned_capabilities": ["guidelines", "drug_reference", "calculator"]
}
```

Do not infer age, gender, ideology, temperament, or clinical competence.

## Relationship to Anthropic persona/emotion research

The Anthropic work is relevant to **assistant behavior stability**, not as a license to psychologically profile physicians.

Product requirement:
- keep the assistant's professional behavior stable;
- evaluate sycophancy, overconfidence, hallucination and unjustified certainty;
- do not change clinical truth claims to match the user's preferred "personality";
- personalization changes timing, depth, modules, and source mix;
- safety/provenance standards stay invariant.
