"use client";

/**
 * One horizontal row of prompt suggestions under the answer modes. A click
 * puts the query into the input (the physician still presses «Найти»);
 * on phones the row scrolls and snaps instead of wrapping.
 */
export function Suggestions({ items, onPick, label = "Примеры запросов" }: { items: readonly string[]; onPick: (text: string) => void; label?: string }) {
  if (!items.length) return null;
  return <div className="pt-suggestions" data-kind="query" aria-label={label}>
    <div className="pt-suggestions-row">
      {items.map(item => <button type="button" key={item} className="pt-suggestion" data-suggestion="" onClick={() => onPick(item)}>{item}</button>)}
    </div>
  </div>;
}
