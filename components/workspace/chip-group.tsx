"use client";

import { Check } from "lucide-react";

export interface ChipOption<T extends string | number> {
  id: T;
  label: string;
  disabled?: boolean;
  note?: string;
}

/** Spotify-like taste selection: toggles, no prompt writing. */
export function ChipGroup<T extends string | number>({ legend, options, value, onChange, multiple = true, hint, name }: {
  legend: string;
  options: ReadonlyArray<ChipOption<T>>;
  value: readonly T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  hint?: string;
  name: string;
}) {
  function toggle(id: T) {
    if (!multiple) { onChange([id]); return; }
    onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  }
  return <fieldset className="ws-chips">
    <legend>{legend}</legend>
    {hint && <p className="ws-chips-hint">{hint}</p>}
    <div className="ws-chip-row" role={multiple ? undefined : "radiogroup"} aria-label={multiple ? undefined : legend}>
      {options.map(option => {
        const selected = value.includes(option.id);
        return <button
          type="button"
          key={String(option.id)}
          name={name}
          className={selected ? "ws-chip is-selected" : "ws-chip"}
          aria-pressed={multiple ? selected : undefined}
          role={multiple ? undefined : "radio"}
          aria-checked={multiple ? undefined : selected}
          disabled={option.disabled}
          title={option.note}
          onClick={() => toggle(option.id)}
        >{selected && <Check size={14} aria-hidden="true" />}<span>{option.label}</span></button>;
      })}
    </div>
  </fieldset>;
}
