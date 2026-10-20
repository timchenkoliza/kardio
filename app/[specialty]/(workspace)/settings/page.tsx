import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { InterestsSetup } from "@/components/workspace/interests-setup";
import { ModeBadge } from "@/components/workspace/mode-badge";
import { PartnerToggle, ResetSeenButton } from "@/components/workspace/settings-controls";
import { computeAgentMetrics } from "@/lib/agents/metrics";
import { isSpecialty } from "@/lib/specialty";
import { connectorRegistry } from "@/server/agents/connectors";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { memoryEvents } from "@/server/agents/telemetry";
import { loadProfile } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default async function SettingsPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const sessionId = await pageSession(specialty);
  const profile = await loadProfile(sessionId, specialty);
  const connectors = connectorRegistry();
  const metrics = computeAgentMetrics(sessionId ? memoryEvents(sessionId) : []);
  const storage = workspaceStore().kind;

  return <div className="ws-page ws-settings">
    <header className="ws-page-head">
      <h1>Настройки</h1>
      <p>Общие темы и источники наследуют все агенты. Отдельного агента можно донастроить на его странице.</p>
    </header>

    <InterestsSetup specialty={specialty} interests={profile.interests} mode="settings" />

    <section className="ws-section ws-card-block" aria-labelledby="ws-partner-settings">
      <h2 id="ws-partner-settings" className="ws-section-title">Партнёрские материалы</h2>
      <PartnerToggle enabled={profile.partnerContent} />
    </section>

    <section className="ws-section ws-card-block" id="sources" aria-labelledby="ws-connectors-title">
      <h2 id="ws-connectors-title" className="ws-section-title">Источники и подключения</h2>
      <p className="ws-muted">Что агенты действительно умеют читать и делать сейчас. «Снимок» — реальные данные, собранные из источника на указанную дату; «Не подключено» — агент честно сообщает, что не может это сделать.</p>
      <ul className="ws-connectors">{connectors.map(connector => <li key={connector.id}>
        <div><strong>{connector.name}</strong><span>{connector.description}</span><small>{connector.limitations}</small></div>
        <ModeBadge mode={connector.mode} origin={connector.dataOrigin} snapshotAt={connector.snapshotAt} />
      </li>)}</ul>
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="ws-privacy-title">
      <h2 id="ws-privacy-title" className="ws-section-title">Данные и приватность</h2>
      <ul className="ws-plain-list">
        <li>Вход не нужен: рабочее пространство привязано к этому браузеру.</li>
        <li>Ваши материалы видите только вы. Агенты других пользователей их не используют.</li>
        <li>Персональные данные в запросах и файлах маскируются до обработки. Медицинские изображения не принимаются и не интерпретируются.</li>
        <li>Действия вне продукта — календарь, письма, регистрация — выполняются только после вашего подтверждения.</li>
        {storage === "memory" && <li>Сейчас данные хранятся без постоянной базы: настройки агентов сохраняются в браузере, а материалы могут пропасть при обновлении сервиса.</li>}
      </ul>
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="ws-metrics-title">
      <h2 id="ws-metrics-title" className="ws-section-title">Как работают агенты для вас</h2>
      <dl className="ws-metrics">
        <div><dt>Запусков завершено</dt><dd>{metrics.runsCompleted} из {metrics.runsStarted}</dd></div>
        <div><dt>Открыто источников</dt><dd>{percent(metrics.evidenceCtr)}</dd></div>
        <div><dt>Сохранено находок</dt><dd>{percent(metrics.saveRate)}</dd></div>
        <div><dt>Выполнено действий</dt><dd>{metrics.externalActionsSucceeded} из {metrics.externalActionsStarted}</dd></div>
        <div><dt>Сэкономлено, оценка</dt><dd>≈ {metrics.estimatedMinutesSaved} мин</dd></div>
      </dl>
      <p className="ws-muted">Оценка времени — условная норма ручной работы на один полезный запуск агента.</p>
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="ws-demo-title">
      <h2 id="ws-demo-title" className="ws-section-title">Демонстрация</h2>
      <p className="ws-muted">Счётчики «с прошлого визита» считаются от момента, когда вы последний раз открывали агента. Чтобы показать механику ещё раз, можно сбросить отметки просмотра.</p>
      <ResetSeenButton />
      <p className="ws-legacy-link"><Link href={`/${specialty}/legacy`}>Предыдущая версия интерфейса (архив)<ArrowUpRight size={14} aria-hidden="true" /></Link></p>
    </section>
  </div>;
}
