import "server-only";

import validation from "@/data/source-validation-b2d.json";
import type { SourceStanding } from "@/lib/agents/source-policy";

type ValidationRow = {
  host: string;
  path?: string;
  journal?: string;
  brand: string;
  decision: "confirmed" | "partial" | "refuted";
  whitelist: "yes" | "no" | "conditional" | "unspecified";
  note?: string;
};

export interface SourcePolicyEvaluation {
  standing: SourceStanding;
  label: string;
  note: string | null;
  matchedBrand: string | null;
}

const rows = (validation.sources ?? []) as ValidationRow[];

function standingFor(row: ValidationRow): SourceStanding {
  if (row.decision === "refuted") return "rejected";
  if (row.whitelist === "yes") return "approved";
  if (row.whitelist === "conditional") return "conditional";
  if (row.whitelist === "no" || row.decision === "partial" || row.decision === "confirmed") return "reviewed_not_whitelisted";
  return "unreviewed";
}

function labelFor(standing: SourceStanding): string {
  switch (standing) {
    case "approved": return "Одобрен врачами";
    case "conditional": return "Одобрен условно";
    case "reviewed_not_whitelisted": return "Проверен, но не в белом списке";
    case "rejected": return "Источник отклонён";
    case "unreviewed": return "Не проверен врачами";
  }
}

function normalizeHost(host: string): string {
  return host.toLocaleLowerCase("en-US").replace(/^www\./, "");
}

/** Shared source standing resolver based on the physician-validation registry. */
export function evaluateSourcePolicy(url: string | null): SourcePolicyEvaluation {
  if (!url) return { standing: "unreviewed", label: labelFor("unreviewed"), note: "URL не указан: источник нельзя сопоставить с врачебной валидацией.", matchedBrand: null };
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return { standing: "unreviewed", label: labelFor("unreviewed"), note: "Некорректный URL источника.", matchedBrand: null }; }

  const host = normalizeHost(parsed.hostname);
  const candidates = rows
    .filter(row => normalizeHost(row.host) === host)
    .filter(row => !row.path || parsed.pathname.toLocaleLowerCase("en-US").startsWith(row.path.toLocaleLowerCase("en-US")))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0));

  if (!candidates.length) return { standing: "unreviewed", label: labelFor("unreviewed"), note: "Источник отсутствует в таблице врачебной валидации B2D.", matchedBrand: null };

  const pathSpecific = candidates.find(row => row.path);
  const generic = candidates.find(row => !row.path && !row.journal);
  const row = pathSpecific ?? generic ?? candidates[0];
  const standing = standingFor(row);
  return { standing, label: labelFor(standing), note: row.note ?? null, matchedBrand: row.brand };
}
