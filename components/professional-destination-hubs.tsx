import Link from "next/link";
import { ArrowRight, CalendarDays, ExternalLink, FileCheck2, Landmark, ShieldCheck } from "lucide-react";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { canonicalEventContent } from "@/lib/ui/content-completeness";
import { curatedSourcesForSurface } from "@/lib/ui/curated-external-tools";
import { deterministicContentOrder } from "@/lib/ui/feed";
import { specialtyLabel } from "@/lib/ui/labels";

function publicationLabel(item: ContentObject): string | null {
  if (item.publicationDate) {
    const date = new Date(`${item.publicationDate}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }
  return item.publicationYear ? String(item.publicationYear) : null;
}

export function EventsHub({ specialty, content }: { specialty: SpecialtyId; content: readonly ContentObject[] }) {
  const events = canonicalEventContent(content).sort(deterministicContentOrder);
  const externalEventSources = curatedSourcesForSurface(specialty, "events").filter(source => source.id !== "russco");
  const hasExternalStart = events.length === 0 && externalEventSources.length > 0;

  return <div className="destination-hub events-hub">
    <header className="destination-intro">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]}</span>
        <h1>События</h1>
        <p>{hasExternalStart ? "Пока собственный каталог событий готовится, раздел ведёт на календарь и страницы организаторов. Даты и статус проверяйте в первоисточнике." : "Только события, для которых уже есть подтверждённая карточка и источник. Ссылки без проверенной структуры и дат сюда не подмешиваются."}</p>
      </div>
      <div className="destination-proof"><ShieldCheck size={18} /><span>{hasExternalStart ? <><strong>{externalEventSources.length}</strong> внешних первоисточника</> : <><strong>{events.length}</strong> подтверждено в каталоге</>}</span></div>
    </header>

    {events.length ? <div className="event-catalog">
      {events.map((item, index) => <article className={index === 0 ? "event-object featured" : "event-object"} key={item.id}>
        <div className="event-object-mark"><CalendarDays size={22} /></div>
        <div className="event-object-copy">
          <span className="eyebrow">{item.source.name}</span>
          <h2>{item.title}</h2>
          {item.summary && <p>{item.summary}</p>}
          <div className="event-object-meta">
            {publicationLabel(item) && <span>Материал опубликован: {publicationLabel(item)}</span>}
            {item.currentness === "archived" && <span>Архив</span>}
            {item.currentness === "review" && <span>Проверяем актуальность</span>}
          </div>
        </div>
        <Link className="event-object-action" href={`/${specialty}/content/${encodeURIComponent(item.id)}`} aria-label={`Открыть: ${item.title}`}><ArrowRight size={18} /></Link>
      </article>)}
    </div> : hasExternalStart ? <div className="event-catalog external-event-catalog">
      {externalEventSources.map((source, index) => <a className={index === 0 ? "event-object featured external-event-object" : "event-object external-event-object"} key={source.id} href={source.url} target="_blank" rel="noreferrer">
        <div className="event-object-mark"><CalendarDays size={22} /></div>
        <div className="event-object-copy"><span className="eyebrow">{source.category}</span><h2>{source.name}</h2><p>{source.note}</p><div className="event-object-meta"><span>Внешний профессиональный источник</span></div></div>
        <span className="event-object-action" aria-hidden="true"><ExternalLink size={18} /></span>
      </a>)}
      <p className="tools-footnote">Внешние страницы не становятся событиями внутреннего каталога без отдельной проверки даты, идентичности мероприятия и источника.</p>
    </div> : <section className="destination-cold-start">
      <CalendarDays size={26} />
      <span className="eyebrow">Пока без подстановок</span>
      <h2>Подтверждённых событий ещё нет</h2>
      <p>Раздел заполнится только после проверки источника, идентичности события и доступных дат. Мы не превращаем любую ссылку на мероприятие в событие автоматически.</p>
    </section>}
  </div>;
}

export function VmpHub({ specialty }: { specialty: SpecialtyId }) {
  const sources = curatedSourcesForSurface(specialty, "referral");
  const program = sources.find(source => source.id === "vmp-program-2026");
  const explainer = sources.find(source => source.id === "vmp-minzdrav-explainer");

  return <div className="destination-hub vmp-hub">
    <header className="destination-intro">
      <div>
        <span className="eyebrow">{specialtyLabel[specialty]} · ВМП</span>
        <h1>Высокотехнологичная медицинская помощь</h1>
        <p>Официальные документы и профессиональная навигация по ВМП. Раздел не определяет показания и не заменяет решение врача или врачебной комиссии.</p>
      </div>
      <div className="destination-proof official"><Landmark size={18} /><span>Только официальные источники</span></div>
    </header>

    <section className="vmp-primary-grid" aria-label="Основные документы по ВМП">
      {program && <a className="vmp-primary-card" href={program.url} target="_blank" rel="noreferrer">
        <div className="vmp-card-icon"><FileCheck2 size={24} /></div>
        <span className="eyebrow">Официальный перечень · 2026</span>
        <h2>Программа государственных гарантий</h2>
        <p>{program.note}</p>
        <span className="vmp-card-link">Открыть документ <ExternalLink size={15} /></span>
      </a>}
      {explainer && <a className="vmp-primary-card secondary" href={explainer.url} target="_blank" rel="noreferrer">
        <div className="vmp-card-icon"><Landmark size={24} /></div>
        <span className="eyebrow">Минздрав России</span>
        <h2>Как устроена ВМП</h2>
        <p>{explainer.note}</p>
        <span className="vmp-card-link">Открыть справку <ExternalLink size={15} /></span>
      </a>}
    </section>

    <section className="vmp-usage" aria-labelledby="vmp-usage-title">
      <span className="eyebrow">Рабочий сценарий</span>
      <h2 id="vmp-usage-title">Проверить официальный контекст</h2>
      <div className="vmp-steps">
        <div><strong>1</strong><span>Открыть перечень ВМП на текущий год.</span></div>
        <div><strong>2</strong><span>Найти профиль, вид помощи и метод лечения в первоисточнике.</span></div>
        <div><strong>3</strong><span>Перейти к действующим локальным правилам и маршрутизации вне этого прототипа.</span></div>
      </div>
      <p className="tools-footnote">Продукт не хранит данные пациента и не определяет право на ВМП. Раздел помогает перейти к официальным профессиональным источникам.</p>
    </section>
  </div>;
}
