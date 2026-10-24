"use client";

import { useMemo, useRef, useState } from "react";
import { FileSearch, Loader2, MessageSquareText, X } from "lucide-react";
import { FollowupJobButton } from "@/components/portal/result-actions";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { SpecialtyId } from "@/lib/domain/types";
import { MAX_FRAGMENT_CHARS, relatedPassages, type DocumentParagraph } from "@/lib/materials/fragments";

interface Fragment { text: string; paragraph: number | null }
interface Lookup { related: Array<{ materialId: string; title: string; snippet: string; matchedTerms: string[] }>; searchTerms: string[] }

/**
 * «Вопрос к фрагменту»: select a passage (or take a whole paragraph) and see
 * where the same thing is said in this document and in your other materials.
 * A search by sources receives only the recognised medical terms of the
 * fragment — the text itself never leaves the workspace.
 */
export function MaterialReader({ specialty, materialId, paragraphs }: { specialty: SpecialtyId; materialId: string; paragraphs: readonly DocumentParagraph[] }) {
  const { command } = useWorkspace();
  const container = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Fragment | null>(null);
  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);

  function readSelection() {
    const current = window.getSelection();
    const text = current?.toString().replace(/\s+/gu, " ").trim() ?? "";
    if (!current || text.length < 3 || !container.current?.contains(current.anchorNode)) { setSelection(null); return; }
    const node = current.anchorNode instanceof Element ? current.anchorNode : current.anchorNode?.parentElement;
    const number = Number(node?.closest("[data-paragraph]")?.getAttribute("data-paragraph") ?? NaN);
    setSelection({ text: text.slice(0, MAX_FRAGMENT_CHARS), paragraph: Number.isFinite(number) ? number : null });
  }

  async function ask(next: Fragment) {
    setFragment(next);
    setSelection(null);
    setLookup(null);
    setBusy(true);
    const response = await command({ action: "fragmentLookup", materialId, fragment: next.text }, { refresh: false });
    setBusy(false);
    if (response?.fragment) setLookup(response.fragment);
  }

  const inDocument = useMemo(() => (fragment ? relatedPassages(paragraphs, fragment.text, { exclude: fragment.paragraph }) : []), [fragment, paragraphs]);

  return <div className="pt-reader">
    <div className="pt-reader-text" ref={container} onMouseUp={readSelection} onKeyUp={readSelection} onTouchEnd={readSelection}>
      {paragraphs.map(paragraph => <div key={paragraph.number} className="pt-reader-paragraph" id={`p-${paragraph.number}`} data-paragraph={paragraph.number} data-active={fragment?.paragraph === paragraph.number || undefined}>
        <span className="pt-reader-number" aria-hidden="true">{paragraph.number}</span>
        <p>{paragraph.text}</p>
        <button type="button" className="ws-icon-button pt-reader-ask" aria-label={`Спросить об абзаце ${paragraph.number}`} onClick={() => void ask({ text: paragraph.text.slice(0, MAX_FRAGMENT_CHARS), paragraph: paragraph.number })}><MessageSquareText size={16} aria-hidden="true" /></button>
      </div>)}
    </div>
    {selection && !fragment && <div className="pt-reader-selection" role="status">
      <span>Выделено: «{selection.text.length > 80 ? `${selection.text.slice(0, 80)}…` : selection.text}»</span>
      <button type="button" className="ws-button is-primary is-small" onClick={() => void ask(selection)}><MessageSquareText size={14} aria-hidden="true" />Спросить о выделенном</button>
    </div>}
    {fragment && <aside className="pt-reader-panel" aria-label="Вопрос к фрагменту">
      <button type="button" className="ws-icon-button pt-share-close" aria-label="Закрыть" onClick={() => { setFragment(null); setLookup(null); }}><X size={16} aria-hidden="true" /></button>
      <blockquote className="pt-quote"><p>{fragment.text}</p></blockquote>
      <p className="ws-muted">{fragment.paragraph ? `Абзац ${fragment.paragraph} этого документа.` : "Фрагмент этого документа."} Ниже — где о том же сказано в ваших материалах и что можно найти по источникам. Продукт не пересказывает и не толкует фрагмент.</p>
      <section aria-labelledby="pt-reader-doc">
        <h2 id="pt-reader-doc" className="pt-subtitle">В этом документе</h2>
        {inDocument.length ? <ol className="pt-reader-hits">{inDocument.map(hit => <li key={hit.number}><a className="ws-text-link" href={`#p-${hit.number}`}>Абзац {hit.number}</a><span>{hit.text.length > 220 ? `${hit.text.slice(0, 220)}…` : hit.text}</span><small className="ws-muted">Совпадают слова: {hit.matched.join(", ")}</small></li>)}</ol> : <p className="ws-muted">Других мест с теми же словами в этом документе нет.</p>}
      </section>
      <section aria-labelledby="pt-reader-library">
        <h2 id="pt-reader-library" className="pt-subtitle">В других ваших материалах</h2>
        {busy ? <p className="ws-muted"><Loader2 size={14} className="ws-spin" aria-hidden="true" /> Ищем в вашей библиотеке…</p>
          : lookup?.related.length ? <ol className="pt-reader-hits">{lookup.related.map(hit => <li key={hit.materialId}><a className="ws-text-link" href={`/${specialty}/materials/${hit.materialId}`}>{hit.title}</a><span>{hit.snippet}</span><small className="ws-muted">Совпадают слова: {hit.matchedTerms.join(", ")}</small></li>)}</ol>
          : lookup ? <p className="ws-muted">В других материалах этих слов нет.</p> : null}
      </section>
      <section aria-labelledby="pt-reader-sources">
        <h2 id="pt-reader-sources" className="pt-subtitle">По источникам</h2>
        {lookup && (lookup.searchTerms.length
          ? <>
            <p className="ws-muted">В поиск по источникам уйдут только распознанные термины: {lookup.searchTerms.join(" · ")}. Текст фрагмента не отправляется.</p>
            <div className="pt-card-actions"><FollowupJobButton text={lookup.searchTerms.join(", ")} job="answer" label="Ответ по источникам" /></div>
          </>
          : <p className="ws-muted">В фрагменте не распознаны заболевание, препарат или другой медицинский термин — поиск по источникам не предлагается.</p>)}
        {!lookup && !busy && <p className="ws-muted"><FileSearch size={14} aria-hidden="true" /> Нет связи с сервером — повторите запрос.</p>}
      </section>
    </aside>}
  </div>;
}
