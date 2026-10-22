import type { DataOrigin } from "@/lib/agents/types";
import type { PortalJob } from "@/lib/portal/jobs";
import type { TrustTone } from "@/lib/presentation/physician";
import type { ArtKey } from "@/lib/ui/feed-art";

/**
 * «Для вас»: one card contract for every kind of professional item, so the
 * physician never perceives «outputs of seven agents».
 */
export type ForYouKind = "publication" | "guideline" | "drug_signal" | "event" | "learning" | "saved_topic" | "catalog" | "partner" | "showcase";

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
  /** The whole card opens this internal page in the same tab. */
  href: string;
  /** Source wording (title, abstract line) kept for «Оригинал»; never shown first on the Russian surface. */
  original: { title: string; summary: string | null } | null;
  /** Russian topic tags. */
  tags: string[];
  /** Real image (licensed, matched to the subject) or in-house line art; null when nothing fits. */
  media: CardMedia | null;
  /** Editorial source label: «Надёжный источник», «Подборка редакции»… */
  trust: { label: string; tone: TrustTone };
  /** Scenarios launched in place with the card topic (the text travels in the request body). */
  scenarios: Array<{ label: string; job: PortalJob; text: string }>;
  /** Editorial selection shown when the live feed is short; never presented as new or live. */
  showcase: boolean;
}

export type CardMedia =
  | { kind: "image"; src: string; alt: string; credit: string | null }
  | { kind: "art"; art: ArtKey; alt: string; animated: boolean };

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
