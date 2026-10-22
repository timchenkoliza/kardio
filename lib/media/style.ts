/**
 * Visual system lock for medical media derivatives. Tokens come from
 * design-system/tokens.json (Yandex Med DS v1); the warm pair is the accent of
 * the Clinical Visual Recraft lock (context/41) and is used only where warm vs
 * cool colour carries meaning in the source.
 */

export const MEDIA_PIPELINE = { name: "ds-tonal-redraw", version: "1.1.0" } as const;
export const MEDIA_TRANSFORMATION_VERSION = `${MEDIA_PIPELINE.name}@${MEDIA_PIPELINE.version}`;

export const MEDIA_STYLE = {
  designSystemVersion: "yandex-med-ds@1+recraft-lock@41",
  /** `surface`: the ground of every derivative. */
  background: "#F2F2F2",
  /** Fills from the darkest to the lightest tone: accent-brand, art-video-1, art-guideline-2, canvas. */
  tones: ["#898BFF", "#AFA2FF", "#D9D8FF", "#FFFFFF"],
  /** Contours, one weight for every picture: accent-ink. */
  line: "#5759EF",
  /** Warm family (dark, light), only for sources whose colour encodes meaning. */
  warm: ["#F367D0", "#FDABC1"],
  /** Colours that draw the eye; their share of the frame stays under the brand-attention limit. */
  attention: ["#898BFF", "#5759EF", "#F367D0"],
} as const;

export const MEDIA_PALETTE: readonly string[] = [MEDIA_STYLE.background, ...MEDIA_STYLE.tones, MEDIA_STYLE.line, ...MEDIA_STYLE.warm];

/** 2:1 frame at 2× density; the subject sits inside the central crop-safe box (70 % × 66 %), so the 3:1 article crop keeps it whole. */
export const MEDIA_FRAME = { width: 1600, height: 800, box: { width: 1120, height: 528 } } as const;

export const MEDIA_LIMITS = {
  /** Share of the frame left as ground: drawings, and waveforms that are a single trace. */
  negativeSpace: { tones: [0.45, 0.94], trace: [0.8, 0.995] },
  /** Share of the frame taken by the subject's bounding box; a portrait subject in the 2:1 frame sits near the floor. */
  anchorShare: [0.1, 0.62],
  brandAttentionMax: 0.2,
  /** Share of subject pixels that sit on a boundary between fills. */
  detailMax: 0.2,
  paletteMin: 0.999,
  frameBackgroundMin: 0.995,
  structurePrecisionMin: 0.9,
  structureRecallMin: 0.75,
  removedCleanMin: 0.98,
  keptTextIouMin: 0.6,
} as const;

/** Shown with every derivative whose match to the topic is MEDIUM. */
export const MEDIUM_CAVEAT = "Иллюстрация к теме, не к конкретному случаю";
