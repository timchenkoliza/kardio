import Link from "next/link";
import { ArrowRight, BookOpen, Calculator, ExternalLink, ScanLine, SearchCheck } from "lucide-react";
import { GenUiStack, type GenUiBlock } from "@/components/gen-ui-stack";
import { SectionHelp } from "@/components/section-help";
import { oncologyStarterByKind, type OncologyStarterItem } from "@/lib/ui/oncology-starter";

function ExternalRows({ items }: { items: readonly OncologyStarterItem[] }) {
  return <div className="oncology-practice-rows">{items.map(item => <a className="oncology-practice-row" key={item.id} href={item.url} target="_blank" rel="noreferrer">
    <span className="mode-content-mark" aria-hidden="true">{item.source.slice(0, 1).toLocaleUpperCase("ru-RU")}</span>
    <span className="oncology-practice-row-copy"><small>{item.source} · {item.dateLabel}</small><strong>{item.title}</strong><span>{item.summary}</span></span>
    <ExternalLink size={16} aria-hidden="true" />
  </a>)}</div>;
}

export function OncologyPracticeSurface() {
  const guidelines = oncologyStarterByKind("guideline");
  const clinical = oncologyStarterByKind("clinical");
  const blocks: GenUiBlock[] = [
    {
      id: "oncology-practice-launcher",
      label: "Быстрые инструменты",
      kind: "tool_shelf",
      content: <section className="practice-launcher" aria-label="Рабочие задачи онколога">
        <Link href="/oncology?kind=guideline"><BookOpen size={22} /><span><strong>Рекомендации</strong><small>Профессиональные первоисточники</small></span><ArrowRight size={17} /></Link>
        <Link href="/oncology?view=reference"><SearchCheck size={22} /><span><strong>Справочник</strong><small>Протоколы, лекарства и взаимодействия</small></span><ArrowRight size={17} /></Link>
        <Link href="/oncology?view=tools"><Calculator size={22} /><span><strong>Калькуляторы</strong><small>Внешние инструменты с проверкой методологии</small></span><ArrowRight size={17} /></Link>
        <Link href="/oncology?view=imaging"><ScanLine size={22} /><span><strong>Визуализация</strong><small>Локальный просмотр и 3D-слот</small></span><ArrowRight size={17} /></Link>
      </section>,
    },
    {
      id: "oncology-practice-guidelines",
      label: "Рекомендации",
      kind: "guideline_shelf",
      content: <section className="practice-primary" aria-labelledby="oncology-practice-guidelines-title"><div className="mode-section-heading"><div><span className="eyebrow">Первоисточники</span><div className="heading-with-help"><h2 id="oncology-practice-guidelines-title">Рекомендации</h2><SectionHelp text="Пока внутренний онкологический каталог готовится, здесь показаны прямые переходы к профессиональным источникам. Это не персональные назначения." /></div></div><Link href="/oncology?kind=guideline">Открыть раздел <ArrowRight size={15} /></Link></div><ExternalRows items={guidelines} /></section>,
    },
    {
      id: "oncology-practice-clinical",
      label: "Протоколы и поддерживающая терапия",
      kind: "clinical_shelf",
      content: <section className="practice-tools" aria-labelledby="oncology-practice-clinical-title"><div className="mode-section-heading"><div><span className="eyebrow">Практика</span><div className="heading-with-help"><h2 id="oncology-practice-clinical-title">Протоколы и поддерживающая терапия</h2><SectionHelp text="Материалы открываются в первоисточнике. Состав схем, показания, дозы и ограничения необходимо проверять в актуальной версии источника и клиническом контексте." /></div></div></div><ExternalRows items={clinical} /></section>,
    },
    {
      id: "oncology-practice-personal",
      label: "Мои материалы",
      kind: "saved_shelf",
      content: <aside className="practice-personal"><span className="eyebrow">Личное</span><div className="heading-with-help"><h2>Мои материалы</h2><SectionHelp text="Здесь появляются только материалы, которые вы сами сохранили. Внешние рекомендации не добавляются автоматически." /></div><p className="muted">Сохранения и подборки остаются вашим личным слоем.</p><Link className="secondary-button practice-saved-link" href="/oncology?view=saved">Открыть мои материалы</Link></aside>,
    },
  ];

  return <div className="practice-home oncology-practice-home">
    <section className="mode-hero practice-hero" aria-labelledby="oncology-practice-title"><div><span className="eyebrow">Онкология · Практика</span><div className="heading-with-help"><h1 id="oncology-practice-title">Рабочий стол онколога</h1><SectionHelp text="Практика даёт быстрые профессиональные маршруты. Пока собственный онкологический каталог не загружен, рекомендации и протоколы открываются в явных первоисточниках." /></div><p>Рекомендации, протоколы, справочные инструменты и визуализация — без подмены источника и без персональных клинических решений.</p></div></section>
    <GenUiStack specialty="oncology" shell="practice" blocks={blocks} />
    <p className="mode-footnote">Внешний источник остаётся внешним. Материал станет частью внутреннего каталога только после отдельной проверки и загрузки.</p>
  </div>;
}
