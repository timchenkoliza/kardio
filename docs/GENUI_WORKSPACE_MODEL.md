# Gen-UI Workspace Model

## Product metaphor

Use the iPhone metaphor structurally, not visually.

### Out of the box
The product ships with safe useful defaults, e.g. Today, Patient, Evidence, Tools, Follow-up and Sources.

### Home screens
The physician may create screens such as Morning, Heart Failure, Lipids, Learning, My Channels or Consilium.

### Widgets
Screens are composed from typed modules.

### Capability Library
The physician can add approved source feeds, guideline sources, calculators, drug references, professional communities, experts, events, workflows and custom links.

### Custom links
A physician may add a Telegram channel, website, saved search or tool URL. An external source does not automatically receive clinical-trust status.

## Gen-UI is not arbitrary HTML

The model produces a validated `WorkspaceSpec`; the renderer maps that spec to approved components.

This prevents layout drift, invented high-stakes UI, hidden unsafe actions, inconsistent provenance and broken responsive behavior.

## Ownership

### System-owned
Critical workflow and safety modules. They cannot disappear when clinically required.

### User-owned
Pinned sources, custom views, layout, frequency and links.

### AI-suggested
Temporary proposals. Must be explainable and dismissible.

## Adaptation

The workspace may adapt ordering, summary depth, secondary module visibility and responsive placement.

It must not silently change the user's permanent IA, unpredictably move critical actions, hide provenance or change medical truth based on preference.

## Example

User: `Собери мне экран на утро: сначала пациенты, у которых появились новые результаты, затем РКО и два моих Telegram-канала. Калькулятор CHA₂DS₂-VASc держи под рукой, но не показывай новости фармы.`

System:

1. parses the intent;
2. resolves approved capabilities;
3. checks permissions/trust;
4. creates a draft WorkspaceSpec;
5. previews the result and explains changes;
6. user confirms;
7. saves the screen.

Never silently replace an existing user screen.

## Telegram

Treat Telegram as a source connector, not trusted clinical evidence by default. Model channel URL, specialty/topic labels, user-added status, trust status, freshness, allowed surfaces and mute/frequency controls.
