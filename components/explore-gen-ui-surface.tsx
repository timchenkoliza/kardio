import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Library, Search } from "lucide-react";
import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { buildExploreComposition } from "@/lib/ui/explore-composition";
import { EditorialContentCard } from "@/components/editorial-content-card";
import { EditorialShelf } from "@/components/editorial-shelf";
import { GenUiStack, type GenUiBlock } from "@/components/gen-ui-stack";
import { SectionHelp } from "@/components/section-help";

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
      label: "Исследовать",
      kind: "topic_cluster",
      content: <aside className="context-module" aria-label="Быстрые маршруты"><span className="eyebrow">Куда дальше</span><div className="heading-with-help"><h2>Исследовать</h2><SectionHelp text="Быстрые маршруты в соседние разделы каталога. Они не меняют ваши сохранения и рабочий режим." /></div><div className="quick-job-list"><Link href={`/${specialty}?kind=guideline`}><BookOpen size={18} /><span><strong>Рекомендации</strong><small>Текущие версии и архив</small></span><ArrowRight size={16} /></Link><Link href={`/${specialty}?view=events`}><CalendarDays size={18} /><span><strong>События</strong><small>Только подтверждённые объекты каталога</small></span><ArrowRight size={16} /></Link><Link href={`/${specialty}?view=sources`}><Library size={18} /><span><strong>Источники</strong><small>{sources.length} в каталоге</small></span><ArrowRight size={16} /></Link></div></aside>,
    },
    ...(model.clinical.length ? [{
      id: "explore-clinical",
      label: "Клинические материалы",
      kind: "clinical_shelf" as const,
      content: <EditorialShelf eyebrow="Практика" title="Клинические материалы" help="Source-grounded клинические материалы из каталога. Изображение показывается только когда asset прошёл проверку прав и доступности." items={model.clinical} specialty={specialty} presentation="clinical" href={`/${specialty}?kind=clinical`} hrefLabel="Все клинические материалы" />,
    }] : []),
    ...(model.events.length ? [{
      id: "explore-events",
      label: "События",
      kind: "event_rail" as const,
      content: <EditorialShelf eyebrow="Календарь" title="События" help="Только события, уже присутствующие в каноническом каталоге. Положение блока не означает, что событие предстоящее." items={model.events} specialty={specialty} presentation="event" href={`/${specialty}?view=events`} hrefLabel="Все события" />,
    }] : []),
    ...(model.guidelines.length ? [{
      id: "explore-guidelines",
      label: "Клинические рекомендации",
      kind: "guideline_shelf" as const,
      content: <EditorialShelf eyebrow="Рекомендации" title="Текущие версии" help="Рекомендации отделены от статей и клинических материалов, чтобы версия и currentness не терялись в общей карточной ленте." items={model.guidelines} specialty={specialty} presentation="guideline" href={`/${specialty}?kind=guideline`} hrefLabel="Все рекомендации" />,
    }] : []),
    {
      id: "explore-search-prompt",
      label: "Поиск по теме",
      kind: "context_prompt",
      content: <aside className="context-module quiet-module"><Search size={20} aria-hidden="true" /><div className="heading-with-help"><h2>Ищите по теме</h2><SectionHelp text="Поиск учитывает заголовки, темы, источники и описания; результат остаётся объяснимым и детерминированным." /></div><p>Поиск работает по заголовкам, темам, источникам и описаниям. Результат остаётся объяснимым и детерминированным.</p></aside>,
    },
    ...(model.evidence.length ? [{
      id: "explore-evidence",
      label: "Исследования и статьи",
      kind: "evidence_shelf" as const,
      content: <EditorialShelf eyebrow="Доказательства" title="Исследования и статьи" help="Статьи и исследования ранжируются детерминированно по данным каталога; декоративная графика не считается клиническим изображением." items={model.evidence} specialty={specialty} presentation="evidence" href={`/${specialty}?kind=article`} hrefLabel="Все статьи" />,
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
      content: <EditorialShelf eyebrow="Каталог" title="Ещё материалы" help="Оставшиеся типы объектов показываются в резервной knowledge-полке без подмены их профессионального типа." items={model.overflow} specialty={specialty} presentation="standard" />,
    }] : []),
  ];

  return <GenUiStack specialty={specialty} shell="explore" blocks={blocks} />;
}
