import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { InterestsSetup } from "@/components/workspace/interests-setup";
import { ModeBadge } from "@/components/workspace/mode-badge";
import { PartnerToggle, ResetSeenButton } from "@/components/workspace/settings-controls";
import { formatDateRu } from "@/lib/agents/format";
import { computeAgentMetrics } from "@/lib/agents/metrics";
import type { SourceStanding } from "@/lib/agents/source-policy";
import { rowsByStanding, SOURCE_VALIDATION } from "@/server/agents/services/source-policy";
import { isSpecialty } from "@/lib/specialty";
import { connectorRegistry } from "@/server/agents/connectors";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { memoryEvents } from "@/server/agents/telemetry";
import { loadProfile } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

const STANDING_GROUP_TITLE: Record<Exclude<SourceStanding, "unreviewed">, string> = {
  approved: "Белый список",
  conditional: "Одобрены с условием",
  reviewed_not_whitelisted: "Проверены, но не в белом списке",
  rejected: "Отклонены врачами",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default async function SettingsPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const sessionId = await pageSession(specialty);
  const profile = await loadProfile(sessionId, specialty);
  const validation = rowsByStanding();
  const connectors = connectorRegistry();
  const metrics = computeAgentMetrics(sessionId ? memoryEvents(sessionId) : []);
  const storage = workspaceStore().kind;

  return <div className="ws-page ws-settings">
    <header className="ws-page-head">
      <h1>Настройки</h1>
      <p>Темы и источники уточняют подборку «Для вас» и порядок источников в ответах. Настраивать необязательно: ответы и подборка работают и без этого.</p>
    </header>

    <InterestsSetup specialty={specialty} interests={profile.interests} mode="settings" />

    <section className="ws-section ws-card-block" id="partner" aria-labelledby="ws-partner-settings">
      <h2 id="ws-partner-settings" className="ws-section-title">Партнёрские материалы</h2>
      <PartnerToggle enabled={profile.partnerContent} />
    </section>

    <section className="ws-section ws-card-block" id="sources" aria-labelledby="ws-connectors-title">
      <h2 id="ws-connectors-title" className="ws-section-title">Источники и подключения</h2>
      <p className="ws-muted">Что продукт действительно умеет читать и делать сейчас. «Онлайн» — запрос к источнику в момент вопроса; «Снимок» — реальные данные, собранные из источника на указанную дату; «Не подключено» — продукт прямо говорит, что не может это сделать, и даёт ссылку для самостоятельной проверки.</p>
      <ul className="ws-connectors">{connectors.map(connector => <li key={connector.id}>
        <div><strong>{connector.name}</strong><span>{connector.description}</span><small>{connector.limitations}</small></div>
        <ModeBadge mode={connector.mode} origin={connector.dataOrigin} snapshotAt={connector.snapshotAt} />
      </li>)}</ul>
    </section>

    <section className="ws-section ws-card-block ws-validation" aria-labelledby="ws-validation-title">
      <h2 id="ws-validation-title" className="ws-section-title">Источники, проверенные врачами</h2>
      <p className="ws-muted">{SOURCE_VALIDATION.title} · обновлено {formatDateRu(SOURCE_VALIDATION.updatedAt) ?? SOURCE_VALIDATION.updatedAt}. Ответы поднимают одобренные источники выше, не используют отклонённые как доказательство, а для источников вне белого списка показывают не больше чем «частично подтверждено».</p>
      {(["approved", "conditional", "reviewed_not_whitelisted", "rejected"] as const).map(standing => <details key={standing} open={standing === "approved"}>
        <summary>{STANDING_GROUP_TITLE[standing]} · {validation[standing].length}</summary>
        <ul>{validation[standing].map(row => <li key={`${row.host}-${row.brand}`}><strong>{row.brand}</strong><span>{row.host}{row.condition ? ` · ${row.condition}` : ""}</span>{row.note && <span>{row.note}</span>}</li>)}</ul>
      </details>)}
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="ws-privacy-title">
      <h2 id="ws-privacy-title" className="ws-section-title">Данные и приватность</h2>
      <ul className="ws-plain-list">
        <li>Вход не нужен: рабочее пространство привязано к этому браузеру.</li>
        <li>Ваши материалы видите только вы. Другим пользователям они недоступны.</li>
        <li>Персональные данные в запросах и файлах маскируются до обработки. Медицинские изображения не принимаются и не интерпретируются.</li>
        <li>Действия вне продукта — календарь, письма, регистрация — выполняются только после вашего подтверждения.</li>
        {storage === "memory" && <li>Сейчас данные хранятся без постоянной базы: настройки сохраняются в браузере, а материалы могут пропасть при обновлении сервиса.</li>}
      </ul>
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="ws-metrics-title">
      <h2 id="ws-metrics-title" className="ws-section-title">Как это работает для вас</h2>
      <dl className="ws-metrics">
        <div><dt>Запусков завершено</dt><dd>{metrics.runsCompleted} из {metrics.runsStarted}</dd></div>
        <div><dt>Открыто источников</dt><dd>{percent(metrics.evidenceCtr)}</dd></div>
        <div><dt>Сохранено находок</dt><dd>{percent(metrics.saveRate)}</dd></div>
        <div><dt>Выполнено действий</dt><dd>{metrics.externalActionsSucceeded} из {metrics.externalActionsStarted}</dd></div>
        <div><dt>Сэкономлено, оценка</dt><dd>≈ {metrics.estimatedMinutesSaved} мин</dd></div>
      </dl>
      <p className="ws-muted">Оценка времени — условная норма ручной работы на один полезный запрос.</p>
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="ws-demo-title">
      <h2 id="ws-demo-title" className="ws-section-title">Демонстрация</h2>
      <p className="ws-muted">Отметки «новое» считаются от вашего прошлого визита. Чтобы показать механику ещё раз, можно сбросить отметки просмотра.</p>
      <ResetSeenButton />
      <p className="ws-legacy-link"><Link href={`/${specialty}/agents`}>Фоновые проверки для «Для вас»<ArrowUpRight size={14} aria-hidden="true" /></Link></p>
      {(specialty === "cardiology" || specialty === "oncology") && <p className="ws-legacy-link"><Link href={`/${specialty}/legacy`}>Предыдущая версия интерфейса (архив)<ArrowUpRight size={14} aria-hidden="true" /></Link></p>}
    </section>
  </div>;
}
