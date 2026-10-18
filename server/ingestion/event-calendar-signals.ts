export type EventCalendarSignalKind =
  | "date_range"
  | "day_month"
  | "numeric_date"
  | "time"
  | "relative_day"
  | "year";

export interface EventCalendarSignal {
  kind: EventCalendarSignalKind;
  raw: string;
  normalizedKey: string;
  start: number;
  end: number;
}

const MONTHS: Record<string, string> = {
  январь: "01", января: "01",
  февраль: "02", февраля: "02",
  март: "03", марта: "03",
  апрель: "04", апреля: "04",
  май: "05", мая: "05",
  июнь: "06", июня: "06",
  июль: "07", июля: "07",
  август: "08", августа: "08",
  сентябрь: "09", сентября: "09",
  октябрь: "10", октября: "10",
  ноябрь: "11", ноября: "11",
  декабрь: "12", декабря: "12",
};

const MONTH_PATTERN = Object.keys(MONTHS).join("|");

interface CandidateSignal extends EventCalendarSignal {
  priority: number;
}

function cleanRaw(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function padDay(value: string): string {
  return value.padStart(2, "0");
}

function addMatches(
  text: string,
  expression: RegExp,
  priority: number,
  toSignal: (match: RegExpMatchArray) => Omit<EventCalendarSignal, "raw" | "start" | "end">,
  target: CandidateSignal[],
): void {
  for (const match of text.matchAll(expression)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const signal = toSignal(match);
    target.push({
      ...signal,
      raw: cleanRaw(raw),
      start,
      end: start + raw.length,
      priority,
    });
  }
}

/**
 * Extracts literal calendar expressions from source text only.
 *
 * It does not decide that a matched date is an event date, registration deadline,
 * publication date, or any other semantic field. It also does not resolve relative
 * words such as "завтра" against the post timestamp.
 */
export function extractEventCalendarSignals(text: string): readonly EventCalendarSignal[] {
  const source = text.normalize("NFC");
  const candidates: CandidateSignal[] = [];

  addMatches(
    source,
    new RegExp(`\\b([0-3]?\\d)\\s*[-–—]\\s*([0-3]?\\d)\\s+(${MONTH_PATTERN})(?:\\s+(20\\d{2})(?:\\s*(?:г(?:ода)?\\.?))?)?`, "giu"),
    60,
    (match) => ({
      kind: "date_range",
      normalizedKey: `range:${match[4] ?? "?"}-${MONTHS[match[3].toLocaleLowerCase("ru-RU")]}-${padDay(match[1])}-${padDay(match[2])}`,
    }),
    candidates,
  );

  addMatches(
    source,
    new RegExp(`\\b([0-3]?\\d)\\s+(${MONTH_PATTERN})(?:\\s+(20\\d{2})(?:\\s*(?:г(?:ода)?\\.?))?)?`, "giu"),
    50,
    (match) => ({
      kind: "day_month",
      normalizedKey: `date:${match[3] ?? "?"}-${MONTHS[match[2].toLocaleLowerCase("ru-RU")]}-${padDay(match[1])}`,
    }),
    candidates,
  );

  addMatches(
    source,
    /\b([0-3]?\d)[./]([01]?\d)(?:[./](20\d{2}))?\b/gu,
    50,
    (match) => ({
      kind: "numeric_date",
      normalizedKey: `date:${match[3] ?? "?"}-${match[2].padStart(2, "0")}-${padDay(match[1])}`,
    }),
    candidates,
  );

  addMatches(
    source,
    /\b([01]?\d|2[0-3]):([0-5]\d)\b(?:\s*\(\s*мск\s*\))?/giu,
    30,
    (match) => ({
      kind: "time",
      normalizedKey: `time:${match[1].padStart(2, "0")}:${match[2]}`,
    }),
    candidates,
  );

  addMatches(
    source,
    /\b(сегодня|завтра|послезавтра)\b/giu,
    20,
    (match) => ({
      kind: "relative_day",
      normalizedKey: `relative:${match[1].toLocaleLowerCase("ru-RU")}`,
    }),
    candidates,
  );

  addMatches(
    source,
    /\b(20\d{2})(?:\s*(?:г(?:од(?:а|у|ом|е)?|\.)?))?\b/giu,
    10,
    (match) => ({
      kind: "year",
      normalizedKey: `year:${match[1]}`,
    }),
    candidates,
  );

  const accepted: CandidateSignal[] = [];
  for (const candidate of candidates.sort((a, b) => b.priority - a.priority || a.start - b.start || a.end - b.end)) {
    const overlapsHigherPriority = accepted.some((item) =>
      item.priority > candidate.priority && candidate.start < item.end && candidate.end > item.start,
    );
    if (!overlapsHigherPriority) accepted.push(candidate);
  }

  return accepted
    .sort((a, b) => a.start - b.start || b.priority - a.priority)
    .map(({ priority: _priority, ...signal }) => signal);
}

export function isExplicitDateSignal(signal: EventCalendarSignal): boolean {
  return signal.kind === "date_range" || signal.kind === "day_month" || signal.kind === "numeric_date";
}
