import type { SpecialtyId } from "@/lib/domain/types";

/**
 * What a recipient of a shared link sees: a frozen copy of one result made at
 * the moment of sharing. It holds no session, library or profile data.
 */
export interface SharedSource {
  title: string;
  url: string | null;
  publisher: string | null;
  date: string | null;
  /** Verification status of the evidence at the moment of sharing, as an editorial label. */
  verification: string | null;
}

export interface SharedSnapshot {
  schema: "kardio.shared/1";
  kind: "result";
  specialty: SpecialtyId;
  /** Physician-facing type of the material («Справка по препарату», «Исследование», …). */
  typeLabel: string;
  title: string;
  /** Short text of the result, never longer than the original summary. */
  summary: string;
  sources: SharedSource[];
  sharedAt: string;
}

export interface ShareLinkView {
  token: string;
  url: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  openCount: number;
}
