import { BookOpen, CalendarDays, ExternalLink, GraduationCap, Microscope, ShieldCheck } from "lucide-react";
import { GenUiStack, type GenUiBlock } from "@/components/gen-ui-stack";
import { SectionHelp } from "@/components/section-help";
import { oncologyStarterByKind, type OncologyStarterItem, type OncologyStarterKind } from "@/lib/ui/oncology-starter";

export type OncologyStarterFocus = "all" | OncologyStarterKind;

const blockMeta: Record<OncologyStarterKind, { label: string; eyebrow: string; title: string; icon: React.ReactNode; blockKind: GenUiBlock["kind"] }> = {
  guideline: { label: "Клинические рекомендации", eyebrow: "Рекомендации", title: "Клинические рекомендации", icon: <BookOpen size={21} />, blockKind: "guideline_shelf" },
  clinical: { label: "Клинические материалы", eyebrow: "Практика", title: "Протоколы и поддерживающая терапия", icon: <ShieldCheck size={21} />, blockKind: "clinical_shelf" },
  evidence: { label: "Международные обновления", eyebrow: "Обновления", title: "Международные рекомендации", icon: <Microscope size={21} />, blockKind: "evidence_shelf" },
  learning: { label: "Обучение", eyebrow: "Учиться", title: "Образовательные материалы", icon: <GraduationCap size={21} />, blockKind: "learning_shelf" },
  event: { label: "События", eyebrow: "Календарь", title: "Профессиональные события", icon: <CalendarDays size={21} />, blockKind: "event_rail" },
};

function ExternalShelf({ kind, items }: { kind: OncologyStarterKind; items: OncologyStarterItem[] }) {
  const meta = blockMeta[kind];
  return <section className={`oncology-starter-shelf oncology-starter-${kind}`}>
    <div className="oncology-starter-head">
      <div className="oncology-starter-icon" aria-hidden="true">{meta.icon}</div>
      <div><span className="eyebrow">{meta.eyebrow}</span><div className="heading-with-help"><h2>{meta.title}</h2><SectionHelp text="Карточки ведут напрямую на профессиональные первоисточники. Они не считаются материалами внутреннего каталога до отдельной проверки и загрузки." /></div></div>
    </div>
    <div className="oncology-starter-grid">
      {items.map(item => <a className="oncology-starter-card" key={item.id} href={item.url} target="_blank" rel="noreferrer">
        <div className="oncology-starter-card-meta"><span>{item.source}</span><span>{item.dateLabel}</span></div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <div className="oncology-starter-card-footer"><span>{item.sourceLabel}</span><ExternalLink size={16} aria-hidden="true" /></div>
      </a>)}
    </div>
  </section>;
}

export function OncologyStarterSurface({ focus = "all" }: { focus?: OncologyStarterFocus }) {
  const order: OncologyStarterKind[] = ["guideline", "clinical", "evidence", "event", "learning"];
  const kinds = focus === "all" ? order : [focus];
  const blocks: GenUiBlock[] = kinds.flatMap(kind => {
    const items = oncologyStarterByKind(kind);
    if (!items.length) return [];
    return [{
      id: `oncology-starter-${kind}`,
      label: blockMeta[kind].label,
      kind: blockMeta[kind].blockKind,
      content: <ExternalShelf kind={kind} items={items} />,
    }];
  });

  return <div className="oncology-starter">
    <section className="oncology-starter-intro">
      <div><span className="eyebrow">Онкология · профессиональный стартовый слой</span><h2>Первичные источники вместо пустого раздела</h2><p>Пока собственный онкологический каталог проходит отдельную подготовку, здесь собраны проверенные точки входа в рекомендации, протоколы, обновления, обучение и события. Кардиологический контент не переиспользуется.</p></div>
      <div className="oncology-starter-proof"><ShieldCheck size={18} /><span>Внешняя навигация<br /><strong>без персональных назначений</strong></span></div>
    </section>
    <GenUiStack specialty="oncology" shell="explore" blocks={blocks} />
  </div>;
}
