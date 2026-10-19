# Professional context gate

Status: ACTIVE — source-backed workspace context

## Goal

Workspace should not be only a folder of saved material. It may also carry professional context that is useful before any personal state exists: procedure statistics and routes to professional peers. This context must remain population-level, source-backed and independent of patient data.

## Procedure statistics

Every metric shown in Workspace must include:

- specialty;
- geographic scope;
- value and unit or an explicit statement that the value is a share/trend/modelled estimate;
- period;
- evidence type;
- source name;
- direct source URL;
- a short semantic note preventing false comparison.

Do not automatically compare unlike metrics. A European per-million procedure rate is not directly comparable with a Russian absolute intervention count. A modelled surgical need is not a registry count. A treatment-method share is not the number of operations performed.

Current starter sources include ESC Atlas, Russian professional/official statistics, the Russian oncology statistical compendium and peer-reviewed global cancer-surgery modelling. These are curated snapshots, not a live clinical registry.

## Professional consultation

The product restores a first-class `Обсудить с коллегами` route in both Practice and Workspace.

Inside the product this means:

- find a professional society / expert group;
- open a verified professional community;
- follow a source-provided route for a professional question;
- do not upload or transmit identifiable patient data.

It does **not** mean that the product itself conducts a medical consilium.

A formal telemedicine consilium is medical care under the current Russian telemedicine procedure and is organised by a medical organisation. It can involve patient medical information. Because this product intentionally has no patient-data workflow, it offers only a clearly labelled external regulatory handoff for that case.

## GEN UI

Both blocks are typed and user-controllable:

- `benchmark_shelf` — procedure / system statistics;
- `expert_route` — professional peer and formal external routes.

They participate in the existing hide / less / pin / restore contract. Hiding them changes presentation only and never removes source data.

## Acceptance

- Cardiology and Oncology each have at least one Russian and one international procedure-context item;
- source URL, period and semantic context are present for every metric;
- modelled and treatment-mix data cannot masquerade as observed operation counts;
- both specialties have a visible professional discussion route;
- formal consilium remains an external boundary with no patient-data capture;
- communication and design-token lint remain green;
- no DB migration or ontology promotion occurs in this pass.
