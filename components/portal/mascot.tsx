import { useId, type ReactElement } from "react";
import type { MascotVariant } from "@/lib/portal/agents-gallery";

/**
 * «Смузи» — the one mascot of the product: a soft lavender blob with large
 * dark eyes and a tiny mouth, drawn with volumetric shading and no contour.
 * Every role is the same character plus a secondary prop (a card, a book,
 * a magnifier, a calendar, a folder…). Motion presets are quiet by design:
 * a 1–2° tilt and a 1–3 px lift on hover of the parent card, optional
 * breathing; nothing under prefers-reduced-motion. Decorative: the card text
 * names the capability, so the figure is hidden from assistive technology.
 */

export type MascotMotion = "still" | "breathe";

const PROPS: Record<MascotVariant, () => ReactElement> = {
  drug: () => <g className="sm-prop-group">
    <rect className="sm-prop" x="80" y="70" width="32" height="42" rx="6" transform="rotate(-10 96 91)" />
    <path className="sm-prop-line" d="M88 82 H 104 M88 90 H 104 M88 98 H 100" transform="rotate(-10 96 91)" />
    <rect className="sm-prop-accent" x="84" y="74" width="10" height="4" rx="2" transform="rotate(-10 96 91)" />
  </g>,
  guidelines: () => <g className="sm-prop-group">
    <path className="sm-prop" d="M74 78 H 104 A 6 6 0 0 1 110 84 V 112 H 80 A 6 6 0 0 1 74 106 Z" />
    <path className="sm-prop-accent" d="M74 78 H 84 V 112 H 80 A 6 6 0 0 1 74 106 Z" />
    <path className="sm-prop-line" d="M90 88 H 104 M90 96 H 104 M90 104 H 100" />
  </g>,
  research: () => <g className="sm-prop-group">
    <circle className="sm-prop" cx="92" cy="86" r="14" />
    <circle className="sm-prop-glass" cx="92" cy="86" r="9" />
    <path className="sm-prop-line" d="M102 97 L 114 110" strokeWidth="5" />
  </g>,
  consilium: () => <g className="sm-prop-group">
    <path className="sm-prop" d="M72 74 H 106 A 6 6 0 0 1 112 80 V 96 A 6 6 0 0 1 106 102 H 88 L 80 110 V 102 H 72 A 6 6 0 0 1 66 96 V 80 A 6 6 0 0 1 72 74 Z" />
    <path className="sm-prop-line" d="M78 84 H 100 M78 92 H 94" />
  </g>,
  calculators: () => <g className="sm-prop-group">
    <rect className="sm-prop" x="78" y="72" width="30" height="40" rx="6" />
    <rect className="sm-prop-accent" x="83" y="77" width="20" height="9" rx="2" />
    <path className="sm-prop-line" d="M86 94 H 88 M92 94 H 94 M98 94 H 100 M86 102 H 88 M92 102 H 94 M98 102 H 100" />
  </g>,
  events: () => <g className="sm-prop-group">
    <rect className="sm-prop" x="76" y="76" width="36" height="34" rx="6" />
    <path className="sm-prop-accent" d="M76 82 A 6 6 0 0 1 82 76 H 106 A 6 6 0 0 1 112 82 V 88 H 76 Z" />
    <path className="sm-prop-line" d="M86 72 V 80 M102 72 V 80 M84 96 H 88 M92 96 H 96 M100 96 H 104 M84 103 H 88 M92 103 H 96" />
  </g>,
  materials: () => <g className="sm-prop-group">
    <path className="sm-prop-accent" d="M72 82 A 5 5 0 0 1 77 77 H 89 L 94 82 H 109 A 5 5 0 0 1 114 87 V 90 H 72 Z" />
    <rect className="sm-prop" x="72" y="86" width="42" height="26" rx="5" />
  </g>,
  learning: () => <g className="sm-prop-group">
    <path className="sm-prop-accent" d="M60 8 L 94 20 L 60 32 L 26 20 Z" />
    <path className="sm-prop-line" d="M42 26 V 36 C 50 42, 70 42, 78 36 V 26 M94 20 V 34" />
  </g>,
  updates: () => <g className="sm-prop-group">
    <path className="sm-prop-accent" d="M96 68 L 100 80 L 112 84 L 100 88 L 96 100 L 92 88 L 80 84 L 92 80 Z" />
    <circle className="sm-prop-accent" cx="112" cy="104" r="4" />
  </g>,
};

/** The one base character; `variant` only adds its prop. */
export function Mascot({ variant, size = 72, className, motion = "still" }: { variant: MascotVariant | "canonical"; size?: number; className?: string; motion?: MascotMotion }) {
  const Prop = variant === "canonical" ? null : PROPS[variant];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradient = `sm-body-${uid}`;
  const soft = `sm-soft-${uid}`;
  const blur = `url(#${soft})`;
  return <svg className={className ? `mascot ${className}` : "mascot"} data-mascot={variant} data-motion={motion} viewBox="0 0 120 120" width={size} height={size} role="presentation" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={gradient} cx="42%" cy="34%" r="70%">
        <stop className="sm-body-stop-a" offset="0" />
        <stop className="sm-body-stop-b" offset="1" />
      </radialGradient>
      <filter id={soft} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" /></filter>
    </defs>
    <ellipse className="sm-shadow" cx="60" cy="112" rx="30" ry="5" filter={blur} />
    <g className="sm-figure">
      {/* Limbs sit behind the body: slightly darker lavender, softly blurred edges. */}
      <ellipse className="sm-limb" cx="22" cy="86" rx="9" ry="12" transform="rotate(18 22 86)" filter={blur} />
      <ellipse className="sm-limb" cx="98" cy="86" rx="9" ry="12" transform="rotate(-18 98 86)" filter={blur} />
      <ellipse className="sm-limb-deep" cx="44" cy="106" rx="11" ry="6" filter={blur} />
      <ellipse className="sm-limb-deep" cx="76" cy="106" rx="11" ry="6" filter={blur} />
      <path className="sm-body" fill={`url(#${gradient})`} d="M60 16 C 88 16, 106 38, 106 66 C 106 92, 88 108, 60 108 C 32 108, 14 92, 14 66 C 14 38, 32 16, 60 16 Z" />
      <path className="sm-body-soft" d="M24 80 C 32 98, 46 106, 60 106 C 76 106, 92 98, 98 80 C 90 94, 76 100, 60 100 C 44 100, 30 94, 24 80 Z" filter={blur} />
      <ellipse className="sm-highlight" cx="42" cy="34" rx="12" ry="6" transform="rotate(-22 42 34)" filter={blur} />
      <g className="sm-eyes">
        <ellipse className="sm-eye" cx="45" cy="60" rx="8" ry="10" />
        <ellipse className="sm-eye" cx="75" cy="60" rx="8" ry="10" />
        <circle className="sm-glint" cx="48" cy="56" r="2.6" />
        <circle className="sm-glint" cx="78" cy="56" r="2.6" />
        <circle className="sm-glint" cx="42.5" cy="63" r="1.2" />
        <circle className="sm-glint" cx="72.5" cy="63" r="1.2" />
      </g>
      <ellipse className="sm-blush" cx="34" cy="72" rx="6" ry="3" filter={blur} />
      <ellipse className="sm-blush" cx="86" cy="72" rx="6" ry="3" filter={blur} />
      <path className="sm-mouth" d="M56 76 Q 60 79, 64 76" />
      {Prop && <Prop />}
    </g>
  </svg>;
}
