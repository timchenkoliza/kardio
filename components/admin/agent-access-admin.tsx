"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Shield, UserRoundCog } from "lucide-react";
import {
  ACCESS_SUBJECTS,
  DEFAULT_AGENT_ACCESS_POLICY,
  PRODUCT_AGENT_IDS,
  entitlementForSubject,
  type AccessSubjectId,
  type AgentAccessPolicy,
  type ProductAgentId,
} from "@/lib/access/agent-entitlements";

const AGENT_LABELS: Record<ProductAgentId, string> = {
  whats_new: "Что нового",
  guidelines: "Рекомендации",
  drugs: "Препараты",
  research: "Исследовать тему",
  events: "События",
  learning: "Обучение",
  materials: "Материалы",
  content_studio: "Content Studio",
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
      if (!response.ok) throw new Error("Не удалось сохранить preview-policy");
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
      if (!response.ok) throw new Error("Не удалось сбросить preview-policy");
      setActive("physician_demo");
      setPolicy(DEFAULT_AGENT_ACCESS_POLICY);
      router.refresh();
      setMessage("Preview overrides сброшены");
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
          <h2 id="access-current-user" className="ws-section-title">Кого сейчас имитирует Preview</h2>
          <p className="ws-muted">Это только demo impersonation для проверки UX. В production пользователь и workspace должны приходить из доверенной identity-системы.</p>
        </div>
      </div>
      <div className="ws-result-actions">
        {ACCESS_SUBJECTS.map(subject => <button key={subject.id} type="button" className={active === subject.id ? "ws-button is-primary" : "ws-button"} disabled={!mutable || pending} onClick={() => void switchSubject(subject.id)}>
          <UserRoundCog size={14} aria-hidden="true" />{subject.label}{active === subject.id ? <Check size={13} aria-hidden="true" /> : null}
        </button>)}
      </div>
    </section>

    <section className="ws-section ws-card-block" aria-labelledby="access-matrix-title">
      <div className="ws-section-head">
        <div>
          <h2 id="access-matrix-title" className="ws-section-title">Agent entitlements</h2>
          <p className="ws-muted">Строка — конкретный workspace-пользователь/группа, колонка — агент. Ячейки без grant нельзя включить этим demo-admin: сначала должен существовать допустимый policy contract.</p>
        </div>
        <button type="button" className="ws-button is-quiet" disabled={!mutable || pending} onClick={() => void reset()}><RotateCcw size={14} aria-hidden="true" />Сбросить demo</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead><tr><th style={{ textAlign: "left", padding: 10 }}>Кому</th>{PRODUCT_AGENT_IDS.map(agentId => <th key={agentId} style={{ textAlign: "center", padding: 10, fontWeight: 600 }}>{AGENT_LABELS[agentId]}</th>)}</tr></thead>
          <tbody>{rows.map(({ subject, grants }) => <tr key={subject.id}>
            <th style={{ textAlign: "left", padding: 10, verticalAlign: "top" }}><strong>{subject.label}</strong><div className="ws-muted">{subject.role} · {subject.homeSurface}</div></th>
            {grants.map(({ agentId, entitlement }) => <td key={agentId} style={{ textAlign: "center", padding: 10, verticalAlign: "top" }}>
              {entitlement ? <label style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: mutable ? "pointer" : "default" }}>
                <input type="checkbox" checked={entitlement.enabled} disabled={!mutable || pending} onChange={event => void toggle(subject.id, agentId, event.target.checked)} />
                <small>{entitlement.capabilities.join(" · ")}</small>
              </label> : <span className="ws-muted">—</span>}
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="ws-muted"><Shield size={13} aria-hidden="true" /> Preview overrides хранятся только в HttpOnly cookie этого браузера и игнорируются в production.</p>
      {message && <p role="status" className="ws-success">{message}</p>}
    </section>
  </>;
}
