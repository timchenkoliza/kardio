import type { ReactElement } from "react";
import type { MascotVariant } from "@/lib/portal/agents-gallery";

/**
 * Agent mascots: one family, one body, a prop per capability. Pure SVG with
 * token-backed CSS; a small wiggle on hover/focus of the parent card that is
 * switched off under prefers-reduced-motion. Decorative: the card text names
 * the capability, so the picture is hidden from assistive technology.
 */

const PROPS: Record<MascotVariant, () => ReactElement> = {
  drug: () => <g className="mc-prop-group" transform="rotate(-32 96 92)">
    <rect className="mc-prop" x="78" y="84" width="38" height="18" rx="9" />
    <path className="mc-prop-accent" d="M97 84 H 107 A 9 9 0 0 1 107 102 H 97 Z" />
    <path className="mc-prop-line" d="M97 84 V 102" />
  </g>,
  guidelines: () => <g className="mc-prop-group">
    <rect className="mc-prop" x="76" y="74" width="34" height="40" rx="4" />
    <path className="mc-prop-accent" d="M76 78 A 4 4 0 0 1 80 74 H 86 V 114 H 80 A 4 4 0 0 1 76 110 Z" />
    <path className="mc-prop-line" d="M91 86 H 104 M91 94 H 104 M91 102 H 100" />
  </g>,
  research: () => <g className="mc-prop-group">
    <circle className="mc-prop" cx="92" cy="88" r="13" />
    <circle className="mc-prop-glass" cx="92" cy="88" r="8" />
    <path className="mc-prop-handle" d="M101 98 L 112 110" />
  </g>,
  consilium: () => <g className="mc-prop-group">
    <path className="mc-prop" d="M74 72 H 104 A 6 6 0 0 1 110 78 V 92 A 6 6 0 0 1 104 98 H 88 L 80 106 V 98 H 74 A 6 6 0 0 1 68 92 V 78 A 6 6 0 0 1 74 72 Z" />
    <path className="mc-prop-line" d="M78 82 H 100 M78 89 H 94" />
    <circle className="mc-prop-accent" cx="108" cy="104" r="7" />
  </g>,
  calculators: () => <g className="mc-prop-group">
    <rect className="mc-prop" x="78" y="72" width="30" height="40" rx="5" />
    <rect className="mc-prop-accent" x="82" y="76" width="22" height="9" rx="2" />
    <path className="mc-prop-line" d="M84 92 H 86 M92 92 H 94 M100 92 H 102 M84 100 H 86 M92 100 H 94 M100 100 H 102 M84 106 H 86 M92 106 H 94" />
  </g>,
  events: () => <g className="mc-prop-group">
    <rect className="mc-prop" x="76" y="76" width="34" height="34" rx="5" />
    <path className="mc-prop-accent" d="M76 81 A 5 5 0 0 1 81 76 H 105 A 5 5 0 0 1 110 81 V 86 H 76 Z" />
    <path className="mc-prop-line" d="M84 72 V 80 M102 72 V 80 M84 94 H 88 M92 94 H 96 M100 94 H 104 M84 102 H 88 M92 102 H 96" />
  </g>,
  materials: () => <g className="mc-prop-group">
    <path className="mc-prop-accent" d="M74 80 A 4 4 0 0 1 78 76 H 88 L 92 81 H 108 A 4 4 0 0 1 112 85 V 88 H 74 Z" />
    <rect className="mc-prop" x="74" y="84" width="38" height="26" rx="4" />
    <path className="mc-prop-line" d="M82 96 H 104" />
  </g>,
  learning: () => <g className="mc-prop-group">
    <path className="mc-prop-accent" d="M60 4 L 92 16 L 60 28 L 28 16 Z" />
    <path className="mc-prop-line" d="M44 22 V 32 C 52 38, 68 38, 76 32 V 22 M92 16 V 30" />
  </g>,
  updates: () => <g className="mc-prop-group">
    <path className="mc-prop-accent" d="M96 70 L 100 82 L 112 86 L 100 90 L 96 102 L 92 90 L 80 86 L 92 82 Z" />
    <circle className="mc-prop-accent" cx="110" cy="104" r="4" />
  </g>,
};

export function Mascot({ variant, size = 72, className }: { variant: MascotVariant; size?: number; className?: string }) {
  const Prop = PROPS[variant];
  return <svg className={className ? `mascot ${className}` : "mascot"} data-mascot={variant} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false">
    <ellipse className="mc-shadow" cx="60" cy="112" rx="34" ry="5" />
    <g className="mc-figure">
      <path className="mc-body" d="M60 20 C 89 20, 104 42, 104 68 C 104 94, 86 108, 60 108 C 34 108, 16 94, 16 68 C 16 42, 31 20, 60 20 Z" />
      <path className="mc-body-shade" d="M24 84 C 30 100, 46 108, 60 108 C 80 108, 96 98, 102 82 C 92 96, 76 102, 60 102 C 44 102, 30 96, 24 84 Z" />
      <ellipse className="mc-shine" cx="40" cy="38" rx="9" ry="5" transform="rotate(-24 40 38)" />
      <g className="mc-eyes">
        <ellipse className="mc-eye" cx="46" cy="60" rx="9" ry="10" />
        <ellipse className="mc-eye" cx="74" cy="60" rx="9" ry="10" />
        <circle className="mc-pupil" cx="47" cy="62" r="4.6" />
        <circle className="mc-pupil" cx="75" cy="62" r="4.6" />
        <circle className="mc-glint" cx="49" cy="59" r="1.6" />
        <circle className="mc-glint" cx="77" cy="59" r="1.6" />
      </g>
      <ellipse className="mc-cheek" cx="34" cy="74" rx="6" ry="3.5" />
      <ellipse className="mc-cheek" cx="86" cy="74" rx="6" ry="3.5" />
      <path className="mc-mouth" d="M53 77 Q 60 83, 67 77" />
      <ellipse className="mc-arm" cx="20" cy="80" rx="6" ry="9" transform="rotate(20 20 80)" />
      <Prop />
    </g>
  </svg>;
}
