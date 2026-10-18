# Gen-UI Workspace Model

## Product metaphor

Use the iPhone metaphor structurally, not visually.

### "Out of the box"
The product ships with a safe, useful default workspace.

For a cardiologist:

- Today
- Patient
- Evidence
- Tools
- Follow-up
- Sources

### "Home screens"
The physician can create their own screens.

Examples:
- "Утро"
- "ХСН"
- "Липиды"
- "Обучение"
- "Мои каналы"
- "Консилиум"

### "Widgets"
A screen is composed from typed modules.

### "App Library / App Store"
The physician can browse approved capabilities:
- source feeds;
- guideline sources;
- calculators;
- drug references;
- professional communities;
- experts;
- events;
- workflows;
- custom links.

### "Custom links"
The physician can add:
- a Telegram channel URL;
- a website;
- a saved search;
- a tool link.

External sources should not automatically receive clinical-trust status.

---

## Gen-UI is not arbitrary HTML generation

The model emits a validated `WorkspaceSpec`.

Renderer maps spec → approved components.

This prevents:
- layout drift;
- invented clinical UI;
- hidden unsafe actions;
- inconsistent provenance;
- broken mobile behavior.

---

## Example flow

User:

> Собери мне экран на утро: сначала пациенты, у которых появились новые результаты, затем РКО и два моих Telegram-канала. Калькулятор CHA₂DS₂-VASc держи под рукой, но не показывай новости фармы.

System:

1. parses intent;
2. resolves capabilities;
3. checks permissions/trust;
4. creates draft WorkspaceSpec;
5. previews the result;
6. explains what it added;
7. user confirms;
8. saves screen.

Never silently replace an existing user screen.

---

## Three ownership layers

### 1. System-owned
Critical safety/workflow modules.
Cannot be removed when clinically required.

### 2. User-owned
Pinned sources, custom views, layout, frequency, links.

### 3. AI-suggested
Temporary proposals.
Must be dismissible and explainable.

---

## Adaptive behavior

The workspace may adapt by:
- showing/hiding secondary modules;
- changing ordering;
- changing summary depth;
- moving content into a sheet on mobile;
- suggesting a new view.

It must not:
- silently change the user's permanent information architecture;
- move critical actions unpredictably;
- hide provenance;
- change medical truth based on preference.

---

## Telegram model

Treat Telegram as a source connector, not as trusted evidence by default.

A Telegram module needs:
- channel title;
- URL;
- specialty/topic labels;
- user-added vs registry-added status;
- trust status;
- last fetched;
- allowed surfaces;
- mute/frequency controls.

A post may be useful as:
- awareness signal;
- expert opinion;
- event/update signal.

It should not become clinical evidence without independent provenance.
