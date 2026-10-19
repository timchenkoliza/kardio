# Product Copy ToV v2

Source basis: Yandex general ToV, Yandex Lavka ToV and the internal instruction-quality rubric provided in the product workstream.

## Three core principles

1. **Do not lie.** Do not invent capabilities, overstate evidence, distort facts or hide important limitations. Links, statuses, dates, product capabilities and medical claims must be literally true.
2. **Make it clear.** The reader should understand the main point on a fast scan. Information matters more than decoration. Use the professional vocabulary of the intended audience, but avoid internal slang, unexplained terms and pseudo-professional jargon.
3. **Keep it human.** Write like a competent person speaking to another person: direct, polite, alive and concise. Avoid bureaucracy, inflated wording and robotic filler.

## Product voice

The product is calm, useful and tactful. It can suggest a next step but does not decide for the doctor. It gives facts, context and options; the doctor chooses what to do next.

- Address the user as `вы` with a lowercase letter
- Prefer facts to evaluations
- Prefer active verbs and ordinary Russian to abstract nouns and office language
- Do not praise the product inside the interface
- Do not call something `лучшее`, `удобное`, `важное` or `полезное` unless there is a concrete reason the user needs that evaluation
- Do not expose implementation words such as `alpha`, `resolver`, `pipeline`, `deterministic`, `staging`, `layer`
- Be neutral around sensitive topics; no jokes or playful tone when the context is clinical, safety-related or emotionally charged
- Respect competitors and external professional services; describe differences without disparagement

## Medical adaptation

Medical precision outranks playfulness.

- Do not infer a diagnosis, urgency, expected benefit or patient state from weak signals
- Do not present prototype copy as a validated recommendation
- If evidence is incomplete, say so directly
- If a source, date, rights status or clinical status is unknown, do not silently replace the missing fact with confident copy
- Privacy and safety boundaries appear at the moment they matter, not as repetitive warnings across the product
- Separate observation, interpretation and suggested next action when they can be confused
- Use professional medical terminology when it is normal for the physician audience; explain only terms that may be ambiguous in the current context

## Headings

A heading should help the doctor find the needed item without reading the body.

- Put the main job or change in the heading
- Keep the editorial part after the topic short; target 2–6 words where possible
- Avoid abstract headings such as `Актуальная информация`, `Важное`, `Полезное`, `Другие материалы`
- Do not add a heading when the block is already unambiguous
- No terminal period in headings or buttons

Preferred patterns:

- `Артериальная гипертензия — что изменилось`
- `Фибрилляция предсердий — красные флаги`
- `Сердечная недостаточность — что проверить на приёме`
- `Рак лёгкого — когда нужна эскалация`

## Paragraphs and blocks

One block = one job.

- Start with the main point
- Use short paragraphs
- Split different thoughts into different blocks
- Use `Описание` and `Решение` only when that structure genuinely helps the task
- Highlight only the few words the user needs to scan; do not build pages out of bold, colored warnings and labels
- Move rationale and implementation details into contextual help when they are not needed for the immediate action

## Lists

Use a list when the reader needs to scan several parallel items or follow a sequence.

- Use numbered lists for an ordered procedure
- Use bullets for parallel facts or options
- Add one short introductory sentence when the list needs context
- Keep items grammatically parallel
- Do not create a list for 1–2 sentences that read better as prose

## Tables

Use a table when the user needs to compare the same attributes across several objects.

Do not use a table when:
- the content is sequential rather than comparative
- cells become long paragraphs
- there are many columns but very few rows
- the same information is easier to scan as cards or a short list

## Links

A link label should say what opens.

- Link a short meaningful phrase rather than a raw URL
- Keep required prepositions inside the linked phrase when natural in Russian
- Do not overload a block with several links that answer the same job
- A broken or misleading link is a release-blocking copy defect
- Knowledge/source references may remain explicit when product provenance requires the source to be visible

## Tone of calls to action

Help, do not command.

Prefer:
- `Добавить сводку`
- `Выбрать файл`
- `Открыть рекомендации`
- `С кем обсудить`
- `Перейти к консилиуму`

Avoid:
- `Вы обязаны`
- `Немедленно сделайте`
- `Вам необходимо` when a direct factual formulation works

## Typography and language

- Use Russian angle quotes: `«...»`
- Distinguish hyphen and dash
- Use `вы` with a lowercase letter
- Use `ё` where normal Russian spelling requires it; do not mechanically replace it with `е`
- Do not leave a period at the end of headings, buttons or short list items
- Keep list items grammatically parallel
- Prefer digits when they are easier to scan in a professional interface
- Avoid double spaces and inconsistent punctuation

## Sensitive and restricted information

- Do not surface NDA or internal-only details in user-facing text
- Mark internal material explicitly in internal documentation
- For sensitive clinical or privacy cases, state the concrete limitation and safe next action without drama
- Do not use humor around money, health risk, death, severe illness or other high-stakes topics

## Product examples

Prefer:
- `Материалы по теме`
- `Из истории ПБЗ`
- `Добавить сводку`
- `В файле нет строк пациентов и идентификаторов`
- `С кем обсудить`
- `Каталог пока пуст`
- `Рекомендации обновились`
- `Источник не указан`

Avoid:
- `Агент по теме — что изучить дальше`
- `Подхватили профессиональные интересы из ПБЗ`
- `Агрегированный контекст`
- `Эксперты без выдуманных имён`
- `Следующий слой`
- default badges such as `Актуально`, `Надёжно`, `Проверено` when they do not change a decision

## Release checklist

Before shipping a string, check:

- Is every factual statement supportable?
- Is the main idea visible without reading the full block?
- Can the heading be shorter without losing specificity?
- Is the text written for the physician rather than for the implementation team?
- Is there an unsupported evaluation or promise?
- Are terminology and naming consistent with the rest of the product?
- Does the structure need prose, a list, a table or no extra formatting at all?
- Is a safety/privacy exception visible exactly where the user needs it?
- Can one sentence be removed without losing meaning?
- Does the text sound like a competent person rather than a template?
