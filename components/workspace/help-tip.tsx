"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";

/** A «?» next to a term that needs a short explanation. Opens on click or keyboard, closes on Escape or outside click. */
export function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return <span className="ws-help" ref={root}>
    <button type="button" className="ws-help-button" aria-label={`Что такое «${label}»`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><CircleHelp size={15} aria-hidden="true" /></button>
    {open && <span className="ws-help-bubble" id={id} role="note">{children}</span>}
  </span>;
}
