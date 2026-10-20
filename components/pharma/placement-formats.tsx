/* eslint-disable @next/next/no-img-element -- local licensed illustrations */
import { BellRing, Bookmark, Building2, CalendarDays, Check, Download, Handshake, Headphones, Play } from "lucide-react";
import { EXAMPLE_DISCLOSURE, EXAMPLE_SPONSOR, PLACEMENT_FORMATS, type PlacementExample } from "@/lib/pharma/placement-formats";

function Disclosure() {
  return <p className="ws-format-disclosure"><Handshake size={13} aria-hidden="true" />{EXAMPLE_DISCLOSURE} · {EXAMPLE_SPONSOR}</p>;
}

function Example({ example }: { example: PlacementExample }) {
  switch (example.type) {
    case "article":
      return <article className="ws-format-card">
        <Disclosure />
        <img src={example.image} alt={example.imageAlt} loading="lazy" />
        <span className="ws-kind">{example.variant}</span>
        <h4>{example.title}</h4>
        <div className="ws-format-keypoints">
          <strong>Коротко о главном</strong>
          <ul>{example.keyPoints.map(point => <li key={point}>{point}</li>)}</ul>
        </div>
        <p className="ws-format-meta">{example.meta}</p>
      </article>;
    case "useful":
      return <article className="ws-format-card">
        <Disclosure />
        <span className="ws-kind">{example.variant}</span>
        <h4>{example.title}</h4>
        <ul className="ws-format-checklist">{example.items.map(item => <li key={item}><Check size={14} aria-hidden="true" />{item}</li>)}</ul>
        <div className="ws-format-actions">
          <span className="ws-button is-small"><Download size={14} aria-hidden="true" />{example.actions[0]}</span>
          <span className="ws-button is-small is-quiet"><Bookmark size={14} aria-hidden="true" />{example.actions[1]}</span>
        </div>
        <p className="ws-format-meta">Партнёр видит: {example.metrics.join(", ").toLocaleLowerCase("ru-RU")}</p>
      </article>;
    case "media":
      return <div className="ws-format-media">{example.items.map(item => <article key={item.title} className="ws-format-card is-media">
        <Disclosure />
        {item.image
          ? <div className="ws-format-player"><img src={item.image} alt={item.imageAlt ?? ""} loading="lazy" /><span className="ws-format-play" aria-hidden="true"><Play size={18} /></span></div>
          : <div className="ws-format-player is-audio" aria-hidden="true"><Headphones size={28} /></div>}
        <span className="ws-kind">{item.variant}</span>
        <h4>{item.title}</h4>
        <p className="ws-format-meta">{item.meta}</p>
      </article>)}</div>;
    case "event":
      return <article className="ws-format-card is-event">
        <Disclosure />
        <div className="ws-format-event">
          <div className="ws-date-block" aria-hidden="true"><strong>{example.date.split(" ")[0]}</strong><span>{example.date.split(" ")[1]?.slice(0, 3)}</span></div>
          <div>
            <span className="ws-kind">{example.variant}</span>
            <h4>{example.title}</h4>
            <p className="ws-format-meta"><CalendarDays size={13} aria-hidden="true" />{example.date} · {example.time} · {example.place}</p>
            <p className="ws-format-meta"><BellRing size={13} aria-hidden="true" />Напомним: {example.reminders.join(" и ").toLocaleLowerCase("ru-RU")} до начала</p>
          </div>
        </div>
        <div className="ws-format-actions"><span className="ws-button is-small is-accent">{example.registration}</span></div>
      </article>;
    case "brand_page":
      return <article className="ws-format-card is-brand">
        <div className="ws-format-brand-head">
          <span className="ws-format-logo" aria-hidden="true"><Building2 size={20} /></span>
          <div><h4>{example.company}</h4><p className="ws-format-meta">{example.about} · пример</p></div>
        </div>
        <ul className="ws-format-brand-sections">{example.sections.map(section => <li key={section.title}><strong>{section.title}</strong><span>{section.text}</span></li>)}</ul>
      </article>;
  }
}

export function PlacementFormats() {
  return <section className="ws-section" aria-labelledby="formats-title">
    <div className="ws-section-head">
      <div>
        <h2 id="formats-title" className="ws-section-title">Форматы размещения в Ленте</h2>
        <p className="ws-muted">Так материалы выглядят у врача. Примеры условные: компания и материалы вымышлены.</p>
      </div>
    </div>
    <ol className="ws-formats">{PLACEMENT_FORMATS.map(format => <li key={format.id} className="ws-format">
      <div className="ws-format-copy">
        <h3><span>{format.number}</span>{format.name}</h3>
        <p className="ws-format-kinds">{format.kinds.join(" · ")}</p>
        <ul>{format.value.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
      <Example example={format.example} />
    </li>)}</ol>
  </section>;
}
