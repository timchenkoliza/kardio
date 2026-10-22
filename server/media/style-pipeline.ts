import sharp, { type Sharp } from "sharp";
import { MEDIA_FRAME, MEDIA_LIMITS, MEDIA_PALETTE, MEDIA_STYLE } from "@/lib/media/style";
import type { MediaSource, MediaSourcePassport, Rect, ValidationCheck } from "@/lib/media/types";

/**
 * Deterministic style transformation of a medical source image into the
 * design system («ds-tonal-redraw»). Every output pixel comes from the pixel
 * at the same place in the source: the geometry — anatomy, sides, positions,
 * arrows — is kept by construction, and no model can add a structure.
 *
 *   crop to the subject → remove labels, logos and watermarks entirely →
 *   fit into the crop-safe box → one detail level (median + blur) →
 *   source background → `surface` → tones of the subject → four DS fills
 *   (warm / cool kept apart when colour carries meaning) → contours in one
 *   weight of `accent-ink` → lossless 2:1 derivative.
 *
 * Validation runs on the encoded file and compares it with the source.
 * Runs at publish time (scripts/publish-media-derivatives.ts), never per request.
 */

interface Raster { width: number; height: number; data: Uint8Array }
type RGB = readonly [number, number, number];

const rgb = (hex: string): RGB => [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const keyOf = (hex: string) => { const [r, g, b] = rgb(hex); return key(r, g, b); };

const BACKGROUND = rgb(MEDIA_STYLE.background);
const TONES = MEDIA_STYLE.tones.map(rgb);
const LINE = rgb(MEDIA_STYLE.line);
const WARM = MEDIA_STYLE.warm.map(rgb);
const PALETTE_KEYS = new Set(MEDIA_PALETTE.map(keyOf));
const ATTENTION_KEYS = new Set(MEDIA_STYLE.attention.map(keyOf));
const BACKGROUND_KEY = keyOf(MEDIA_STYLE.background);
const LIGHTEST_KEY = keyOf(MEDIA_STYLE.tones[3]);
const INK_KEYS = new Set([keyOf(MEDIA_STYLE.line), keyOf(MEDIA_STYLE.tones[0])]);

export async function decode(input: Buffer): Promise<Raster> {
  const { data, info } = await sharp(input).flatten({ background: "#ffffff" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

function cropRaster(source: Raster, [x, y, width, height]: Rect): Raster {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const w = Math.min(source.width - x0, Math.round(width));
  const h = Math.min(source.height - y0, Math.round(height));
  const data = new Uint8Array(w * h * 3);
  for (let row = 0; row < h; row += 1) data.set(source.data.subarray(((y0 + row) * source.width + x0) * 3, ((y0 + row) * source.width + x0 + w) * 3), row * w * 3);
  return { width: w, height: h, data };
}

/** Median colour of the 2-px outer ring: the colour the source is drawn on. */
function borderColor(raster: Raster): RGB {
  const channels: number[][] = [[], [], []];
  const { width, height, data } = raster;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x > 1 && y > 1 && x < width - 2 && y < height - 2) continue;
      const i = (y * width + x) * 3;
      channels[0].push(data[i]); channels[1].push(data[i + 1]); channels[2].push(data[i + 2]);
    }
  }
  return channels.map(values => values.sort((a, b) => a - b)[values.length >> 1]) as unknown as RGB;
}

function fillRects(raster: Raster, rects: readonly Rect[], color: RGB): void {
  for (const [x, y, w, h] of rects) {
    for (let row = Math.max(0, Math.round(y)); row < Math.min(raster.height, Math.round(y + h)); row += 1) {
      for (let col = Math.max(0, Math.round(x)); col < Math.min(raster.width, Math.round(x + w)); col += 1) {
        const i = (row * raster.width + col) * 3;
        raster.data[i] = color[0]; raster.data[i + 1] = color[1]; raster.data[i + 2] = color[2];
      }
    }
  }
}

async function viaSharp(raster: Raster, apply: (image: Sharp) => Sharp): Promise<Raster> {
  const { data, info } = await apply(sharp(Buffer.from(raster.data), { raw: { width: raster.width, height: raster.height, channels: 3 } })).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
}

export function luminance(raster: Raster): Float32Array {
  const out = new Float32Array(raster.width * raster.height);
  for (let p = 0, i = 0; p < out.length; p += 1, i += 3) out[p] = (0.2126 * raster.data[i] + 0.7152 * raster.data[i + 1] + 0.0722 * raster.data[i + 2]) / 255;
  return out;
}

/** Background = everything connected to the frame border within `tolerance` of the border colour. */
function floodBackground(raster: Raster, seed: RGB, tolerance: number): Uint8Array {
  const { width, height, data } = raster;
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const limit = tolerance * tolerance;
  const near = (p: number) => {
    const i = p * 3;
    const dr = data[i] - seed[0]; const dg = data[i + 1] - seed[1]; const db = data[i + 2] - seed[2];
    return dr * dr + dg * dg + db * db <= limit;
  };
  const push = (p: number) => { if (!mask[p] && near(p)) { mask[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { push(y * width); push(y * width + width - 1); }
  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (p >= width) push(p - width);
    if (p < (height - 1) * width) push(p + width);
  }
  return mask;
}

export function sobel(values: Float32Array, width: number, height: number): { magnitude: Float32Array; gx: Float32Array; gy: Float32Array } {
  const magnitude = new Float32Array(width * height);
  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const a = values[p - width - 1]; const b = values[p - width]; const c = values[p - width + 1];
      const d = values[p - 1]; const f = values[p + 1];
      const g = values[p + width - 1]; const h = values[p + width]; const k = values[p + width + 1];
      const sx = (c + 2 * f + k - a - 2 * d - g) / 4;
      const sy = (g + 2 * h + k - a - 2 * b - c) / 4;
      gx[p] = sx; gy[p] = sy;
      magnitude[p] = Math.hypot(sx, sy);
    }
  }
  return { magnitude, gx, gy };
}

/** Non-maximum suppression: one-pixel ridges along the gradient. */
function thinEdges(magnitude: Float32Array, gx: Float32Array, gy: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      const m = magnitude[p];
      if (m === 0) continue;
      const angle = ((Math.atan2(gy[p], gx[p]) * 180) / Math.PI + 180) % 180;
      const [o1, o2] = angle < 22.5 || angle >= 157.5 ? [p - 1, p + 1] : angle < 67.5 ? [p - width + 1, p + width - 1] : angle < 112.5 ? [p - width, p + width] : [p - width - 1, p + width + 1];
      if (m >= magnitude[o1] && m >= magnitude[o2]) out[p] = m;
    }
  }
  return out;
}

export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  const horizontal = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let dx = Math.max(0, x - radius); dx <= Math.min(width - 1, x + radius); dx += 1) horizontal[y * width + dx] = 1;
    }
  }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!horizontal[y * width + x]) continue;
      for (let dy = Math.max(0, y - radius); dy <= Math.min(height - 1, y + radius); dy += 1) out[dy * width + x] = 1;
    }
  }
  return out;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Saturated red / orange / magenta: the warm family of the source. */
function warmPixels(raster: Raster): Uint8Array {
  const out = new Uint8Array(raster.width * raster.height);
  for (let p = 0, i = 0; p < out.length; p += 1, i += 3) {
    const r = raster.data[i] / 255; const g = raster.data[i + 1] / 255; const b = raster.data[i + 2] / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if (max === 0 || (max - min) / max < 0.35) continue;
    let hue = max === r ? ((g - b) / (max - min)) * 60 : max === g ? ((b - r) / (max - min)) * 60 + 120 : ((r - g) / (max - min)) * 60 + 240;
    if (hue < 0) hue += 360;
    if (hue <= 35 || hue >= 330) out[p] = 1;
  }
  return out;
}

/** max − min of the (2r+1)² neighbourhood. */
function localRange(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  const rowMax = new Float32Array(values.length); const rowMin = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let hi = -Infinity; let lo = Infinity;
    for (let dx = Math.max(0, x - radius); dx <= Math.min(width - 1, x + radius); dx += 1) { const v = values[y * width + dx]; if (v > hi) hi = v; if (v < lo) lo = v; }
    rowMax[y * width + x] = hi; rowMin[y * width + x] = lo;
  }
  const out = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let hi = -Infinity; let lo = Infinity;
    for (let dy = Math.max(0, y - radius); dy <= Math.min(height - 1, y + radius); dy += 1) { const q = dy * width + x; if (rowMax[q] > hi) hi = rowMax[q]; if (rowMin[q] < lo) lo = rowMin[q]; }
    out[y * width + x] = hi - lo;
  }
  return out;
}

export interface Placement { x: number; y: number; width: number; height: number; scale: number; crop: Rect }

/** A rectangle of the stored source in derivative (frame) coordinates. */
export function toFrame(rect: Rect, placement: Placement): Rect {
  const [cx, cy] = placement.crop;
  return [placement.x + (rect[0] - cx) * placement.scale, placement.y + (rect[1] - cy) * placement.scale, rect[2] * placement.scale, rect[3] * placement.scale];
}

export interface TransformResult {
  output: Buffer;
  placement: Placement;
  /** The fitted source (after crop and removals), in placement coordinates. */
  fitted: Raster;
  /** Source background inside the placement. */
  background: Uint8Array;
  params: Record<string, number | string | boolean>;
}

const erode = (mask: Uint8Array, width: number, height: number, radius: number) => {
  const inverse = new Uint8Array(mask.length);
  for (let p = 0; p < mask.length; p += 1) inverse[p] = mask[p] ? 0 : 1;
  const grown = dilate(inverse, width, height, radius);
  for (let p = 0; p < grown.length; p += 1) grown[p] = grown[p] ? 0 : 1;
  return grown;
};

/**
 * Leader lines, dashed guides and frames of labels: near-black strokes thinner
 * than 5 px. They are cut out and the hole is filled from its neighbours, so the
 * drawing underneath stays and no annotation survives without its label.
 */
function removeThinDarkLines(raster: Raster): number {
  const { width, height, data } = raster;
  const dark = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < dark.length; p += 1, i += 3) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]); const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    if (lum < 0.45 && (max === 0 || (max - min) / max < 0.35)) dark[p] = 1;
  }
  const solid = dilate(erode(dark, width, height, 2), width, height, 2);
  const thin = new Uint8Array(width * height);
  for (let p = 0; p < thin.length; p += 1) if (dark[p] && !solid[p]) thin[p] = 1;
  const mask = dilate(thin, width, height, 2);
  let removed = 0;
  for (let p = 0; p < mask.length; p += 1) removed += mask[p];
  for (let pass = 0; pass < 40; pass += 1) {
    let left = 0;
    const next = mask.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (!mask[p]) continue;
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (mask[q]) continue;
          r += data[q * 3]; g += data[q * 3 + 1]; b += data[q * 3 + 2]; n += 1;
        }
        if (n >= 3) { data[p * 3] = r / n; data[p * 3 + 1] = g / n; data[p * 3 + 2] = b / n; next[p] = 0; } else left += 1;
      }
    }
    mask.set(next);
    if (!left) break;
  }
  return removed;
}

/** Majority of the 5 × 5 neighbourhood: one detail level, no speckle. Locked pixels keep their class. */
function modeFilter(classes: Uint8Array, locked: Uint8Array, width: number, height: number, radius: number, kinds: number): Uint8Array {
  const out = classes.slice();
  const counts = new Int32Array(kinds);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (locked[p]) continue;
      counts.fill(0);
      for (let dy = Math.max(0, y - radius); dy <= Math.min(height - 1, y + radius); dy += 1) for (let dx = Math.max(0, x - radius); dx <= Math.min(width - 1, x + radius); dx += 1) counts[classes[dy * width + dx]] += 1;
      let best = classes[p];
      for (let k = 0; k < kinds; k += 1) if (counts[k] > counts[best]) best = k;
      out[p] = best;
    }
  }
  return out;
}

/** Contours: hysteresis along ridges, fragments shorter than `minLength` dropped. */
function contourLines(ridges: Float32Array, allowed: Uint8Array, width: number, height: number, high: number, low: number, minLength: number): Uint8Array {
  const label = new Int32Array(width * height).fill(-1);
  const keep = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  for (let seed = 0; seed < ridges.length; seed += 1) {
    if (label[seed] !== -1 || ridges[seed] < high || !allowed[seed]) continue;
    let head = 0; let tail = 0;
    queue[tail++] = seed; label[seed] = seed;
    while (head < tail) {
      const p = queue[head++];
      const x = p % width; const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (label[q] !== -1 || ridges[q] < low || !allowed[q]) continue;
        label[q] = seed; queue[tail++] = q;
      }
    }
    if (tail >= minLength) for (let i = 0; i < tail; i += 1) keep[queue[i]] = 1;
  }
  return keep;
}

const BACKGROUND_CLASS = 0;
const LINE_CLASS = 7;
const CLASS_COLOR: RGB[] = [BACKGROUND, TONES[0], TONES[1], TONES[2], TONES[3], WARM[0], WARM[1], LINE];

export async function transformSource(bytes: Buffer, passport: MediaSourcePassport): Promise<TransformResult> {
  const full = await decode(bytes);
  const crop: Rect = passport.crop ?? [0, 0, full.width, full.height];
  const cropped = cropRaster(full, crop);
  const ground = borderColor(cropped);
  fillRects(cropped, passport.remove.map(([x, y, w, h]) => [x - crop[0], y - crop[1], w, h] as Rect), ground);
  const thinLines = passport.removeThinLines ? removeThinDarkLines(cropped) : 0;
  const trace = passport.render === "trace";

  const scale = Math.min(MEDIA_FRAME.box.width / cropped.width, MEDIA_FRAME.box.height / cropped.height);
  const width = Math.max(1, Math.round(cropped.width * scale));
  const height = Math.max(1, Math.round(cropped.height * scale));
  // One detail level for every source: the same box, a 3-px median, a light blur and a 5 × 5 majority.
  const fitted = await viaSharp(cropped, image => image.resize(width, height, { kernel: "lanczos3", fit: "fill" }).median(3));
  const smooth = await viaSharp(fitted, image => image.blur(1.2));
  const tone = luminance(smooth);
  const sharpTone = luminance(fitted);
  const tolerance = passport.backgroundTolerance ?? 48;
  const background = floodBackground(fitted, ground, tolerance);
  const warm = passport.hueSplit ? warmPixels(fitted) : new Uint8Array(width * height);
  const placementOf = (x0: number, y0: number): Placement => ({ x: x0, y: y0, width, height, scale, crop });
  const keep = new Uint8Array(width * height);
  for (const rect of passport.keepText) {
    const [fx, fy, fw, fh] = toFrame(rect, placementOf(0, 0));
    for (let y = Math.max(0, Math.floor(fy)); y < Math.min(height, Math.ceil(fy + fh)); y += 1) for (let x = Math.max(0, Math.floor(fx)); x < Math.min(width, Math.ceil(fx + fw)); x += 1) keep[y * width + x] = 1;
  }

  const coolValues: number[] = [];
  const warmValues: number[] = [];
  for (let p = 0; p < tone.length; p += 1) {
    if (background[p] || keep[p]) continue;
    (warm[p] ? warmValues : coolValues).push(tone[p]);
  }
  const bands = [quantile(coolValues, 0.25), quantile(coolValues, 0.5), quantile(coolValues, 0.75)];
  const warmSplit = quantile(warmValues, 0.5);

  let classes: Uint8Array = new Uint8Array(width * height);
  const locked = new Uint8Array(width * height);
  for (let p = 0; p < classes.length; p += 1) {
    if (keep[p] && sharpTone[p] < 0.45) { classes[p] = LINE_CLASS; locked[p] = 1; continue; }
    if (background[p]) { classes[p] = BACKGROUND_CLASS; continue; }
    if (trace) { classes[p] = sharpTone[p] < 0.62 ? LINE_CLASS : BACKGROUND_CLASS; continue; }
    if (warm[p]) classes[p] = tone[p] < warmSplit ? 5 : 6;
    else classes[p] = tone[p] < bands[0] ? 1 : tone[p] < bands[1] ? 2 : tone[p] < bands[2] ? 3 : 4;
  }

  let lineThreshold = 0;
  if (trace) {
    const ink = new Uint8Array(width * height);
    for (let p = 0; p < ink.length; p += 1) if (classes[p] === LINE_CLASS) ink[p] = 1;
    const thick = dilate(ink, width, height, 1);
    for (let p = 0; p < thick.length; p += 1) if (thick[p]) classes[p] = LINE_CLASS;
  } else {
    classes = modeFilter(classes, locked, width, height, 2, LINE_CLASS);
    const { magnitude, gx, gy } = sobel(tone, width, height);
    const ridges = thinEdges(magnitude, gx, gy, width, height);
    const subject = new Uint8Array(width * height);
    for (let p = 0; p < subject.length; p += 1) subject[p] = background[p] ? 0 : 1;
    const allowed = dilate(subject, width, height, 1);
    for (let p = 0; p < allowed.length; p += 1) if (keep[p]) allowed[p] = 0;
    const strengths: number[] = [];
    for (let p = 0; p < ridges.length; p += 1) if (ridges[p] > 0 && allowed[p]) strengths.push(ridges[p]);
    lineThreshold = Math.max(0.05, quantile(strengths, 0.85));
    const contours = dilate(contourLines(ridges, allowed, width, height, lineThreshold, lineThreshold * 0.45, 40), width, height, 1);
    for (let p = 0; p < contours.length; p += 1) if (contours[p] && !keep[p]) classes[p] = LINE_CLASS;
  }

  const x0 = Math.round((MEDIA_FRAME.width - width) / 2);
  const y0 = Math.round((MEDIA_FRAME.height - height) / 2);
  const canvas = new Uint8Array(MEDIA_FRAME.width * MEDIA_FRAME.height * 3);
  for (let i = 0; i < canvas.length; i += 3) { canvas[i] = BACKGROUND[0]; canvas[i + 1] = BACKGROUND[1]; canvas[i + 2] = BACKGROUND[2]; }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = CLASS_COLOR[classes[y * width + x]];
      const i = ((y0 + y) * MEDIA_FRAME.width + x0 + x) * 3;
      canvas[i] = color[0]; canvas[i + 1] = color[1]; canvas[i + 2] = color[2];
    }
  }
  const output = await sharp(Buffer.from(canvas), { raw: { width: MEDIA_FRAME.width, height: MEDIA_FRAME.height, channels: 3 } }).webp({ lossless: true, effort: 6 }).toBuffer();
  return {
    output,
    placement: placementOf(x0, y0),
    fitted,
    background,
    params: {
      render: trace ? "trace" : "tones",
      scale: Number(scale.toFixed(4)),
      backgroundTolerance: tolerance,
      thinLinesRemovedPx: thinLines,
      lineThreshold: Number(lineThreshold.toFixed(4)),
      toneBands: bands.map(value => value.toFixed(3)).join("/"),
      hueSplit: passport.hueSplit,
      median: 3,
      blur: 1.2,
      majority: 5,
      minContour: 40,
      lineDilation: 1,
    },
  };
}

/* ---------- Eligibility (before any transformation) ---------- */

export function eligibilityChecks(source: MediaSource, groundLuminance: number): ValidationCheck[] {
  return [
    { id: "match_gate", pass: ["EXACT", "STRONG", "MEDIUM"].includes(source.match.grade), value: source.match.grade, threshold: "EXACT | STRONG | MEDIUM" },
    { id: "patient_identifiers", pass: !source.passport.patientIdentifiers, value: source.passport.patientIdentifiers, threshold: "false" },
    { id: "brand_marks", pass: !source.passport.brandMarks, value: source.passport.brandMarks, threshold: "false" },
    // A dark diagnostic image cannot move onto the light ground without inverting what its intensities mean.
    { id: "diagnostic_background", pass: source.sourceClass !== "diagnostic" || groundLuminance >= 0.6, value: Number(groundLuminance.toFixed(3)), threshold: source.sourceClass === "diagnostic" ? "≥ 0.6 (diagnostic)" : "n/a (editorial)" },
  ];
}

export async function groundLuminanceOf(bytes: Buffer, crop: Rect | null): Promise<number> {
  const full = await decode(bytes);
  const [r, g, b] = borderColor(crop ? cropRaster(full, crop) : full);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ---------- Validation of the encoded derivative ---------- */

function share(count: number, total: number): number { return total ? count / total : 0; }
const round = (value: number) => Number(value.toFixed(4));

export async function validateDerivative(result: TransformResult, passport: MediaSourcePassport): Promise<ValidationCheck[]> {
  const out = await decode(result.output);
  const checks: ValidationCheck[] = [];
  const total = out.width * out.height;
  const { placement } = result;
  checks.push({ id: "frame_2x1", pass: out.width === MEDIA_FRAME.width && out.height === MEDIA_FRAME.height, value: `${out.width}×${out.height}`, threshold: `${MEDIA_FRAME.width}×${MEDIA_FRAME.height}` });

  let inPalette = 0; let ground = 0; let attention = 0; let ring = 0; let ringGround = 0;
  let minX = out.width; let minY = out.height; let maxX = -1; let maxY = -1;
  for (let p = 0, i = 0; p < total; p += 1, i += 3) {
    const k = key(out.data[i], out.data[i + 1], out.data[i + 2]);
    if (PALETTE_KEYS.has(k)) inPalette += 1;
    if (ATTENTION_KEYS.has(k)) attention += 1;
    const x = p % out.width; const y = (p - x) / out.width;
    if (k === BACKGROUND_KEY) ground += 1;
    else { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (x < placement.x || y < placement.y || x >= placement.x + placement.width || y >= placement.y + placement.height) { ring += 1; if (k === BACKGROUND_KEY) ringGround += 1; }
  }
  const negative = share(ground, total);
  const [negativeMin, negativeMax] = MEDIA_LIMITS.negativeSpace[passport.render === "trace" ? "trace" : "tones"];
  const anchor = maxX < 0 ? 0 : share((maxX - minX + 1) * (maxY - minY + 1), total);
  checks.push({ id: "palette", pass: share(inPalette, total) >= MEDIA_LIMITS.paletteMin, value: round(share(inPalette, total)), threshold: `≥ ${MEDIA_LIMITS.paletteMin}` });
  checks.push({ id: "frame_background", pass: ring === 0 || share(ringGround, ring) >= MEDIA_LIMITS.frameBackgroundMin, value: round(ring ? share(ringGround, ring) : 1), threshold: `≥ ${MEDIA_LIMITS.frameBackgroundMin}` });
  checks.push({ id: "negative_space", pass: negative >= negativeMin && negative <= negativeMax, value: round(negative), threshold: `${negativeMin}–${negativeMax}` });
  checks.push({ id: "anchor_share", pass: anchor >= MEDIA_LIMITS.anchorShare[0] && anchor <= MEDIA_LIMITS.anchorShare[1], value: round(anchor), threshold: `${MEDIA_LIMITS.anchorShare[0]}–${MEDIA_LIMITS.anchorShare[1]}` });
  checks.push({ id: "brand_attention", pass: share(attention, total) <= MEDIA_LIMITS.brandAttentionMax, value: round(share(attention, total)), threshold: `≤ ${MEDIA_LIMITS.brandAttentionMax}` });
  // Detail level: how much of the subject is boundary between fills. Above the limit the picture reads as noise.
  let subjectCells = 0; let boundary = 0;
  for (let y = placement.y; y < placement.y + placement.height - 1; y += 1) {
    for (let x = placement.x; x < placement.x + placement.width - 1; x += 1) {
      const i = (y * out.width + x) * 3;
      const k = key(out.data[i], out.data[i + 1], out.data[i + 2]);
      if (k === BACKGROUND_KEY) continue;
      subjectCells += 1;
      const right = key(out.data[i + 3], out.data[i + 4], out.data[i + 5]);
      const below = key(out.data[i + out.width * 3], out.data[i + out.width * 3 + 1], out.data[i + out.width * 3 + 2]);
      if (right !== k || below !== k) boundary += 1;
    }
  }
  const detail = share(boundary, subjectCells);
  checks.push({ id: "detail_level", pass: passport.render === "trace" || detail <= MEDIA_LIMITS.detailMax, value: round(detail), threshold: passport.render === "trace" ? "n/a (trace)" : `≤ ${MEDIA_LIMITS.detailMax}` });

  // Structure: every contour of the derivative sits on a real change in the source (nothing invented),
  // and the strong contours of the subject are still there (nothing lost). Measured on the file.
  const { width, height } = placement;
  const inner = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) inner.set(out.data.subarray(((placement.y + y) * out.width + placement.x) * 3, ((placement.y + y) * out.width + placement.x + width) * 3), y * width * 3);
  const outEdges = sobel(luminance({ width, height, data: inner }), width, height).magnitude;
  const sourceTone = luminance(result.fitted);
  const sourceGradient = sobel(sourceTone, width, height);
  // An output contour is supported when the source changes within 4 px of it: a real edge or a real
  // shading step that the four fills quantise. A contour over flat source would be invented.
  void sourceGradient;
  const range = localRange(sourceTone, width, height, 4);
  const support = new Uint8Array(width * height);
  const supportFlipped = new Uint8Array(width * height);
  for (let p = 0; p < support.length; p += 1) if (range[p] >= 0.015) { support[p] = 1; const x = p % width; supportFlipped[p - x + (width - 1 - x)] = 1; }
  const outMask = new Uint8Array(width * height);
  let outCount = 0; let supported = 0; let supportedFlipped = 0;
  for (let p = 0; p < outMask.length; p += 1) {
    if (outEdges[p] < 0.05) continue;
    outMask[p] = 1; outCount += 1;
    if (support[p]) supported += 1;
    if (supportFlipped[p]) supportedFlipped += 1;
  }
  const precision = share(supported, outCount);
  const precisionFlipped = share(supportedFlipped, outCount);
  const smoothTone = luminance(await viaSharp(result.fitted, image => image.blur(1)));
  const smoothGradient = sobel(smoothTone, width, height);
  const ridges = thinEdges(smoothGradient.magnitude, smoothGradient.gx, smoothGradient.gy, width, height);
  const subject = new Uint8Array(width * height);
  for (let p = 0; p < subject.length; p += 1) subject[p] = result.background[p] ? 0 : 1;
  const nearSubject = dilate(subject, width, height, 1);
  const strengths: number[] = [];
  for (let p = 0; p < ridges.length; p += 1) if (ridges[p] > 0 && nearSubject[p]) strengths.push(ridges[p]);
  const strong = Math.max(0.1, quantile(strengths, 0.85));
  const reached = dilate(outMask, width, height, 3);
  let strongCount = 0; let kept = 0;
  for (let p = 0; p < ridges.length; p += 1) {
    if (ridges[p] < strong || !nearSubject[p]) continue;
    strongCount += 1;
    if (reached[p]) kept += 1;
  }
  const recall = share(kept, strongCount);
  checks.push({ id: "structure_precision", pass: precision >= MEDIA_LIMITS.structurePrecisionMin, value: round(precision), threshold: `≥ ${MEDIA_LIMITS.structurePrecisionMin}` });
  checks.push({ id: "structure_recall", pass: recall >= MEDIA_LIMITS.structureRecallMin, value: round(recall), threshold: `≥ ${MEDIA_LIMITS.structureRecallMin}` });
  checks.push({ id: "orientation", pass: precision >= precisionFlipped, value: `${round(precision)} vs ${round(precisionFlipped)} mirrored`, threshold: "source ≥ mirrored" });

  if (passport.remove.length) {
    let cells = 0; let clean = 0;
    for (const rect of passport.remove) {
      const [fx, fy, fw, fh] = toFrame(rect, placement);
      for (let y = Math.max(placement.y, Math.round(fy)); y < Math.min(placement.y + height, Math.round(fy + fh)); y += 1) {
        for (let x = Math.max(placement.x, Math.round(fx)); x < Math.min(placement.x + width, Math.round(fx + fw)); x += 1) {
          const i = (y * out.width + x) * 3;
          const k = key(out.data[i], out.data[i + 1], out.data[i + 2]);
          cells += 1;
          if (k === BACKGROUND_KEY || k === LIGHTEST_KEY) clean += 1;
        }
      }
    }
    checks.push({ id: "removed_regions", pass: share(clean, cells || 1) >= MEDIA_LIMITS.removedCleanMin || cells === 0, value: round(cells ? share(clean, cells) : 1), threshold: `≥ ${MEDIA_LIMITS.removedCleanMin}` });
  }
  if (passport.keepText.length) {
    let worst = 1;
    for (const rect of passport.keepText) {
      const [fx, fy, fw, fh] = toFrame(rect, placement);
      const rx = Math.max(0, Math.round(fx - placement.x)); const ry = Math.max(0, Math.round(fy - placement.y));
      const rw = Math.min(width - rx, Math.round(fw)); const rh = Math.min(height - ry, Math.round(fh));
      const sourceInk = new Uint8Array(rw * rh); const outInk = new Uint8Array(rw * rh);
      for (let y = 0; y < rh; y += 1) {
        for (let x = 0; x < rw; x += 1) {
          const p = (ry + y) * width + rx + x;
          if (sourceTone[p] < 0.45) sourceInk[y * rw + x] = 1;
          const i = ((placement.y + ry + y) * out.width + placement.x + rx + x) * 3;
          if (INK_KEYS.has(key(out.data[i], out.data[i + 1], out.data[i + 2]))) outInk[y * rw + x] = 1;
        }
      }
      const a = dilate(sourceInk, rw, rh, 1); const b = dilate(outInk, rw, rh, 1);
      let union = 0; let both = 0;
      for (let p = 0; p < a.length; p += 1) { if (a[p] || b[p]) union += 1; if (a[p] && b[p]) both += 1; }
      worst = Math.min(worst, share(both, union || 1));
    }
    checks.push({ id: "kept_text", pass: worst >= MEDIA_LIMITS.keptTextIouMin, value: round(worst), threshold: `IoU ≥ ${MEDIA_LIMITS.keptTextIouMin}` });
  }
  return checks;
}

export const FAILURE_REASON: Record<string, string> = {
  match_gate: "Изображение недостаточно соответствует документу",
  patient_identifiers: "В исходнике видны идентификаторы пациента",
  brand_marks: "В кадре марка производителя или издателя",
  diagnostic_background: "Диагностическое изображение на тёмном фоне: перенос на светлый фон изменил бы диагностическое чтение",
  anchor_subject: "Документ-якорь относится к другому клиническому объекту",
  frame_2x1: "Формат кадра не 2:1",
  palette: "Цвета вне палитры дизайн-системы",
  frame_background: "Фон кадра не приведён к системе",
  negative_space: "Композиция выходит за норму пустого пространства",
  anchor_share: "Объект занимает слишком мало или слишком много кадра",
  brand_attention: "Акцентный цвет занимает больше допустимой доли кадра",
  structure_precision: "В производном изображении есть контуры, которых нет в исходнике",
  structure_recall: "Потеряна структура исходного изображения",
  orientation: "Ориентация изображения не совпадает с исходником",
  removed_regions: "Удалённые подписи или знаки проступают в производном изображении",
  detail_level: "Слишком мелкая детализация: изображение читается как шум",
  kept_text: "Медицински значимый текст воспроизведён с искажением",
};

export function failureReason(checks: readonly ValidationCheck[]): string | null {
  const failed = checks.filter(check => !check.pass);
  return failed.length ? failed.map(check => FAILURE_REASON[check.id] ?? check.id).join("; ") : null;
}
