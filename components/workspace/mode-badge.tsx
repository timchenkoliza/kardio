import type { DataOrigin, IntegrationMode } from "@/lib/agents/types";
import { formatDateRu } from "@/lib/agents/format";

const MODE_LABEL: Record<IntegrationMode, string> = { LIVE: "Подключено", MOCK: "Демо-данные", UNAVAILABLE: "Не подключено" };

export function ModeBadge({ mode, origin, snapshotAt }: { mode: IntegrationMode; origin?: DataOrigin; snapshotAt?: string | null }) {
  let label = MODE_LABEL[mode];
  if (mode === "LIVE" && origin === "runtime_api") label = "Онлайн";
  if (origin === "user_content") label = "Ваши данные";
  if (mode === "LIVE" && (origin === "curated_snapshot" || origin === "catalog_snapshot")) label = `Снимок${snapshotAt ? ` ${formatDateRu(snapshotAt, { day: "numeric", month: "short" }) ?? ""}` : ""}`;
  return <span className={`ws-mode ws-mode-${mode.toLowerCase()}`} data-mode={mode}>{label}</span>;
}
