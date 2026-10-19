import { GenUiStack, type GenUiBlock } from "@/components/gen-ui-stack";
import { WorkspaceCaseSurface } from "@/components/workspace-case-surface";
import { WorkspaceGenUiSurface } from "@/components/shell-gen-ui-surfaces";
import type { ContentObject, Source, SpecialtyId, UserState } from "@/lib/domain/types";
import { specialtyLabel } from "@/lib/ui/labels";

export function WorkspaceIntegratedSurface({
  specialty,
  content,
  sources,
  state,
  recent,
  contextTerms,
}: {
  specialty: SpecialtyId;
  content: ContentObject[];
  sources: Source[];
  state: UserState;
  recent: ContentObject[];
  contextTerms: string[];
}) {
  const blocks: GenUiBlock[] = [
    {
      id: "workspace-clinical-case",
      label: "Клинические кейсы и безопасный AI",
      kind: "assistant_entry",
      content: <WorkspaceCaseSurface specialty={specialty} recent={recent} contextTerms={contextTerms} />,
    },
    {
      id: "workspace-professional-layer",
      label: "Профессиональный контекст и личный слой",
      kind: "benchmark_shelf",
      content: <WorkspaceGenUiSurface specialty={specialty} content={content} sources={sources} state={state} />,
    },
  ];

  return <div className="workspace-integrated-surface">
    <section className="mode-hero workspace-hero" aria-labelledby="workspace-integrated-title">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]} · Рабочее пространство</span>
        <h1 id="workspace-integrated-title">Ваши материалы и контекст</h1>
        <p>Здесь нет автоматической подгрузки расписания из МИС и нет доступа к ЭМК. Врач сам добавляет только тот контекст, с которым хочет работать: материалы, обезличиваемый клинический кейс, сохранения, подборки, профессиональные темы и историю.</p>
      </div>
      <div className="mode-stats" aria-label="Как использовать рабочее пространство">
        <span><strong>1</strong> добавьте нужный контекст</span>
        <span><strong>2</strong> обсудите с AI или коллегами</span>
        <span><strong>⋯</strong> закрепляйте и скрывайте блоки</span>
      </div>
    </section>
    <GenUiStack specialty={specialty} shell="workspace" blocks={blocks} />
  </div>;
}
