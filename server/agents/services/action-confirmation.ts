import { connectorById } from "../connectors";
import type { ActionKind, ActionRequest, AgentId, AgentResult } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";

/**
 * ActionConfirmationService — every action that leaves the product (calendar,
 * email, registration, purchase, publishing, opening an external page from an
 * agent result) is prepared first and executed only after explicit
 * confirmation. "Prepared" and "executed" are separate states.
 */

const INTEGRATIONS: Record<ActionKind, { connectorId: string; note: string }> = {
  calendar_write: { connectorId: "calendar-ics", note: "Прямой записи в ваш календарь нет: после подтверждения скачается файл .ics с напоминаниями за сутки и за час" },
  email: { connectorId: "email", note: "Отправка писем не подключена: после подтверждения откроется черновик в вашей почтовой программе" },
  registration: { connectorId: "rko-account", note: "Регистрация от вашего имени не подключена: после подтверждения откроется страница регистрации организатора" },
  purchase: { connectorId: "none", note: "Покупки агенты не совершают" },
  publishing: { connectorId: "none", note: "Публикация от вашего имени не подключена" },
  external_link: { connectorId: "web", note: "Откроется внешняя страница источника" },
};

export function prepareAction(args: {
  specialty: SpecialtyId;
  kind: ActionKind;
  title: string;
  description: string;
  effect: string;
  agentId: AgentId | null;
  results: readonly AgentResult[];
  payload?: ActionRequest["payload"];
  now: string;
}): ActionRequest {
  const integration = INTEGRATIONS[args.kind];
  const connector = connectorById(integration.connectorId);
  const unavailable = args.kind === "purchase" || args.kind === "publishing";
  return {
    id: `act-${crypto.randomUUID()}`,
    specialty: args.specialty,
    kind: args.kind,
    status: unavailable ? "unavailable" : "pending_confirmation",
    title: args.title.slice(0, 200),
    description: args.description.slice(0, 600),
    agentId: args.agentId,
    resultIds: args.results.map(result => result.id),
    effect: args.effect,
    integration: { connectorId: integration.connectorId, mode: connector?.mode ?? "UNAVAILABLE", note: integration.note },
    payload: args.payload ?? {},
    artifactUrl: null,
    createdAt: args.now,
    decidedAt: unavailable ? args.now : null,
    completedAt: null,
  };
}

export function confirmAction(request: ActionRequest, now: string): ActionRequest {
  if (request.status !== "pending_confirmation") return request;
  const base = { ...request, decidedAt: now };
  switch (request.kind) {
    case "calendar_write":
      return { ...base, status: "completed", completedAt: now, artifactUrl: `/api/agents/actions/${encodeURIComponent(request.id)}/ics` };
    case "registration":
    case "external_link": {
      const url = typeof request.payload.url === "string" ? request.payload.url : null;
      return { ...base, status: url ? "handed_off" : "failed", completedAt: now, artifactUrl: url };
    }
    case "email": {
      const subject = typeof request.payload.subject === "string" ? request.payload.subject : request.title;
      const body = typeof request.payload.body === "string" ? request.payload.body : request.description;
      return { ...base, status: "handed_off", completedAt: now, artifactUrl: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}` };
    }
    default:
      return { ...base, status: "unavailable" };
  }
}

export function cancelAction(request: ActionRequest, now: string): ActionRequest {
  if (request.status !== "pending_confirmation") return request;
  return { ...request, status: "cancelled", decidedAt: now };
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(date: string): string {
  return date.slice(0, 10).replace(/-/g, "");
}

function nextDay(date: string): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/** Fold long lines at 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (Buffer.byteLength(current + char, "utf8") > (parts.length ? 74 : 75)) { parts.push(current); current = char; } else current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export interface IcsEvent {
  uid: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
  description: string;
  url: string | null;
}

/** Calendar file with all-day events and two reminders (the «будильник»). */
export function buildIcs(events: readonly IcsEvent[], now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Yandex Med Kardio//Agent workspace//RU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@kardio`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(event.startDate)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(event.endDate))}`,
      `SUMMARY:${icsEscape(event.title)}`,
      `DESCRIPTION:${icsEscape(event.description)}`,
    );
    if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push(
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(`Завтра: ${event.title}`)}`, "TRIGGER:-P1D", "END:VALARM",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(`Скоро начнётся: ${event.title}`)}`, "TRIGGER:-PT1H", "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function icsEventsFromResults(results: readonly AgentResult[]): IcsEvent[] {
  return results
    .filter(result => result.kind === "event" && typeof result.attributes.startDate === "string" && typeof result.attributes.endDate === "string")
    .map(result => ({
      uid: result.key,
      title: result.title,
      startDate: String(result.attributes.startDate),
      endDate: String(result.attributes.endDate),
      location: [result.attributes.city, result.attributes.format].filter(Boolean).join(" · ") || null,
      description: `${result.summary}\nИсточник: ${result.source.source}${result.source.sourceUrl ? ` — ${result.source.sourceUrl}` : ""}\nДаты проверьте у организатора.`,
      url: typeof result.attributes.registrationUrl === "string" ? result.attributes.registrationUrl : result.source.sourceUrl,
    }));
}
