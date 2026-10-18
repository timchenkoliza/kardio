import { ExternalLink, Pill, SearchCheck } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { curatedSourcesForSpecialty } from "@/lib/ui/curated-external-tools";

export function ReferenceHub({ specialty }: { specialty: SpecialtyId }) {
  const sources = curatedSourcesForSpecialty(specialty).filter(source => ["vidal", "drugs-interactions", "medscape-interactions"].includes(source.id));
  return <div className="reference-hub">
    <header className="tools-intro"><span className="eyebrow">{specialty === "cardiology" ? "Кардиология" : "Онкология"}</span><h1>Справочник</h1><p>Быстрый вход в лекарственные справочники и проверку взаимодействий.</p></header>
    <div className="reference-grid">{sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="reference-card"><div className="reference-card-icon">{source.id === "vidal" ? <Pill size={24} /> : <SearchCheck size={24} />}</div><span className="eyebrow">{source.category}</span><strong>{source.name}</strong><p>{source.note}</p><ExternalLink size={17} /></a>)}</div>
  </div>;
}
