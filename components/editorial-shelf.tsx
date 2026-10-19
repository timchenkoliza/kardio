import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ContentObject, SpecialtyId } from "@/lib/domain/types";
import { EditorialContentCard, type EditorialPresentation } from "@/components/editorial-content-card";
import { SectionHelp } from "@/components/section-help";

export function EditorialShelf({
  eyebrow,
  title,
  help,
  items,
  specialty,
  presentation,
  href,
  hrefLabel,
}: {
  eyebrow: string;
  title: string;
  help: string;
  items: readonly ContentObject[];
  specialty: SpecialtyId;
  presentation: EditorialPresentation;
  href?: string;
  hrefLabel?: string;
}) {
  if (!items.length) return null;

  return <section className="editorial-shelf" data-presentation={presentation}>
    <div className="editorial-shelf-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <div className="heading-with-help"><h2>{title}</h2><SectionHelp text={help} /></div>
      </div>
      {href && <Link href={href}>{hrefLabel ?? "Все материалы"} <ArrowRight size={15} /></Link>}
    </div>
    <div className="editorial-shelf-grid">
      {items.map((item, index) => <EditorialContentCard key={item.id} content={item} specialty={specialty} presentation={presentation} position={index + 1} />)}
    </div>
  </section>;
}
