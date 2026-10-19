import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileText, HeartPulse, Pill, Stethoscope } from "lucide-react";
import { CARDIO_PARTNER_FORMATS, type CardioPartnerFormatKind } from "@/lib/demo/cardio-partner-formats";

const iconByKind: Record<CardioPartnerFormatKind, typeof Pill> = {
  rx_product_utility: Pill,
  rx_case_to_evidence: Stethoscope,
  hcp_tool: FileText,
  disease_education: HeartPulse,
  otc_hcp: BookOpenCheck,
};

const hrefByKind: Record<CardioPartnerFormatKind, string> = {
  rx_product_utility: "/cardiology?view=drugs",
  rx_case_to_evidence: "/cardiology?kind=clinical",
  hcp_tool: "/cardiology?view=tools",
  disease_education: "/cardiology?kind=article",
  otc_hcp: "/cardiology?view=drugs",
};

export function CardioPartnerFormats() {
  return <section className="cardio-partner-formats" aria-labelledby="cardio-partner-title">
    <header className="cardio-partner-formats-head">
      <div>
        <span className="eyebrow">Партнёрские форматы · демо</span>
        <h2 id="cardio-partner-title">Как фарма может работать внутри Кардиологии</h2>
        <p>Пять синтетических HCP-форматов. Реклама отделена от редакционного контента, бренд и спонсор всегда видны.</p>
      </div>
      <span className="cardio-partner-hcp">Только для профессионального сценария</span>
    </header>

    <div className="cardio-partner-format-grid">
      {CARDIO_PARTNER_FORMATS.map(item => {
        const Icon = iconByKind[item.kind];
        return <article className="cardio-partner-format-card" data-partner-kind={item.kind} key={item.id}>
          <div className="cardio-partner-format-meta">
            <span className="cardio-partner-format-icon"><Icon size={17} aria-hidden="true" /></span>
            <span>{item.eyebrow}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <div className="cardio-partner-format-brand">
            <span>{item.brand ?? item.sponsor}</span>
            {item.brand && <small>{item.sponsor}</small>}
          </div>
          <footer>
            <small>{item.disclosure}</small>
            <Link href={hrefByKind[item.kind]}>{item.cta}<ArrowRight size={14} /></Link>
          </footer>
        </article>;
      })}
    </div>

    <p className="cardio-partner-format-note">RX-карточки здесь показывают только механику интерфейса и используют вымышленные названия. Перед коммерческим запуском нужен отдельный legal gate по каналу размещения и содержанию.</p>
  </section>;
}
