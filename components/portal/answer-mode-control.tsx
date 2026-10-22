"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { BarChart3, ListOrdered, Zap } from "lucide-react";
import { ANSWER_MODE_COPY, ANSWER_MODES, type AnswerMode } from "@/lib/portal/answer-mode";

const ICONS = { zap: Zap, list: ListOrdered, chart: BarChart3 } as const;

/**
 * AnswerMode as three soft cards: icon, name, one line of what the mode does.
 * A radiogroup (arrow keys move the choice); the selection highlight slides
 * to the chosen card; one small sparkle rests near it. Not a job and not a
 * chip row — it never starts anything by itself.
 */
export function AnswerModeControl({ value, onChange, legend = "Режим ответа", name = "answer-mode", disabled = false, hovered = null }: {
  value: AnswerMode;
  onChange: (mode: AnswerMode) => void;
  legend?: string;
  name?: string;
  disabled?: boolean;
  /** Visual-audit only: render a card in its hover state without a pointer. */
  hovered?: AnswerMode | null;
}) {
  const id = useId();
  const track = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const measure = () => {
    const root = track.current;
    const selected = root?.querySelector<HTMLElement>(`[data-mode="${value}"]`);
    if (!root || !selected) return;
    setIndicator({ x: selected.offsetLeft, y: selected.offsetTop, width: selected.offsetWidth, height: selected.offsetHeight });
  };
  useLayoutEffect(measure, [value]);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !track.current) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(track.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure reads the latest value through the DOM
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = ANSWER_MODES[(index + delta + ANSWER_MODES.length) % ANSWER_MODES.length];
    onChange(next);
    track.current?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus();
  }

  return <div className="pt-modes" data-answer-mode={value}>
    <p className="pt-modes-legend" id={`${id}-legend`}>{legend}</p>
    <div ref={track} className={indicator ? "pt-modes-track is-measured" : "pt-modes-track"} role="radiogroup" aria-labelledby={`${id}-legend`} data-name={name}>
      <span className="pt-modes-indicator" aria-hidden="true" style={indicator ? { transform: `translate(${indicator.x}px, ${indicator.y}px)`, width: indicator.width, height: indicator.height } : undefined} />
      {ANSWER_MODES.map((mode, index) => {
        const copy = ANSWER_MODE_COPY[mode];
        const Icon = ICONS[copy.icon];
        const selected = mode === value;
        return <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={selected}
          tabIndex={selected ? 0 : -1}
          data-mode={mode}
          className={hovered === mode ? "pt-mode is-hover" : "pt-mode"}
          disabled={disabled}
          onClick={() => onChange(mode)}
          onKeyDown={event => onKeyDown(event, index)}
        >
          <span className="pt-mode-icon"><Icon size={20} aria-hidden="true" /></span>
          <span className="pt-mode-copy"><strong>{copy.label}</strong><span>{copy.secondary}</span></span>
          {selected && <svg className="pt-mode-sparkle" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4Z" fill="currentColor" /></svg>}
        </button>;
      })}
    </div>
  </div>;
}
