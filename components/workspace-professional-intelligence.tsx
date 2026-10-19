import { ArrowRight, BarChart3, ExternalLink, Globe2, MapPinned, Scale, Stethoscope, UsersRound } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { procedureBenchmarksForSpecialty, type ProcedureBenchmark } from "@/lib/ui/procedure-benchmarks";
import { professionalConsultationRoutesForSpecialty, type ProfessionalConsultationRoute } from "@/lib/ui/professional-consultation";
import { SectionHelp } from "@/components/section-help";

function evidenceLabel(item: ProcedureBenchmark): string {
  if (item.evidence === "modelled") return "Модельная оценка";
  if (item.evidence === "trend") return "Динамика";
  if (item.evidence === "treatment_mix") return "Структура лечения";
  return "Наблюдаемые данные";
}

function BenchmarkCard({ item }: { item: ProcedureBenchmark }) {
  return <a className="benchmark-card" href={item.sourceUrl} target="_blank" rel="noreferrer">
    <div className="benchmark-card-top"><span>{evidenceLabel(item)}</span><ExternalLink size={15} aria-hidden="true" /></div>
    <strong className="benchmark-value">{item.value}</strong>
    <h3>{item.label}</h3>
    <div className="benchmark-period">{item.period}</div>
    <p>{item.context}</p>
    <div className="benchmark-source">{item.source}</div>
  </a>;
}

export function ProcedureBenchmarks({ specialty }: { specialty: SpecialtyId }) {
  const items = procedureBenchmarksForSpecialty(specialty);
  const russia = items.filter(item => item.scope === "russia");
  const international = items.filter(item => item.scope === "international");

  return <section className="procedure-benchmarks" aria-labelledby="procedure-benchmarks-title">
    <div className="workspace-professional-head">
      <div className="workspace-professional-title"><span className="workspace-professional-icon"><BarChart3 size={21} aria-hidden="true" /></span><div><span className="eyebrow">Профессиональный контекст</span><div className="heading-with-help"><h2 id="procedure-benchmarks-title">Оперативная практика: Россия и мир</h2><SectionHelp text="Статистика помогает понимать масштаб и структуру практики. Показатели из разных источников могут иметь разные знаменатели и определения, поэтому мы не сводим их в ложный рейтинг стран или методов." /></div></div></div>
      <span className="workspace-professional-source-note"><Scale size={15} /> источник · период · единица</span>
    </div>

    <div className="benchmark-columns">
      <div className="benchmark-group">
        <div className="benchmark-group-head"><MapPinned size={18} aria-hidden="true" /><div><strong>Россия</strong><span>официальные и профессиональные источники</span></div></div>
        <div className="benchmark-grid">{russia.map(item => <BenchmarkCard key={item.id} item={item} />)}</div>
      </div>
      <div className="benchmark-group">
        <div className="benchmark-group-head"><Globe2 size={18} aria-hidden="true" /><div><strong>Международные данные</strong><span>регистры, атласы и модельные оценки</span></div></div>
        <div className="benchmark-grid">{international.map(item => <BenchmarkCard key={item.id} item={item} />)}</div>
      </div>
    </div>
    <p className="workspace-professional-footnote">Это популяционные и системные данные, а не ориентир для решения по конкретному пациенту. Перед сравнением показателей проверяйте единицу, период и определение вмешательства в первоисточнике.</p>
  </section>;
}

function routeKindLabel(route: ProfessionalConsultationRoute): string {
  if (route.kind === "formal_consilium") return "Формальная медицинская помощь";
  if (route.kind === "professional_discussion") return "Профессиональная дискуссия";
  return "Экспертное сообщество";
}

export function ProfessionalConsultationHub({ specialty, compact = false }: { specialty: SpecialtyId; compact?: boolean }) {
  const routes = professionalConsultationRoutesForSpecialty(specialty);
  const professionalRoutes = routes.filter(route => route.kind !== "formal_consilium");
  const formal = routes.find(route => route.kind === "formal_consilium");

  return <section className={compact ? "professional-consultation compact" : "professional-consultation"} aria-labelledby={`professional-consultation-${specialty}`}>
    <div className="workspace-professional-head">
      <div className="workspace-professional-title"><span className="workspace-professional-icon"><UsersRound size={21} aria-hidden="true" /></span><div><span className="eyebrow">Коллеги и эксперты</span><div className="heading-with-help"><h2 id={`professional-consultation-${specialty}`}>Обсудить с коллегами</h2><SectionHelp text="Здесь только профессиональные маршруты к экспертным группам и сообществам. Не передавайте через этот продукт медицинские данные пациента или клинический кейс с идентификаторами." /></div></div></div>
    </div>

    <div className="consult-route-grid">
      {professionalRoutes.map(route => <a className="consult-route-card" href={route.url} target="_blank" rel="noreferrer" key={route.id}>
        <div className="consult-route-icon"><Stethoscope size={20} aria-hidden="true" /></div>
        <span>{routeKindLabel(route)} · {route.provider}</span>
        <h3>{route.title}</h3>
        {!compact && <p>{route.description}</p>}
        <strong>{route.actionLabel} <ArrowRight size={14} aria-hidden="true" /></strong>
      </a>)}
    </div>

    {formal && <a className="formal-consilium-note" href={formal.url} target="_blank" rel="noreferrer">
      <div><span>Если нужен именно медицинский консилиум</span><strong>{formal.title}</strong><p>{formal.description}</p></div>
      <ExternalLink size={18} aria-hidden="true" />
    </a>}
  </section>;
}
