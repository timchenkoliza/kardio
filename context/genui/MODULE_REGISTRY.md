# Module Registry — v0

| Module | Primary job | Typical modes | Patient-specific | Default |
|---|---|---|---:|---:|
| `today_queue` | decide attention order | workflow | yes | yes |
| `patient_brief` | reconstruct context | workflow | yes | yes |
| `patient_delta` | see longitudinal change | workflow | yes | yes |
| `evidence_answer` | answer with provenance | pull/deep | maybe | yes |
| `guideline_update` | see relevant change | push/deep | no | yes |
| `source_feed` | follow professional source | push | no | optional |
| `telegram_channel` | follow chosen channel | push/social | no | user |
| `expert` | access named expert | social | no | optional |
| `calculator` | compute | utility/pull | maybe | yes |
| `drug_reference` | verify medication | pull | maybe | yes |
| `result_review` | interpret new result | workflow | yes | yes |
| `therapy_safety` | check plan | workflow/pull | yes | yes |
| `ambient_note` | draft documentation | workflow | yes | yes |
| `task_list` | close loop | workflow | yes | yes |
| `event` | professional event | push/learn | no | optional |
| `learning_item` | close skill gap | learn | no | optional |
| `custom_link` | user-defined access | any | no | user |

Each module must define:
- input data schema;
- source/provenance UI;
- empty/loading/error states;
- allowed actions;
- safety class;
- mobile fallback;
- analytics events.
