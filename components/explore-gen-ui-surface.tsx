import Link from "next/link";
import { ArrowRight, BookOpen, Calculator, CalendarDays, ScanLine, Search } from "lucide-react";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { buildExploreComposition } from "@/lib/ui/explore-composition";
import { EditorialContentCard } from "@/components/editorial-content-card";
import { EditorialShelf } from "@/components/editorial-shelf";
import { GenUiStack, type GenUiBlock } from "@/components/gen-ui-stack";

export function ExploreGenUiSurface({ specialty, content, sources }: { specialty: SpecialtyId; content: ContentObject[]; sources: Source[] }) {
  const model = buildExploreComposition(content);
  const blocks: GenUiBlock[] = [
    ...(model.lead ? [{
      id: "explore-featured",
      label: "Главный материал",
      kind: "hero_knowledge" as const,
      content: <section className="editorial-feed gen-ui-editorial-hero" aria-label="Главный материал"><EditorialContentCard content={model.lead} specialty={specialty} featured presentation="hero" position={1} /></section>,
    }] : []),
    {
      id: "explore-routes",
      label: "Быстрый доступ",
      kind: "topic_cluster",
      content: <aside className="context-module explore-route-module" aria-label="Быстрый доступ" data-source-count={sources.length}><span className="eyebrow">Быстрый доступ</span><div className="quick-job-list"><Link href={`/${specialty}?kind=guideline`}><BookOpen size={17} /><strong>Рекомендации</strong><ArrowRight size={15} /></Link><Link href={`/${specialty}?view=tools`}><Calculator size={17} /><strong>Калькуляторы</strong><ArrowRight size={15} /></Link><Link href={`/${specialty}?view=imaging`}><ScanLine size={17} /><strong>Визуализация</strong><ArrowRight size={15} /></Link><Link href={`/${specialty}?view=events`}><CalendarDays size={17} /><strong>События</strong><ArrowRight size={15} /></Link></div></aside>,
    },
    ...(model.clinical.length ? [{
      id: "explore-clinical",
      label: "Клинические материалы",
      kind: "clinical_shelf" as const,
      content: <EditorialShelf eyebrow="Практика" title="Клинические материалы" help="Клинические материалы из каталога с явным первоисточником. Изображение показывается только после проверки прав и доступности." items={model.clinical} specialty={specialty} presentation="clinical" href={`/${specialty}?kind=clinical`} hrefLabel="Все клинические материалы" />,
    }] : []),
    ...(model.events.length ? [{
      id: "explore-events",
      label: "События",
      kind: "event_rail" as const,
      content: <EditorialShelf eyebrow="Календарь" title="События" help="Только события, уже присутствующие в каталоге. Положение блока не означает, что мероприятие ещё не прошло." items={model.events} specialty={specialty} presentation="event" href={`/${specialty}?view=events`} hrefLabel="Все события" />,
    }] : []),
    ...(model.guidelines.length ? [{
      id: "explore-guidelines",
      label: "Клинические рекомендации",
      kind: "guideline_shelf" as const,
      content: <EditorialShelf eyebrow="Рекомендации" title="Текущие версии" help="Рекомендации отделены от статей и клинических материалов, чтобы статус и версия документа оставались видимыми." items={model.guidelines} specialty={specialty} presentation="guideline" href={`/${specialty}?kind=guideline`} hrefLabel="Все рекомендации" />,
    }] : []),
    {
      id: "explore-search-prompt",
      label: "Поиск по теме",
      kind: "context_prompt",
      content: <aside className="context-module explore-search-entry"><Search size={20} aria-hidden="true" /><div><h2>Поиск по теме</h2><p>Введите тему, рекомендацию или вопрос в строке сверху.</p></div></aside>,
    },
    ...(model.evidence.length ? [{
      id: "explore-evidence",
      label: "Исследования и статьи",
      kind: "evidence_shelf" as const,
      content: <EditorialShelf eyebrow="Доказательства" title="Исследования и статьи" help="Статьи и исследования отделены от рекомендаций и клинических материалов. Декоративная графика не выдаётся за клиническое изображение." items={model.evidence} specialty={specialty} presentation="evidence" href={`/${specialty}?kind=article`} hrefLabel="Все статьи" />,
    }] : []),
    ...(model.learning.length ? [{
      id: "explore-learning",
      label: "Обучение",
      kind: "learning_shelf" as const,
      content: <EditorialShelf eyebrow="Обучение" title="Видео и лекции" help="Образовательные материалы остаются отдельной полкой и не смешиваются с рекомендациями или клиническими случаями." items={model.learning} specialty={specialty} presentation="learning" href={`/${specialty}/education`} hrefLabel="Всё обучение" />,
    }] : []),
    ...(model.overflow.length ? [{
      id: "explore-more",
      label: "Ещё из каталога",
      kind: "knowledge_shelf" as const,
      content: <EditorialShelf eyebrow="Каталог" title="Ещё материалы" help="Оставшиеся типы объектов показываются отдельно, без подмены их профессионального типа." items={model.overflow} specialty={specialty} presentation="standard" />,
    }] : []),
  ];

  return <GenUiStack specialty={specialty} shell="explore" blocks={blocks} />;
}
