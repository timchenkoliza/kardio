import type { ArtKey, FeedArtKey, SpecialtyArtKey } from "@/lib/ui/feed-art";
import { SPECIALTY_ART } from "./specialty-art";

/**
 * Yandex Med cardiology line art (context/31_CARDIO_VISUAL_PROMPT_SYSTEM.md):
 * thin anatomical contour, flow lines, warm paper, restrained violet signal,
 * one anchor per picture, no text. Drawn in-house, so no attribution caption.
 * Schematic illustrations, never diagnostic images.
 */

/** Deterministic pseudo-random sequence: the same picture on every render. */
function seeded(seed: number) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

/** Atrial fibrillation strip: irregularly irregular QRS, no P waves, fibrillatory baseline. */
function afTrace(): string {
  const random = seeded(11);
  const base = 112;
  const beats = [44, 86, 151, 183, 247, 296, 318, 371];
  let path = `M0 ${base}`;
  let x = 0;
  for (const beat of beats) {
    while (x < beat - 6) {
      x += 4;
      path += ` L${x} ${(base + (random() - 0.5) * 6).toFixed(1)}`;
    }
    path += ` L${beat - 2} ${base + 5} L${beat + 2} ${base - 64} L${beat + 6} ${base + 15} L${beat + 9} ${base}`;
    x = beat + 9;
    const t = beat + 22;
    path += ` Q${t} ${base - 16} ${t + 14} ${base}`;
    x = t + 14;
  }
  while (x < 400) { x += 4; path += ` L${x} ${(base + (random() - 0.5) * 6).toFixed(1)}`; }
  return path;
}

const AF_TRACE = afTrace();

function Topography({ variant = 0 }: { variant?: number }) {
  const offset = variant * 9;
  return <g className="fa-topo">
    {[0, 1, 2, 3].map(index => <path key={index} d={`M-10 ${150 + index * 14 - offset} C 90 ${120 + index * 10 - offset}, 170 ${190 + index * 6 - offset}, 260 ${158 + index * 11 - offset} S 380 ${130 + index * 12 - offset}, 420 ${150 + index * 9 - offset}`} />)}
  </g>;
}

function EcgArt() {
  return <>
    <g className="fa-grid">
      {Array.from({ length: 21 }, (_, index) => <line key={`v${index}`} x1={index * 20} y1="20" x2={index * 20} y2="180" />)}
      {Array.from({ length: 9 }, (_, index) => <line key={`h${index}`} x1="0" y1={20 + index * 20} x2="400" y2={20 + index * 20} />)}
    </g>
    <path className="fa-trace-ghost" d={AF_TRACE} />
    <path className="fa-trace fa-draw" d={AF_TRACE} pathLength={1} />
  </>;
}

function EchoArt() {
  const apex = { x: 200, y: 14 };
  const radius = 178;
  const arc = (r: number) => `M${apex.x - r * Math.sin(0.72)} ${apex.y + r * Math.cos(0.72)} A${r} ${r} 0 0 0 ${apex.x + r * Math.sin(0.72)} ${apex.y + r * Math.cos(0.72)}`;
  return <>
    <path className="fa-sector" d={`M${apex.x} ${apex.y} L${apex.x - radius * Math.sin(0.72)} ${apex.y + radius * Math.cos(0.72)} A${radius} ${radius} 0 0 0 ${apex.x + radius * Math.sin(0.72)} ${apex.y + radius * Math.cos(0.72)} Z`} />
    <g className="fa-faint">{[60, 100, 140].map(r => <path key={r} d={arc(r)} strokeDasharray="2 5" />)}</g>
    {/* Apical four-chamber contour: ventricles above the valve plane, atria below */}
    <g className="fa-line">
      <path d="M200 40 C 150 52, 128 92, 132 124 C 134 150, 150 172, 176 176 L 224 176 C 250 172, 266 150, 268 124 C 272 92, 250 52, 200 40 Z" />
      <path d="M200 42 C 196 70, 198 100, 200 122 L 200 176" />
      <path d="M140 122 C 160 117, 180 118, 200 122 C 220 118, 242 117, 262 122" />
      <path d="M150 54 C 168 46, 186 44, 200 46" opacity="0.5" />
    </g>
    <g className="fa-signal">
      <path d="M160 120 l12 -9 M188 121 l-10 -9" />
      <path d="M212 121 l10 -9 M240 120 l-11 -9" />
    </g>
    <g className="fa-scan"><line x1={apex.x} y1={apex.y} x2={apex.x} y2={apex.y + radius} /></g>
  </>;
}

function ArteryArt() {
  return <>
    <Topography />
    <g className="fa-line">
      <circle cx="200" cy="100" r="70" />
      {[56, 52, 48, 44].map(r => <circle key={r} cx="200" cy="100" r={r} opacity={0.35 + (56 - r) / 30} />)}
    </g>
    <circle className="fa-signal-fill" cx="200" cy="100" r="38" />
    <g className="fa-signal">{[34, 30, 25, 18, 10].map(r => <circle key={r} cx="200" cy="100" r={r} />)}</g>
  </>;
}

function CoronaryArt() {
  return <>
    <Topography variant={1} />
    <g className="fa-line">
      <path d="M10 72 C 90 60, 150 66, 200 70 S 320 82, 392 70" />
      <path d="M10 132 C 90 144, 150 138, 200 136 S 320 126, 392 138" />
    </g>
    <path className="fa-signal-fill" d="M168 69 C 182 92, 214 96, 236 73 Z" />
    <g className="fa-signal-hatch">{[176, 188, 200, 212, 224].map(x => <line key={x} x1={x} y1="72" x2={x + 6} y2="86" />)}</g>
    <g className="fa-flow">
      <path d="M20 90 C 120 88, 160 96, 200 104 S 270 92, 300 96 S 360 84, 388 92" />
      <path d="M20 102 C 120 102, 165 108, 200 112 S 270 110, 300 106 S 360 114, 388 104" />
      <path d="M20 114 C 120 116, 165 118, 200 120 S 270 124, 300 118 S 360 126, 388 116" />
    </g>
  </>;
}

function VentricleArt() {
  return <>
    <Topography variant={2} />
    <g className="fa-line">
      <path d="M140 40 C 132 100, 160 168, 200 176 C 240 168, 268 100, 260 40" />
      <path d="M160 40 C 156 92, 176 146, 200 152 C 224 146, 244 92, 240 40" />
    </g>
    <path className="fa-signal" d="M184 160 C 194 168, 206 168, 216 160" strokeWidth="2" />
    <g className="fa-flow">
      <path d="M176 30 C 178 70, 186 110, 200 128" />
      <path d="M224 30 C 222 70, 214 110, 200 128" />
    </g>
  </>;
}

function PulmonaryArt() {
  return <>
    <Topography variant={1} />
    <g className="fa-line">
      <path d="M200 182 L200 132 C 200 112, 176 104, 150 96 L 96 70 M150 96 L 118 118 M96 70 L 60 54 M96 70 L 74 90" />
      <path d="M200 132 C 200 112, 224 104, 250 96 L 304 70 M250 96 L 282 118 M304 70 L 340 54 M304 70 L 326 90" />
    </g>
    <g className="fa-signal">
      <path d="M192 182 L192 134 M208 182 L208 134" strokeWidth="2" />
      <circle cx="60" cy="54" r="3" /><circle cx="340" cy="54" r="3" /><circle cx="74" cy="90" r="3" /><circle cx="326" cy="90" r="3" />
    </g>
  </>;
}

function ConductionArt() {
  return <>
    <Topography variant={2} />
    <path className="fa-line" d="M200 176 C 150 150, 118 112, 122 78 C 126 48, 160 36, 186 52 C 194 56, 198 62, 200 68 C 202 62, 206 56, 214 52 C 240 36, 274 48, 278 78 C 282 112, 250 150, 200 176 Z" />
    <path className="fa-signal" d="M168 66 C 180 84, 194 96, 200 104 L 200 130 M200 116 C 186 134, 176 146, 172 156 M200 116 C 214 134, 224 146, 228 156" strokeWidth="1.6" />
    <g className="fa-ripple">{[10, 20, 30].map(r => <circle key={r} cx="168" cy="66" r={r} />)}</g>
  </>;
}

const ART: Record<FeedArtKey, () => React.ReactElement> = {
  ecg_af: EcgArt,
  echo: EchoArt,
  artery_pressure: ArteryArt,
  coronary_plaque: CoronaryArt,
  ventricle: VentricleArt,
  pulmonary: PulmonaryArt,
  conduction: ConductionArt,
};

export function FeedArt({ art, alt, animated = true }: { art: ArtKey; alt: string; animated?: boolean }) {
  const Art = art in ART ? ART[art as FeedArtKey] : SPECIALTY_ART[art as SpecialtyArtKey];
  return <svg className={animated ? `ws-feed-art fa-${art} is-animated` : `ws-feed-art fa-${art}`} viewBox="0 0 400 200" role="img" aria-label={alt} preserveAspectRatio="xMidYMid slice">
    <rect className="fa-paper" width="400" height="200" />
    <Art />
  </svg>;
}
