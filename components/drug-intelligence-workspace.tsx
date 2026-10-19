"use client";

import { useState } from "react";
import { ArrowRight, Check, MessageSquareText, Search } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { drugDemoData, hasDisplayableAggregate, ratingDimensionLabel, sortDrugs, type RatingDimension } from "@/lib/ui/drug-intelligence";

const DIMENSIONS: RatingDimension[] = ["overall", "efficacy", "safety", "tolerability", "accessibility", "adherence"];
const SCORE_DIMENSIONS: RatingDimension[] = ["efficacy", "safety", "tolerability", "accessibility", "adherence"];
const STORAGE_KEY = "kardio.drugRatings.v1";

type MyRating = Partial<Record<RatingDimension, number | null>> & { comment?: string; indication?: string };

function readStored(): Record<string, MyRating> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
}

export function DrugIntelligenceWorkspace({ specialty }: { specialty: SpecialtyId }) {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<RatingDimension>("overall");
  const [selectedId, setSelectedId] = useState(drugDemoData[0]?.id ?? "");
  const [myRatings, setMyRatings] = useState<Record<string, MyRating>>(readStored);
  const [savedNotice, setSavedNotice] = useState(false);
  const selected = drugDemoData.find(drug => drug.id === selectedId) ?? drugDemoData[0];
  const indication = selected?.indications[0] ?? "";
  const rankingIndication = indication || drugDemoData[0]?.indications[0] || "";
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const visible = sortDrugs(drugDemoData, rankingIndication, sortBy).filter(drug => !normalizedQuery || `${drug.tradeName} ${drug.inn}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery));

  if (specialty !== "cardiology") {
    return <section className="decision-workspace"><span className="eyebrow">Онкология · препараты</span><h1>Оценка препаратов</h1><p className="decision-lede">Для онкологии пока нет проверенного собственного набора оценок. Инструмент не подменяет этот пробел кардиологическими данными.</p></section>;
  }

  if (!selected) return null;
  const aggregate = selected.ratingsByIndication[indication];
  const displayable = hasDisplayableAggregate(aggregate);
  const stored = myRatings[selected.id] ?? {};

  function setMyScore(dimension: RatingDimension, value: number | null) {
    setSavedNotice(false);
    setMyRatings(current => ({ ...current, [selected.id]: { ...current[selected.id], indication, [dimension]: value } }));
  }

  function saveRating() {
    const next = { ...myRatings, [selected.id]: { ...myRatings[selected.id], indication } };
    setMyRatings(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSavedNotice(true);
  }

  const consiliumHref = `/${specialty}?view=consilium&drug=${encodeURIComponent(selected.id)}&indication=${encodeURIComponent(indication)}`;

  return <section className="decision-workspace drug-workspace" aria-labelledby="drug-workspace-title">
    <header className="decision-header">
      <div><span className="eyebrow">Кардиология · решение по препарату</span><h1 id="drug-workspace-title">Препараты</h1><p className="decision-lede">Сравнение по показанию, разбор профиля оценок и собственная оценка врача. Численные рейтинги ниже — синтетические демо-данные.</p></div>
      <span className="synthetic-note">Демо-данные · синтетические оценки</span>
    </header>

    <div className="drug-discovery-bar">
      <label className="drug-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Найти препарат</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Название или МНН" /></label>
      <label className="drug-sort">Сортировать<select value={sortBy} onChange={event => setSortBy(event.target.value as RatingDimension)}>{DIMENSIONS.map(dimension => <option value={dimension} key={dimension}>{ratingDimensionLabel[dimension]}</option>)}</select></label>
    </div>

    <div className="drug-grid">
      <section className="drug-list" aria-label="Сравнение препаратов">
        <div className="decision-section-head"><div><span className="eyebrow">{rankingIndication}</span><h2>Сравнение</h2></div><span>{visible.length} препарата</span></div>
        {visible.map(drug => {
          const itemAggregate = drug.ratingsByIndication[rankingIndication];
          const itemDisplayable = hasDisplayableAggregate(itemAggregate);
          return <button key={drug.id} className={`drug-row ${selected.id === drug.id ? "active" : ""}`} onClick={() => { setSelectedId(drug.id); setSavedNotice(false); }}>
            <span><strong>{drug.tradeName}</strong><small>{drug.inn}</small></span>
            <span className="drug-row-score">{itemDisplayable ? itemAggregate[sortBy].toFixed(1) : "—"}<small>{itemDisplayable ? `${itemAggregate.ratingCount} оценок` : `ещё ${5 - itemAggregate.ratingCount} до агрегата`}</small></span>
          </button>;
        })}
      </section>

      <section className="drug-detail" aria-label="Карточка препарата">
        <div className="drug-identity"><span className="eyebrow">{selected.drugClass}</span><h2>{selected.tradeName}</h2><p>{selected.inn}</p><strong className="drug-indication">{indication}</strong></div>
        {displayable ? <div className="rating-profile">{SCORE_DIMENSIONS.map(dimension => <div className="rating-row" key={dimension}><span>{ratingDimensionLabel[dimension]}</span><div className="rating-track"><i style={{ width: `${aggregate[dimension] * 20}%` }} /></div><strong>{aggregate[dimension].toFixed(1)}</strong></div>)}</div> : <div className="insufficient-state"><strong>Пока недостаточно оценок</strong><span>Ещё {Math.max(0, 5 - aggregate.ratingCount)} оценка до агрегированного результата.</span></div>}
        <div className="peer-comment"><span className="eyebrow">Комментарий в демо-наборе</span><p>{aggregate.comments[0] ?? "Комментариев пока нет."}</p></div>
        <a className="primary-button decision-consilium-link" href={consiliumHref}><MessageSquareText size={17} /> Обсудить с консилиумом <ArrowRight size={16} /></a>
      </section>
    </div>

    <section className="my-rating" aria-labelledby="my-rating-title">
      <div className="decision-section-head"><div><span className="eyebrow">Локально в этом браузере</span><h2 id="my-rating-title">Моя оценка</h2></div><span>не попадает в Golden Set</span></div>
      <div className="my-rating-grid">{SCORE_DIMENSIONS.map(dimension => <fieldset key={dimension}><legend>{ratingDimensionLabel[dimension]}</legend><div className="score-buttons">{[1,2,3,4,5].map(value => <button type="button" className={stored[dimension] === value ? "selected" : ""} key={value} onClick={() => setMyScore(dimension, value)}>{value}</button>)}<button type="button" className={stored[dimension] === null ? "selected" : ""} onClick={() => setMyScore(dimension, null)}>—</button></div></fieldset>)}</div>
      <label className="rating-comment">Комментарий<textarea value={stored.comment ?? ""} onChange={event => { setSavedNotice(false); setMyRatings(current => ({ ...current, [selected.id]: { ...current[selected.id], comment: event.target.value, indication } })); }} placeholder="Необязательно" maxLength={600} /></label>
      <button className="primary-button" type="button" onClick={saveRating}><Check size={16} /> Сохранить мою оценку</button>
      {savedNotice && <p className="success-text" role="status">Оценка сохранена в этом браузере.</p>}
    </section>
  </section>;
}
