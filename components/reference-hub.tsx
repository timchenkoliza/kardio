import Link from "next/link";
import { Calculator, ExternalLink, Image as ImageIcon, Pill, SearchCheck } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { curatedSourcesForSurface } from "@/lib/ui/curated-external-tools";

function categoryIcon(category: string) {
  if (category === "Визуализация") return <ImageIcon size={23} />;
  if (category === "Калькуляторы") return <Calculator size={23} />;
  if (category === "Лекарства") return <Pill size={23} />;
  return <SearchCheck size={23} />;
}

export function ReferenceHub({ specialty }: { specialty: SpecialtyId }) {
  const sources = curatedSourcesForSurface(specialty, "reference");
  const drugReferences = sources.filter(source => source.id === "vidal" || source.category === "Взаимодействия");
  const otherReferences = sources.filter(source => !drugReferences.some(item => item.id === source.id));

  return <div className="reference-hub">
    <header className="tools-intro">
      <span className="eyebrow">{specialty === "cardiology" ? "Кардиология" : "Онкология"}</span>
      <h1>Справочник</h1>
      <p>Лекарства, взаимодействия и рабочие инструменты из текущего каталога и реестра источников.</p>
    </header>

    <section className="reference-section" aria-labelledby="reference-native-title">
      <div className="reference-section-head">
        <div><span className="eyebrow">В продукте</span><h2 id="reference-native-title">Рабочие инструменты</h2></div>
      </div>
      <div className="reference-grid reference-native-grid">
        <Link href={`/${specialty}?view=tools`} className="reference-card reference-card-native">
          <div className="reference-card-icon"><Calculator size={24} /></div>
          <span>Шкалы</span>
          <strong>{specialty === "cardiology" ? "CHA₂DS₂-VA и HAS-BLED" : "Калькуляторы"}</strong>
          <p>{specialty === "cardiology" ? "Два локальных кардиологических инструмента." : "Внешние инструменты специальности из реестра источников."}</p>
        </Link>
        <Link href={`/${specialty}?view=imaging`} className="reference-card reference-card-native">
          <div className="reference-card-icon"><ImageIcon size={24} /></div>
          <span>Изображения</span>
          <strong>Визуализация</strong>
          <p>3D-анатомия и локальный просмотр обезличенных или учебных изображений.</p>
        </Link>
      </div>
    </section>

    {drugReferences.length > 0 && <section className="reference-section" aria-labelledby="reference-drugs-title">
      <div className="reference-section-head">
        <div><span className="eyebrow">Внешние ресурсы</span><h2 id="reference-drugs-title">Лекарства и взаимодействия</h2></div>
      </div>
      <div className="reference-grid">
        {drugReferences.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="reference-card">
          <div className="reference-card-icon">{categoryIcon(source.category)}</div>
          <span>{source.category}</span>
          <strong>{source.name}</strong>
          <p>{source.note}</p>
          <ExternalLink size={17} />
        </a>)}
      </div>
    </section>}

    {otherReferences.length > 0 && <section className="reference-section" aria-labelledby="reference-other-title">
      <div className="reference-section-head">
        <div><span className="eyebrow">Референсы</span><h2 id="reference-other-title">Дополнительные инструменты</h2></div>
      </div>
      <div className="reference-grid">
        {otherReferences.map(source => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="reference-card">
          <div className="reference-card-icon">{categoryIcon(source.category)}</div>
          <span>{source.category}</span>
          <strong>{source.name}</strong>
          <p>{source.note}</p>
          <ExternalLink size={17} />
        </a>)}
      </div>
    </section>}

    <p className="tools-footnote">Внешние ресурсы открываются отдельно и не становятся каноническими объектами онтологии автоматически.</p>
  </div>;
}
