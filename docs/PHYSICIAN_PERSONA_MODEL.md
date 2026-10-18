# Physician Persona Model

Do not use stereotyped fictional personas. Specialty is a professional relevance signal, not a personality diagnosis.

## Professional identity

- primary specialty and subspecialties
- role
- care setting
- common patient cohorts
- jurisdiction and language

## Work style

Prefer explicit settings; infer only cautiously:

- `depth_preference`: quick / balanced / deep
- `interruptibility`: low / medium / high by workflow phase
- `novelty_appetite`: low / medium / high
- `format_preference`: text / visual / calculator / video / mixed
- `source_conservatism`: established-only / balanced / exploratory
- `workflow_automation`: low / medium / high

## Source relationship

For each source/capability model:

- followed / neutral / muted
- pinned
- manually added
- last used
- explicit trust preference
- show more / show less
- frequency

## Dynamic context

- current workflow phase
- active patient/case
- current task/question
- urgency
- available time
- device

## Inference contract

Every inferred preference must expose:

- value
- confidence
- evidence
- last updated time
- user-editable flag

The physician must be able to inspect and correct it.

## Cardiology seed

For prototyping only:

```json
{
  "specialty": "Кардиолог",
  "care_setting": "Амбулаторный приём",
  "depth_preference": "balanced",
  "interruptibility_in_visit": "low",
  "format_preference": ["compact_text", "trend", "calculator"],
  "source_conservatism": "balanced",
  "pinned_capabilities": ["clinical_guidelines", "drug_reference", "calculator"]
}
```

Do not infer age, gender, ideology, temperament or clinical competence.

## AI behavior

Personalization may alter timing, depth, module composition and source mix. It must not alter evidentiary standards, provenance requirements or clinical truth claims.
