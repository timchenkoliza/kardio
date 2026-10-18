import { CircleHelp } from "lucide-react";

export function SectionHelp({ text }: { text: string }) {
  return (
    <span className="section-help" tabIndex={0} aria-label={text}>
      <CircleHelp size={14} aria-hidden="true" />
      <span className="section-help-popover" role="tooltip">{text}</span>
    </span>
  );
}
