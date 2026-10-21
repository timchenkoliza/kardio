Calm, evidence-first medical AI workspace for professional and health-related decision support.

The system should feel precise, quiet and trustworthy rather than expressive or decorative. Information is the primary visual object; UI chrome stays in the background. Use whitespace, hierarchy and restrained neutral surfaces to make complex medical information easy to scan.

The canonical desktop shell is a 1360 × 800 frame (`shell-width`) built around a 280 px navigation sidebar (`sidebar-width`) and a centred 700 px conversation rail (`rail-width`) inside the main workspace. The AI experience behaves more like a professional document than a messenger: user input is contained; assistant knowledge is presented directly on the canvas.

Purple is functional, not decorative. Neutral surfaces establish hierarchy; the accent identifies a primary action, selection, focus or explicit state.

Medical provenance is part of the interface, not footnote decoration. Evidence should progressively disclose from inline citation → source preview → source detail without overwhelming the answer.

When extending the system, reuse existing visual grammar before inventing a new pattern. New functionality should look inevitable within the product, not like a feature imported from another application.

## Principles

- **Content before chrome.** Medical information must dominate the screen; interface decoration stays quiet.
- **User input is contained; expert output is a document.** Do not put assistant answers inside large chat bubbles or cards.
- **One accent, one meaning.** Use purple for action, selection, focus and active state — never as ambient decoration.
- **Neutral surfaces carry structure.** Prefer white, off-white and #F2F2F2 over borders, gradients and heavy elevation.
- **Reveal complexity progressively.** Start with the answer; expose tools, evidence and detail only when needed.
- **Evidence must remain traceable.** Sources, calculations and generated interpretation must never visually collapse into the same thing.
- **Density follows the job.** Conversation can breathe; calculators and professional tools may be denser without changing the visual language.
- **One concept, one component.** The same calculator, source, action or message keeps the same anatomy across chat, panels and mobile.
- **State is functional, not decorative.** Every colour, shadow, badge and surface change must communicate an interaction or semantic state.
- **Do not invent visual vocabulary locally.** Extend tokens and semantic components instead of introducing one-off colours, radii or card styles.

## Content fundamentals

Product copy is Russian, written for clinicians: plain, specific and source-aware.

«Тексты в Яндексе» (Texts section) is the base for every Yandex Med text: «Не врать», «Понятно», «Больше жизни» and its reference rules. The Yandex 360 guides add what the base does not cover — interface formats (Interface texts section) and tone (Voice section). Where the two disagree, Yandex Med follows the decisions below. The rules a screen hits most often:

- **Name the service** «Яндекс Мед»: no quotes, two words, capitalised; «Я.Мед» or «Мед» only where the guidelines allow a short form (icon captions, after the full name in long texts).
- **Interface text is in the third person**; the first person belongs to the user («Мои материалы», «Я забыл пароль»). Buttons and controls are the user's replies, never a question in the second person.
- **Every error says what happened and what to do next.** Never «Обнаружена неизвестная ошибка».
- **Full stops.** None after headings, buttons, menu items, list items, toasts or one-sentence hints. Multi-sentence prose — assistant answers, result interpretations, legal text — is a document and keeps normal punctuation, final stop included. Section and button names go without quotes in UI and in quotes in running text.
- **Typography:** «ёлочки», „лапки“ inside. Ranges of numbers, times and numeric dates take an en dash without spaces (10–15 дней, 14:00–15:00, 3,5–5,5 ммоль/л); ranges with words take an em dash with spaces (18 авг. — 27 сент.). Non-breaking spaces after one- to three-letter words, before a dash and between a number and its unit (`12_кг`, `75_%`). Numbers from five digits go in groups of three joined by a narrow no-break space, U+202F (32 472); four-digit numbers stay solid (3450). A decimal comma (25,123).
- **Dates and time:** 21 марта 2014 года or 21.03.2014 in text; 13:30 for a time; 2 ч 20 мин for a duration. In calendars, tables and chart axes, months and weekdays shorten without dots: янв, февр, март, апр, май, июнь, июль, авг, сент, окт, нояб, дек; пн, вт, ср, чт, пт, сб, вс. In running text, write them in full. Phones: +7 495 123-45-67.
- **Figures shown to users name their source and period** and are revisited when they age.
- **Tone follows the situation** (Voice section): calm and transparent in descriptions, hints, irreversible actions, failures, money and personal data — in a medical product that covers every clinical statement; a little creativity only in empty states, success screens, onboarding and while the user waits.
- **Interface formats** — headings, buttons, errors, empty states, success screens, inputs, switches, toasts — follow the Interface texts section; where it differs from the base guide, the rules above win.
- **Person first.** Name the person before the condition: «слабослышащий человек», «человек с особенностями слуха»; never «глухонемой», «страдает глухотой», «инвалид» (Hearing section).

- **Sentence case everywhere** — headings, buttons, tabs: «Клинические рекомендации», «Открыть кейс», «Все клинические материалы». No Title Case, no ALL CAPS except the `micro` status marker («ДЕМО»).
- **Address the reader as «вы», lowercase**, and only when it helps: «Порядок блоков строится… по вашим настройкам интерфейса, без данных пациента.»
- **Name the source and its status.** «Клинические материалы из каталога с явным первоисточником.» «Рекомендации РКО · 2024». Say when something requires checking («требуют проверки») rather than hiding it.
- **Join metadata with a middle dot** `·`: «Рекомендации РКО · Клинический материал», «Партнёрский формат · синтетический пример».
- **Label anything that is not editorial.** Partner and demo content always says so in words: «Партнёрские форматы · демо», «При поддержке партнёра · без бренда препарата». Advertising is separated from editorial content; the sponsor is always visible.
- **Buttons are verbs** in the infinitive or imperative: «Посмотреть формат», «Разобрать тему», «Закрепить выше», «Показывать реже», «Скрыть этот блок».
- **No emoji** and no exclamation marks in product UI.

## Color

Use tokens semantically. Do not select a colour, radius or spacing value merely because it visually fits an isolated screen.

- **Surfaces.** `canvas` is the content ground — the conversation rail and assistant answers sit directly on it. `structural` is quiet chrome such as the sidebar. `surface` (#F2F2F2) is contained interaction: composer, selected sidebar row, chips, the user-message surface. Do not use a border where surface contrast is sufficient.
- **Text.** Three tiers: `text` for primary content, `text-secondary` for supporting content, `text-tertiary` only for non-critical metadata, placeholders and tertiary labels.
- **Accent.** `accent` (#7275FF) is the one interactive colour: primary action, selection, focus, active state. Accent-coloured text below 24 px uses `accent-ink`. `accent-soft` and `accent-wash` tint a selected or featured object; the single primary card in a group may sit on `accent-wash` with an `accent-soft` border. `accent-brand` (#898BFF) belongs to the mark and illustration fills, not to controls.
- **States.** `danger`, `warning` and `success` (each with a `-soft` ground) appear only when the state requires them, and never replace a written status or interpretation. `danger` and `success` differ in hue, not lightness — the label or icon is what tells them apart.
- **Content kinds.** Guideline, article, video, clinical material and event each have an `art-<kind>-bg / -1 / -2 / -ink` set for cover art and kind tags. Colour may identify a source kind locally; provenance stays visually quieter than the medical answer.
- **Inverse and overlay.** Tooltips use `inverse-surface` with `inverse-text`. Mobile backdrops use `overlay`; the active content above stays fully legible.

## Typography

Product UI is set in **YS Text Regular** through the `sans` family. It is the most universal face of the Yandex type family and is recognised as the brand's own; when in doubt, use it, or ask a brand designer. Keep a small, functional hierarchy with high legibility and restrained weight contrast: 400 for reading, 600 for labels and headings, 700 only for display sizes.

- Page and detail titles: `display-xl` (one per page) or `display-lg` for a feed or tool hero. Large display sizes carry negative tracking as specified.
- Structure: `heading-1` for a featured card, `heading-2` for sections and dialogs, `heading-3` for panels, `title` for cards and results.
- Reading: `body` for answers and descriptions; `body-compact` inside dense tools and calculators.
- Controls and small text: `label` for buttons, tabs and form labels; `caption` for supporting copy; `metadata` for dates and source lines; `micro`, uppercase, only for status markers over media.

The rest of the family has its own family token, used only where a designer has chosen it — never as a substitute inside product UI: `text-cond` (YS Text Cond, narrow), `text-wide` (YS Text Wide, wide), `display` (YS Display, display), `geo` (YS Geo, geometric grotesque), `serif` (Yandex Sans Serif, display serif), `logotype` (YS Logotype, service logos only — see Logo). The full family, the legal terms and the file formats are in the Fonts section.

Line height is never below 1.2 and no text is smaller than 11 px. On iOS, choose the Dynamic Type text style by the role of the text, not by its size (Dynamic type section).

Do not introduce decorative serif faces, oversized marketing display typography or excessive bolding into product surfaces.

## Spacing and layout

4 px base grid, 8 px as the normal interaction rhythm: `space-4`, `space-8`, `space-12`, `space-16`, `space-20`, `space-24`, `space-32`, `space-40`, `space-48`.

- `space-4`–`space-8` for icon/text and tightly related controls
- `space-8`–`space-12` inside professional tools
- `space-16` as default component padding
- `space-20`–`space-24` between related sections
- `space-32`–`space-48` for major composition boundaries

Whitespace is part of hierarchy. Do not compress the conversation interface merely to fit more content above the fold.

Canonical desktop geometry: shell `shell-width` × 800; sidebar `sidebar-width`; workspace `workspace-width`; centred conversation rail `rail-width`; sidebar row `nav-row-width` × `nav-row-height`; composer `rail-width` × `composer-height`; send control `send-size`; suggestion chips `chip-height` high. Do not stretch the conversation rail simply because the viewport is wider.

## Radius, borders and elevation

Do not apply one universal radius to every component. `radius-tag` for tags and feed tabs; `radius-button` for the shell, sidebar rows, compact controls and buttons; `radius-chip` for suggestion chips; `radius-card` for cards inside an answer or feed; `radius-composer` for the composer only; `radius-panel` for dialogs, featured cards and media viewers; `radius-round` for genuinely circular controls only.

Prefer a surface shift to a line. When a hairline is needed, `border` at low opacity. Shadows mark interaction and layering: `shadow-subtle` for resting cards, `shadow-raised` on hover and for popovers, `shadow-floating` for drawers, dialogs and bottom sheets. No gradients on UI surfaces.

## Iconography

Icons are Lucide, inlined as SVG: 24 × 24 viewBox, `stroke-width` 2, round caps and joins, `fill="none"`, `stroke="currentColor"`, so an icon takes the colour of its text token. Render at 14–20 px beside text (15 px and 17 px are the most common sizes), `aria-hidden="true"` when a label is present. Interactive icons get a hit target of at least `touch-target` on touch. Typical glyphs: `search`, `file-text`, `calculator`, `pill`, `stethoscope`, `heart-pulse`, `library`, `calendar-days`, `book-open-check`, `circle-alert`, `arrow-up-right`, `x`. No emoji as icons.

## Logo

The mark is a pixel-built heart in a disc of `accent-brand`, paired with the wordmark: «Яндекс Мед» in Russian, «Yandex Med» in English. While the product is in beta, use the lockup with the β superscript. Use the lockups and favicons exactly as supplied in the Logos assets — black wordmark on light grounds, white on dark — and never retype the wordmark or redraw the mark. The app icon is the white heart on an `accent-brand` rounded square.

The text part of a Yandex service logo is set in YS Logotype (`logotype`). Use it nowhere else — not in headings, not in UI. In co-branding, never set the partner's name in the logotype face.

## Using components

Build screens from semantic product components, not generic visual containers. Preferred component families:

- **Shell** — AppShell, ConversationSidebar, SidebarNavItem, ConversationHistoryItem, AccountFooter
- **Conversation** — ChatThread, UserTurn, AssistantTurn, ResponseActions, FollowUpSuggestions
- **Composer** — ChatComposer, ResponseModeSelector, ToolAction, VoiceAction, SendButton
- **Evidence** — CitationInline, SourceCluster, SourcePopover, SourceItem, SourceDrawer, SourcePreview
- **Professional tools** — ToolRail, Calculator, CalculatorField, CalculatorResult, ClinicalInterpretation, EvidenceFooter
- **Feedback** — LikeAction, DislikeAction, FeedbackPopover, RatingControl
- **Overlay** — Tooltip, Popover, Drawer, Backdrop, BottomSheet, Alert, Toast

Use components according to their semantic job. Do not create GrayCard, PurpleButton, LeftBlock or other appearance-based substitutes when a semantic component already exists.

### Components that are easy to misuse

- **AssistantTurn.** Never wrap the entire assistant response in a large grey card or messenger bubble. Assistant output belongs directly on `canvas`. Cards (`radius-card`) may exist inside an answer for a tool, result, source or distinct interactive object.
- **Source components.** Do not turn citations into bright badges or large colourful source cards. Default evidence disclosure is inline evidence → compact source cluster → popover → detail drawer. Colour may identify a source or state locally, but provenance stays visually quieter than the medical answer.
- **ChatComposer.** Keep the composer aligned to the 700 px rail (`rail-width`), on `surface` with `radius-composer`. It is a primary conversational surface, not a generic text input and not a full-width page footer.
- **Primary action.** Use `accent` for the primary action only (min height `touch-target`, `radius-button`, `label` text). Secondary actions stay neutral on `surface`.

On mobile, do not shrink desktop panels. Substitute the interaction pattern: desktop popovers and drawers become bottom sheets or full-screen detail surfaces where appropriate.

On mobile, follow the Navigation section: a full **screen** for a section of the app, with a back arrow and right-to-left transitions; a **sheet** (BottomSheet) for a short task tied to the current context, one at a time; an **Alert** only for a critical or irreversible action the user must answer; a **Toast** for information that needs no action.

Every service page carries the copyright notice in its footer, as the Copyright section specifies.

## Accessibility

Use accessible hierarchy without making the product visually heavy.

**Guaranteed text/background pairings**

- `text` on `canvas`, `structural` or `surface` for primary content (11–12:1)
- `text-secondary` on `canvas` or `structural` for supporting content (5.1–5.2:1)
- `accent-ink` on `canvas`, `surface` or `accent-wash` for accent-coloured text (4.6–5.2:1)
- `danger`, `warning`, `success` on `canvas` or their own `-soft` ground (4.9–6.6:1)
- `text-tertiary` only for non-critical metadata, placeholders and tertiary labels — it is 2.8:1 on `canvas`. Never use it for medical conclusions, instructions, validation errors, source titles or required form labels.

Known gap: a white label on an `accent` fill is 3.68:1, below 4.5:1 for 14–16 px text. It is the source pairing and is kept; do not add more white-on-accent text than the primary button label.

**Focus.** Interactive keyboard focus must be visibly persistent: a 2 px solid `focus-ring` outline, offset 2 px (3.7:1 on `canvas`, 3.3:1 on `surface`), optionally with the `shadow-focus` halo. Focus must not be represented by colour change alone.

**Interaction targets.** The visible icon may be 16–24 px, but the interactive hit target is at least `touch-target` (44 × 44 px) on touch interfaces.

**Text scaling.** Desktop text survives 200% browser zoom without loss of content; mobile apps follow the system font size without breaking — on iOS through Dynamic Type text styles (Dynamic type section).

**Screen readers and keyboard.** Every element exposes its label, type and state; focus order is logical and lands on the screen title or the back control on a new screen; new information — loading, errors, notifications — is announced. The full checklist with WCAG 2.2 references is in the Accessibility section.

**Never rely on colour alone.** Risk, error, success, selection and clinical interpretation always include another signal: a text label, an icon, a shape, a position or explicit state copy. A red result also says what the risk state is. A selected option remains identifiable without seeing purple. A validation error contains a written explanation.

## Medical content

Do not visually imply that:

- an AI interpretation is a deterministic calculation;
- a score is itself a clinical decision;
- a generated statement is equivalent to a cited source.

Keep calculation, interpretation, limitations and provenance distinguishable.

## Motion and overlays

Do not use motion as the only signal that content changed. Keep overlay hierarchy predictable: tooltip < popover < drawer < modal. Mobile backdrops may dim the underlying UI with `overlay`, but the active content must remain fully legible.
