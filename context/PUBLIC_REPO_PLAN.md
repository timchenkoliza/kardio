# Public GitHub Plan

Repository: `timchenkoliza/kardio`

Because the repository is public, do NOT commit:
- raw physician research;
- raw interview data;
- patient data;
- internal/private source annotations;
- private Telegram exports.

Safe to commit:
- synthetic fixtures;
- schemas;
- design/product contracts;
- public source examples already referenced by URL;
- standalone interaction prototype;
- README.

Suggested layout:

```text
/
  README.md
  prototype/
    kardio_genui_workspace_lab.html
  docs/
    KNOWLEDGE_ARCHITECTURE.md
    PHYSICIAN_PERSONA_MODEL.md
    RANKING_POLICY.md
    GENUI_WORKSPACE_MODEL.md
    HUMAN_AI_AND_RANKING_NOTES.md
  schemas/
    workspace-spec.schema.json
    physician-profile.schema.json
  data/
    cardiology-source-demo.json
  private-data/   # gitignored
```
