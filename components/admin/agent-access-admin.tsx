"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, UserRoundCog } from "lucide-react";
import {
  ACCESS_SUBJECTS,
  DEFAULT_AGENT_ACCESS_POLICY,
  PRODUCT_AGENT_IDS,
  entitlementForSubject,
  type AccessCapability,
  type AccessSubjectId,
  type AgentSurface,
  type AgentAccessPolicy,
  type ProductAgentId,
} from "@/lib/access/agent-entitlements";

const AGENT_LABELS: Record<ProductAgentId, string> = {
  reference: "Справка",
  whats_new: "Что нового",
  guidelines: "Рекомендации",
  drugs: "Препараты",
  research: "Разбор по исследованиям",
  events: "События",
  learning: "Обучение",
  materials: "Материалы",
  content_studio: "Студия контента",
};

const ROLE_SURFACE: Record<AgentSurface, string> = {
  physician_workspace: "Рабочее пространство врача",
  partner_workspace: "Кабинет партнёра",
  admin: "Администрирование",
};

const CAPABILITY_LABEL: Record<AccessCapability, string> = {
  view: "просмотр",
  run: "запуск",
  upload_source: "загрузка источников",
  edit_draft: "черновики",
  request_review: "отправка на проверку",
  approve: "одобрение",
  publish: "публикация",
};

export function AgentAccessAdmin({ initialPolicy, activeSubjectId, mutable }: {
  initialPolicy: AgentAccessPolicy;
  activeSubjectId: AccessSubjectId;
  mutable: boolean;
}) {
  const router = useRouter();
  const [policy, setPolicy] = useState(initialPolicy);
  const [active, setActive] = useState(activeSubjectId);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo(() => ACCESS_SUBJECTS.map(subject => ({ subject, grants: PRODUCT_AGENT_IDS.map(agentId => ({ agentId, entitlement: entitlementForSubject(policy, subject.id, agentId) })) })), [policy]);

  async function update(body: unknown) {
    if (!mutable || pending) return false;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/access", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("Не удалось сохранить");
      router.refresh();
      setMessage("Сохранено");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function switchSubject(subjectId: AccessSubjectId) {
    if (await update({ activeSubjectId: subjectId })) setActive(subjectId);
  }

  async function toggle(subjectId: AccessSubjectId, agentId: ProductAgentId, enabled: boolean) {
    const entitlement = entitlementForSubject(policy, subjectId, agentId);
    if (!entitlement) return;
    setPolicy(current => ({ ...current, entitlements: current.entitlements.map(item => item.subjectId === subjectId && item.agentId === agentId ? { ...item, enabled } : item) }));
    const ok = await update({ changes: [{ subjectId, agentId, enabled }] });
    if (!ok) setPolicy(initialPolicy);
  }

  async function reset() {
    if (!mutable || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/access", { method: "DELETE" });
      if (!response.ok) throw new Error("Не удалось сбросить");
      setActive("physician_demo");
      setPolicy(DEFAULT_AGENT_ACCESS_POLICY);
      router.refresh();
      setMessage("Доступы сброшены к исходным");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сброса");
    } finally {
      setPending(false);
    }
  }

  return <>
    <section className="ws-section ws-card-block" aria-labelledby="access-current-user">
      <div className="ws-section-head">
        <div>
          <h2 id="access-current-user" className="ws-section-title">Чьими глазами смотреть продукт</h2>
          <p className="ws-muted">Переключает роль для проверки интерфейса в этом браузере.</p>
        </div>
      </div>
      <div className="ws-chip-row" role="group" aria-label="Роль">
        {ACCESS_SUBJECTS.map(subject => <button key={subject.id} type="button" className={active === subject.id ? "ws-chip is-selected" : "ws-chip"} aria-pressed={active === subject.id} disabled={!mutable || pending} onClick={() => void switchSubject(subject.id)}>
          {active === subject.id ? <Check size={13} aria-hidden="true" /> : <UserRoundCog size={13} aria-hidden="true" />}{subject.label}
        </button>)}
      </div>
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="access-matrix-title">
      <div className="ws-section-head">
        <div>
          <h2 id="access-matrix-title" className="ws-section-title">Кому доступны агенты</h2>
          <p className="ws-muted">Строка — роль, столбец — агент. Пустая ячейка означает, что для роли доступ не предусмотрен.</p>
        </div>
        <button type="button" className="ws-button is-quiet" disabled={!mutable || pending} onClick={() => void reset()}><RotateCcw size={14} aria-hidden="true" />Сбросить</button>
      </div>
      <div className="ws-access-scroll">
        <table className="ws-access-table">
          <thead><tr><th scope="col">Роль</th>{PRODUCT_AGENT_IDS.map(agentId => <th key={agentId} scope="col">{AGENT_LABELS[agentId]}</th>)}</tr></thead>
          <tbody>{rows.map(({ subject, grants }) => <tr key={subject.id}>
            <th scope="row"><strong>{subject.label}</strong><span>{ROLE_SURFACE[subject.homeSurface]}</span></th>
            {grants.map(({ agentId, entitlement }) => <td key={agentId}>
              {entitlement ? <label className="ws-access-cell">
                <input type="checkbox" checked={entitlement.enabled} disabled={!mutable || pending} onChange={event => void toggle(subject.id, agentId, event.target.checked)} aria-label={`${subject.label}: ${AGENT_LABELS[agentId]}`} />
                <small>{entitlement.capabilities.map(capability => CAPABILITY_LABEL[capability]).join(", ")}</small>
              </label> : <span className="ws-muted" aria-label="Недоступно">—</span>}
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {message && <p role="status" className="ws-success">{message}</p>}
    </section>
  </>;
}
