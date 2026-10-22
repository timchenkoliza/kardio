import type { ReactElement } from "react";
import type { SpecialtyArtKey } from "@/lib/ui/feed-art";

/**
 * Line art for the launch specialties beyond cardiology, drawn in the feed-art
 * system: warm paper, graphite contour, one violet signal per picture.
 * Schematic only — never a diagnostic image, never a stock photo.
 */

function Paper({ variant = 0 }: { variant?: number }) {
  const offset = variant * 9;
  return <g className="fa-topo">
    {[0, 1, 2, 3].map(index => <path key={index} d={`M-10 ${150 + index * 14 - offset} C 90 ${120 + index * 10 - offset}, 170 ${190 + index * 6 - offset}, 260 ${158 + index * 11 - offset} S 380 ${130 + index * 12 - offset}, 420 ${150 + index * 9 - offset}`} />)}
  </g>;
}

function Lungs() {
  return <>
    <Paper />
    <g className="fa-line">
      <path d="M186 64 C 150 54, 114 80, 106 122 C 100 156, 120 178, 152 176 C 174 174, 184 160, 186 138 Z" />
      <path d="M214 64 C 250 54, 286 80, 294 122 C 300 156, 280 178, 248 176 C 226 174, 216 160, 214 138 Z" />
      <path d="M200 20 L200 80" />
    </g>
    <g className="fa-signal">
      <path d="M200 80 C 190 90, 176 96, 162 106 M162 106 L144 124 M162 106 L152 134 M200 80 C 210 90, 224 96, 238 106 M238 106 L256 124 M238 106 L248 134" strokeWidth="1.5" />
      <circle cx="144" cy="124" r="3" /><circle cx="152" cy="134" r="3" /><circle cx="256" cy="124" r="3" /><circle cx="248" cy="134" r="3" />
    </g>
  </>;
}

function Kidney() {
  return <>
    <Paper variant={1} />
    <path className="fa-line" d="M176 34 C 124 34, 102 88, 114 132 C 126 172, 178 182, 198 158 C 208 146, 200 126, 210 114 C 218 106, 226 92, 218 70 C 210 48, 196 34, 176 34 Z" />
    <g className="fa-faint">
      <path d="M150 80 C 170 90, 188 102, 204 112" />
      <path d="M144 118 C 164 116, 184 114, 204 114" />
      <path d="M154 150 C 170 138, 188 126, 204 116" />
    </g>
    <path className="fa-signal" d="M210 114 C 232 120, 246 138, 252 186" strokeWidth="1.8" />
  </>;
}

function Ear() {
  return <>
    <Paper variant={2} />
    <g className="fa-line">
      <path d="M226 32 C 172 26, 142 62, 148 102 C 152 132, 168 142, 172 164 C 176 184, 200 188, 210 170" />
      <path d="M214 62 C 188 60, 176 82, 184 104 C 190 118, 204 120, 204 134" />
      <path d="M228 104 L300 104 M228 122 L300 122" />
    </g>
    <ellipse className="fa-signal-fill" cx="308" cy="113" rx="7" ry="20" />
    <g className="fa-signal"><path d="M318 100 C 326 108, 326 118, 318 126 M330 92 C 342 104, 342 122, 330 134" /></g>
  </>;
}

function Thermometer() {
  return <>
    <Paper />
    <g className="fa-line">
      <path d="M108 92 H 296 A 12 12 0 0 1 296 116 H 108" />
      <circle cx="92" cy="104" r="22" />
    </g>
    <g className="fa-faint">{[150, 170, 190, 210, 230, 250, 270].map(x => <path key={x} d={`M${x} 82 V 90`} />)}</g>
    <circle className="fa-signal-fill" cx="92" cy="104" r="14" />
    <path className="fa-signal" d="M100 104 H 248" strokeWidth="5" />
  </>;
}

function Gut() {
  return <>
    <Paper variant={1} />
    <path className="fa-line" d="M126 170 L126 62 C 126 42, 274 42, 274 62 L274 150 C 274 170, 254 174, 244 160" />
    <g className="fa-faint">
      <path d="M150 82 C 170 72, 190 92, 210 82 S 246 72, 254 88" />
      <path d="M150 108 C 170 98, 190 118, 210 108 S 246 98, 254 114" />
      <path d="M150 134 C 170 124, 190 144, 210 134 S 246 124, 254 140" />
    </g>
    <path className="fa-signal" d="M150 108 C 170 98, 190 118, 210 108 S 246 98, 254 114" strokeWidth="1.8" />
  </>;
}

function Pregnancy() {
  return <>
    <Paper variant={2} />
    <path className="fa-line" d="M200 26 C 138 26, 118 90, 138 132 C 154 162, 180 174, 200 178 C 220 174, 246 162, 262 132 C 282 90, 262 26, 200 26 Z" />
    <path className="fa-faint" d="M236 52 C 252 62, 258 78, 254 92" />
    <g className="fa-signal">
      <circle cx="194" cy="86" r="18" />
      <path d="M210 98 C 238 110, 238 148, 206 152 C 182 154, 174 132, 184 114" strokeWidth="1.5" />
    </g>
  </>;
}

function Glucose() {
  return <>
    <Paper />
    <path className="fa-signal-fill" d="M110 52 C 110 52, 84 92, 84 110 A 26 26 0 0 0 136 110 C 136 92, 110 52, 110 52 Z" />
    <path className="fa-line" d="M110 52 C 110 52, 84 92, 84 110 A 26 26 0 0 0 136 110 C 136 92, 110 52, 110 52 Z" />
    <g className="fa-faint"><path d="M166 92 H 392" strokeDasharray="3 6" /><path d="M166 126 H 392" strokeDasharray="3 6" /></g>
    <path className="fa-signal" d="M166 140 C 196 140, 208 66, 238 66 S 276 126, 304 118 S 350 104, 390 108" strokeWidth="1.6" />
  </>;
}

function Brain() {
  return <>
    <Paper variant={1} />
    <path className="fa-line" d="M112 118 C 98 80, 132 40, 182 38 C 222 30, 270 40, 292 70 C 312 96, 300 132, 270 140 C 252 158, 220 162, 200 150 C 180 160, 150 158, 136 146 C 120 140, 114 132, 112 118 Z" />
    <g className="fa-faint">
      <path d="M150 70 C 170 60, 190 80, 210 66" />
      <path d="M140 100 C 160 90, 180 110, 200 96 S 240 90, 262 104" />
      <path d="M228 58 C 248 68, 262 64, 278 80" />
      <path d="M160 128 C 180 120, 200 132, 220 124" />
    </g>
    <path className="fa-line" d="M240 150 L244 182" />
    <g className="fa-ripple">{[10, 20, 30].map(r => <circle key={r} cx="186" cy="84" r={r} />)}</g>
  </>;
}

function Neuron() {
  return <>
    <Paper variant={2} />
    <g className="fa-line">
      <circle cx="96" cy="100" r="20" />
      <path d="M80 88 L56 64 M78 108 L50 122 M92 80 L88 50 M110 86 L124 60" />
      <path d="M116 100 H 372" />
    </g>
    <g className="fa-line">{[134, 186, 290, 342].map(x => <rect key={x} x={x} y="90" width="40" height="20" rx="10" />)}</g>
    <rect className="fa-signal-fill" x="238" y="90" width="40" height="20" rx="10" />
    <g className="fa-signal"><rect x="238" y="90" width="40" height="20" rx="10" strokeDasharray="4 4" /></g>
  </>;
}

function Stroke() {
  return <>
    <Paper />
    <g className="fa-line">
      <path d="M104 172 C 136 140, 168 124, 204 112 C 240 100, 272 104, 300 88" />
      <path d="M204 112 C 214 132, 236 146, 268 152" />
      <path d="M300 88 L340 70 M300 88 L332 112" />
    </g>
    <ellipse className="fa-signal-fill" cx="252" cy="104" rx="16" ry="10" />
    <g className="fa-signal-hatch">{[242, 250, 258].map(x => <line key={x} x1={x} y1="98" x2={x + 6} y2="110" />)}</g>
    <g className="fa-faint"><path d="M300 88 L340 70 M300 88 L332 112" strokeDasharray="3 5" /></g>
  </>;
}

function Eeg() {
  const trace = (y: number) => `M10 ${y} ${Array.from({ length: 24 }, (_, index) => `Q ${index * 16 + 18} ${y + (index % 2 ? 6 : -6)}, ${index * 16 + 26} ${y}`).join(" ")}`;
  return <>
    <g className="fa-grid">{Array.from({ length: 21 }, (_, index) => <line key={index} x1={index * 20} y1="20" x2={index * 20} y2="180" />)}</g>
    <g className="fa-line">{[44, 80, 152].map(y => <path key={y} d={trace(y)} />)}</g>
    <path className="fa-signal" d="M10 116 H 150 L 158 84 L 166 140 C 176 112, 188 112, 196 116 L 204 86 L 212 142 C 222 112, 234 112, 242 116 H 392" strokeWidth="1.6" />
  </>;
}

function Thyroid() {
  return <>
    <Paper variant={1} />
    <g className="fa-line">
      <path d="M188 24 V 182 M212 24 V 182" />
      {[44, 64, 84, 104, 124, 144, 164].map(y => <path key={y} d={`M188 ${y} C 196 ${y + 4}, 204 ${y + 4}, 212 ${y}`} opacity="0.5" />)}
    </g>
    <path className="fa-line" d="M188 66 C 150 44, 118 84, 128 132 C 136 162, 170 162, 186 132 Z M212 66 C 250 44, 282 84, 272 132 C 264 162, 230 162, 214 132 Z M186 122 H 214" />
    <circle className="fa-signal-fill" cx="246" cy="106" r="11" />
    <circle className="fa-signal" cx="246" cy="106" r="11" />
  </>;
}

function Bone() {
  return <>
    <Paper variant={2} />
    <path className="fa-line" d="M96 88 C 74 70, 76 48, 96 48 C 116 48, 120 68, 132 80 L268 80 C 280 68, 284 48, 304 48 C 324 48, 326 70, 304 88 C 326 106, 324 128, 304 128 C 284 128, 280 108, 268 96 L132 96 C 120 108, 116 128, 96 128 C 76 128, 74 106, 96 88 Z" />
    <g className="fa-faint">{[146, 166, 186, 206, 226, 246].map(x => <path key={x} d={`M${x} 82 L${x + 14} 94 M${x + 14} 82 L${x} 94`} />)}</g>
    <ellipse className="fa-signal-fill" cx="206" cy="88" rx="22" ry="6" />
  </>;
}

export const SPECIALTY_ART: Record<SpecialtyArtKey, () => ReactElement> = {
  lungs: Lungs,
  kidney: Kidney,
  ear: Ear,
  thermometer: Thermometer,
  gut: Gut,
  pregnancy: Pregnancy,
  glucose: Glucose,
  brain: Brain,
  neuron: Neuron,
  stroke: Stroke,
  eeg: Eeg,
  thyroid: Thyroid,
  bone: Bone,
};
