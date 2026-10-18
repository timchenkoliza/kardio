# Product Copy ToV v1

Source basis: the editorial guidance provided for Yandex Lavka / Yandex product communications in the prototype workstream.

## Core rule

The interface should feel trustworthy before it explains why it is trustworthy. Normal states stay quiet; exceptions, limitations and required actions are explicit.

## Writing principles

1. **Main point first.** A heading should explain what the user can do or what changed. Context comes after it.
2. **Short is good when the meaning is complete.** Do not lengthen interface copy just to sound helpful.
3. **Use living, direct Russian.** Prefer active verbs and ordinary speech. Avoid bureaucracy, abstract nouns and implementation jargon.
4. **Facts instead of evaluations.** Do not decide for the user that something is useful, convenient, best or important. Show the fact and let the user decide.
5. **Help, do not command.** Calls to action should sound like a clear next step, not an order or universal prescription.
6. **Do not expose internal implementation language.** `alpha`, `layer`, `resolver`, `deterministic ranking`, `staging`, `verified pipeline` and similar wording belong in help/debug/docs, not the primary UI.
7. **Trust is implicit; exceptions are explicit.** Do not label every normal object `Актуально`, `Проверено`, `Надёжно`. Surface `Проверяем`, `Есть новая версия`, `Архив` only when the state changes the user's decision.
8. **One thought per surface.** If a block needs several paragraphs to explain itself, move rationale into contextual help or split the workflow.
9. **Buttons are short and unambiguous.** Prefer `Добавить`, `Выбрать файл`, `Все рекомендации`, `Мои материалы`. No terminal period.
10. **Use `вы` with a lowercase letter** in ordinary product communication.
11. **Use professional titles carefully.** Call someone an expert only when the product has an explicit, confirmed basis for that status. Otherwise use `врач`, `специалист`, or the person's verified role.
12. **Keep terminology consistent per product surface.** A concept should have one name unless a user-facing distinction is intentional.

## Medical product adaptation

- Medical precision outranks playfulness.
- Friendly does not mean casual about clinical information.
- Do not infer patient context, diagnosis, benefit or urgency from weak signals.
- When a safety or privacy boundary matters, say it plainly at the moment of action rather than repeating it across the whole screen.
- Explain recommendation logic in contextual help; the default surface should show the result and the next action.

## UI examples

Prefer:
- `Материалы по теме`
- `Из истории ПБЗ`
- `Добавить сводку`
- `В файле нет строк пациентов и идентификаторов`
- `С кем обсудить`
- `Каталог пока пуст`

Avoid:
- `Агент по теме — что изучить дальше`
- `Подхватили профессиональные интересы из ПБЗ`
- `Агрегированный контекст`
- `Эксперты без выдуманных имён`
- `Следующий слой`
- default badges such as `Актуально`

## Copy review checklist

Before shipping a string, check:

- Can it be understood on a fast scan?
- Is the main idea in the heading?
- Is any sentence explaining the implementation rather than helping the user act?
- Is there an unsupported evaluation or promise?
- Can one line be removed without losing meaning?
- Is the term consistent with the rest of the product?
- Does an exception need to be visible, or can normal state remain quiet?
