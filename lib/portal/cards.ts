import type { DataOrigin } from "@/lib/agents/types";

/**
 * «Для вас»: one card contract for every kind of professional item, so the
 * physician never perceives «outputs of seven agents».
 */
export type ForYouKind = "publication" | "guideline" | "drug_signal" | "event" | "learning" | "saved_topic" | "catalog" | "partner";

/** Internal capability-state taxonomy; the UI translates it into physician language. */
export type CapabilityState = "LIVE" | "SNAPSHOT" | "DERIVED" | "MOCK" | "UNAVAILABLE" | "BROKEN" | "UNVERIFIED";

export interface ForYouCard {
  id: string;
  kind: ForYouKind;
  /** Short type label: «Новая публикация», «Рекомендации», «Событие»… */
  label: string;
  /** What happened / what this is. */
  title: string;
  summary: string | null;
  /** Why it matters — only when a source-backed reason exists, never invented. */
  whyItMatters: string | null;
  /** Why this physician sees it. */
  whyShown: string;
  source: { name: string; url: string | null; state: CapabilityState; freshness: string };
  /** ISO date of the underlying change, when known. */
  date: string | null;
  topic: string | null;
  isNew: boolean;
  primary: { label: string; href: string; external: boolean };
  next: { label: string; href: string; external: boolean } | null;
  /** Agent result id behind the card (for save/open tracking). */
  resultId: string | null;
  /** Partner material: always disclosed in words. */
  partner: { sponsor: string; disclosure: string; example: boolean } | null;
}

export function stateForOrigin(origin: DataOrigin | null | undefined): CapabilityState {
  switch (origin) {
    case "runtime_api": return "LIVE";
    case "curated_snapshot":
    case "catalog_snapshot": return "SNAPSHOT";
    case "user_content": return "LIVE";
    case "synthetic_fixture": return "MOCK";
    default: return "UNVERIFIED";
  }
}

export const STATE_LABEL: Record<CapabilityState, string> = {
  LIVE: "Онлайн",
  SNAPSHOT: "Снимок",
  DERIVED: "Собрано из источников",
  MOCK: "Пример формата",
  UNAVAILABLE: "Не подключено",
  BROKEN: "Не работает",
  UNVERIFIED: "Не проверено",
};
