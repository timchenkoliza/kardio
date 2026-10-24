import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { ModeBadge } from "@/components/workspace/mode-badge";
import { AnswerModeCard, IdentityCard, InterestsEditor, SpecialtyCard } from "@/components/workspace/profile-settings";
import { PartnerToggle, ResetSeenButton } from "@/components/workspace/settings-controls";
import { BackgroundChecksToggle, WatchlistEditor } from "@/components/workspace/watchlist-settings";
import { ShareLinksList } from "@/components/portal/share-result";
import { shareLinkView } from "@/server/agents/commands";
import { shareStore, sharingAvailable } from "@/server/sharing/store";
import { DRUGS } from "@/lib/portal/lexicon";
import { scheduleStatus } from "@/server/agents/scheduler";
import { formatDateRu } from "@/lib/agents/format";
import { computeAgentMetrics } from "@/lib/agents/metrics";
import type { SourceStanding } from "@/lib/agents/source-policy";
import { rowsByStanding, SOURCE_VALIDATION } from "@/server/agents/services/source-policy";
import { isSpecialty } from "@/lib/specialty";
import { countLabel } from "@/lib/agents/format";
import { nbsp } from "@/lib/ui/typography";
import { connectorRegistry } from "@/server/agents/connectors";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { memoryEvents } from "@/server/agents/telemetry";
import { loadProfile } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

const STANDING_GROUP_TITLE: Record<Exclude<SourceStanding, "unreviewed">, string> = {
  approved: "Рекомендованы врачами",
  conditional: "Рекомендованы с условием",
  reviewed_not_whitelisted: "Используются с пометкой «Требует сверки»",
  rejected: "Не используются как доказательство",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * Profile and settings: a surface of its own. The left column is the
 * physician's personal settings the product reads (identity, specialty,
 * topics, source priorities, default answer mode); the right column is what
 * the product does with them and what it can read today. Administration
 * lives under /admin and never here.
 */
export default async function SettingsPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const sessionId = await pageSession(specialty);
  const profile = await loadProfile(sessionId, specialty);
  const validation = rowsByStanding();
  const connectors = connectorRegistry();
  const metrics = computeAgentMetrics(sessionId ? memoryEvents(sessionId) : []);
  const store = workspaceStore();
  const storage = store.kind;
  const [materials, runs] = sessionId ? await Promise.all([store.listMaterials(sessionId, specialty), store.listRuns(sessionId, specialty, undefined, 200)]) : [[], []];
  const questions = runs.filter(run => run.input.text && run.trigger !== "schedule_catchup" && run.trigger !== "configuration").length;
  // Background checks run only with durable storage and a configured scheduler; otherwise they catch up on visit.
  const schedulerConfigured = storage === "postgres" && Boolean(process.env.CRON_SECRET?.trim());
  const schedule = schedulerConfigured && sessionId ? await scheduleStatus(sessionId, specialty).catch(() => null) : null;
  const sharing = sharingAvailable();
  const shareLinks = sharing && sessionId ? await shareStore().list(sessionId, specialty).then(records => records.map(shareLinkView)).catch(() => []) : [];
  const backgroundLine = !schedulerConfigured
    ? (storage === "memory" ? "Фоновые проверки выключены: постоянное хранилище не подключено. Агенты обновляют подборку, когда вы открываете портал." : "Расписание сервера не настроено. Агенты обновляют подборку, когда вы открываете портал.")
    : profile.backgroundPaused ? "Фоновые проверки на паузе."
    : schedule?.nextCheckAt ? `Следующая проверка — ${formatDateRu(schedule.nextCheckAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) ?? schedule.nextCheckAt}${schedule.lastCheckedAt ? `; последняя — ${formatDateRu(schedule.lastCheckedAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}` : ""}.`
    : "Проверки начнутся после выбора тем или препаратов.";

  return <div className="ws-page ws-settings" id="profile">
    <header className="ws-page-head">
      <h1>{nbsp("Профиль и настройки")}</h1>
      <p>Специальность, темы и источники уточняют подборку «Для вас», подсказки и порядок источников в ответах. Настраивать необязательно: ответы и подборка работают и без этого.</p>
    </header>

    <div className="pt-profile">
      <div className="pt-profile-column">
        <IdentityCard identity={profile.identity} specialty={specialty} />
        <SpecialtyCard specialty={specialty} />
        <InterestsEditor specialty={specialty} interests={profile.interests} />
        <AnswerModeCard answerMode={profile.answerMode} />
      </div>

      <div className="pt-profile-column is-secondary">
        <section className="pt-profile-card" aria-labelledby="pt-usage-title">
          <h2 id="pt-usage-title">{nbsp("Как это работает для вас")}</h2>
          <dl className="ws-metrics">
            <div><dt>Мои материалы</dt><dd><Link className="ws-text-link" href={`/${specialty}/materials`}>{countLabel(materials.length, ["материал", "материала", "материалов"])}</Link></dd></div>
            <div><dt>Вопросов задано</dt><dd>{questions}</dd></div>
            <div><dt>Запусков завершено</dt><dd>{metrics.runsCompleted} из {metrics.runsStarted}</dd></div>
            <div><dt>Открыто источников</dt><dd>{percent(metrics.evidenceCtr)}</dd></div>
            <div><dt>Сохранено находок</dt><dd>{percent(metrics.saveRate)}</dd></div>
          </dl>
        </section>

        <section className="pt-profile-card" id="watchlist" aria-labelledby="ws-watchlist-title">
          <h2 id="ws-watchlist-title">{nbsp("Мои препараты")}</h2>
          <WatchlistEditor watchlist={profile.watchlist} options={DRUGS.map(drug => ({ inn: drug.inn, ru: drug.ru }))} />
        </section>

        <section className="pt-profile-card" id="background" aria-labelledby="ws-background-title">
          <h2 id="ws-background-title">{nbsp("Фоновые проверки")}</h2>
          <BackgroundChecksToggle paused={profile.backgroundPaused} available={schedulerConfigured} />
          <p className="ws-muted" data-background={schedulerConfigured ? (profile.backgroundPaused ? "paused" : "on") : "visit_only"}>{nbsp(backgroundLine)}</p>
          {schedule?.lastError && !profile.backgroundPaused && <p className="ws-muted">{nbsp(`Последняя проверка завершилась не полностью: ${schedule.lastError}. Повторим автоматически.`)}</p>}
        </section>

        <section className="pt-profile-card" id="shared" aria-labelledby="ws-shared-title">
          <h2 id="ws-shared-title">{nbsp("Ссылки, которыми я поделился")}</h2>
          {sharing
            ? <ShareLinksList links={shareLinks} now={new Date().toISOString()} />
            : <p className="ws-muted">{nbsp("Ссылки недоступны: постоянное хранилище не подключено, и ссылка не открылась бы на другом устройстве.")}</p>}
          <p className="ws-muted">{nbsp("По ссылке открывается копия материала на момент, когда вы им поделились: заголовок, краткий текст и источники. Ваши файлы, заметки и партнёрские материалы по ссылке не публикуются.")}</p>
        </section>

        <section className="pt-profile-card" id="partner" aria-labelledby="ws-partner-settings">
          <h2 id="ws-partner-settings">{nbsp("Партнёрские материалы")}</h2>
          <PartnerToggle enabled={profile.partnerContent} />
        </section>

        <section className="pt-profile-card" id="sources" aria-labelledby="ws-connectors-title">
          <h2 id="ws-connectors-title">{nbsp("Источники и подключения")}</h2>
          <p>Что продукт действительно умеет читать и делать сейчас. «Онлайн» — запрос к источнику в момент вопроса; «Снимок» — реальные данные, собранные из источника на указанную дату; «Не подключено» — продукт прямо говорит, что не может это сделать, и даёт ссылку для самостоятельной проверки.</p>
          <ul className="ws-connectors">{connectors.map(connector => <li key={connector.id}>
            <div><strong>{connector.name}</strong><span>{connector.description}</span><small>{connector.limitations}</small></div>
            <ModeBadge mode={connector.mode} origin={connector.dataOrigin} snapshotAt={connector.snapshotAt} />
          </li>)}</ul>
        </section>

        <section className="pt-profile-card ws-validation" aria-labelledby="ws-validation-title">
          <h2 id="ws-validation-title">{nbsp("Источники, проверенные врачами")}</h2>
          <p>{nbsp(`Список обновлён ${formatDateRu(SOURCE_VALIDATION.updatedAt) ?? SOURCE_VALIDATION.updatedAt}. Ответы поднимают рекомендованные источники выше, не используют отклонённые как доказательство, а выводы из остальных помечают «Требует сверки».`)}</p>
          {(["approved", "conditional", "reviewed_not_whitelisted", "rejected"] as const).map(standing => <details key={standing} open={standing === "approved"}>
            <summary>{STANDING_GROUP_TITLE[standing]} · {validation[standing].length}</summary>
            <ul>{validation[standing].map(row => <li key={`${row.host}-${row.brand}`}><strong>{row.brand}</strong><span>{row.host}{row.condition ? ` · ${row.condition}` : ""}</span>{row.note && <span>{row.note}</span>}</li>)}</ul>
          </details>)}
        </section>

        <section className="pt-profile-card" aria-labelledby="ws-privacy-title">
          <h2 id="ws-privacy-title">{nbsp("Данные и приватность")}</h2>
          <ul className="ws-plain-list">
            <li>Вход не нужен: рабочее пространство привязано к этому браузеру.</li>
            <li>Ваши материалы видите только вы. Другим пользователям они недоступны.</li>
            <li>Персональные данные в запросах и файлах маскируются до обработки. Медицинские изображения не принимаются и не интерпретируются.</li>
            <li>Действия вне продукта — календарь, письма, регистрация — выполняются только после вашего подтверждения.</li>
            {storage === "memory" && <li>Сейчас данные хранятся без постоянной базы: настройки сохраняются в браузере, а материалы могут пропасть при обновлении сервиса.</li>}
          </ul>
        </section>

        <section className="pt-profile-card" aria-labelledby="ws-demo-title">
          <h2 id="ws-demo-title">Демонстрация</h2>
          <p>Отметки «новое» считаются от вашего прошлого визита. Чтобы показать механику ещё раз, можно сбросить отметки просмотра.</p>
          <ResetSeenButton />
          <p className="ws-legacy-link"><Link href={`/${specialty}/agents`}>Агенты и фоновые проверки для «Для вас»<ArrowUpRight size={14} aria-hidden="true" /></Link></p>
          {(specialty === "cardiology" || specialty === "oncology") && <p className="ws-legacy-link"><Link href={`/${specialty}/legacy`}>Предыдущая версия интерфейса (архив)<ArrowUpRight size={14} aria-hidden="true" /></Link></p>}
        </section>
      </div>
    </div>
  </div>;
}
