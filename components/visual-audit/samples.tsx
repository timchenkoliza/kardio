"use client";

import { AnswerModeControl } from "@/components/portal/answer-mode-control";
import { PortalInput, type ComposerState } from "@/components/portal/portal-input";
import { UploadJobCard, type AnonymizerJob } from "@/components/workspace/anonymizer-tool";
import { ANSWER_MODES } from "@/lib/portal/answer-mode";

/** Interactive samples of the visual audit page (client side: the controls take handlers). */

const COMPOSER_STATES: ComposerState[] = ["idle", "focused", "typing", "submitting", "disabled", "error"];

export function ComposerSamples({ suggestions }: { suggestions: readonly string[] }) {
  return <div className="va-grid">
    {COMPOSER_STATES.map(state => <div key={state} className="va-sample" data-sample={`composer-${state}`}>
      <h3>{state}</h3>
      <PortalInput specialty="cardiology" inputId={`va-input-${state}`} forcedState={state} initialText={state === "typing" || state === "submitting" || state === "error" ? "Апиксабан: противопоказания и взаимодействия" : ""} suggestions={state === "idle" ? suggestions : []} showModes={state === "idle"} />
    </div>)}
  </div>;
}

export function ModeSamples() {
  const none = () => undefined;
  return <div className="va-grid">
    {ANSWER_MODES.map(mode => <div key={mode} className="va-sample" data-sample={`mode-${mode}`}>
      <h3>selected: {mode}</h3>
      <AnswerModeControl value={mode} onChange={none} name={`va-${mode}`} />
    </div>)}
    <div className="va-sample" data-sample="mode-hover">
      <h3>hover на «Режим исследования», selected «Полный ответ»</h3>
      <AnswerModeControl value="full" onChange={none} name="va-hover" hovered="research" />
    </div>
    <div className="va-sample va-reduced" data-sample="mode-reduced-motion">
      <h3>prefers-reduced-motion</h3>
      <AnswerModeControl value="full" onChange={none} name="va-reduced" />
    </div>
  </div>;
}

function job(status: AnonymizerJob["status"], extra: Partial<AnonymizerJob> = {}): AnonymizerJob {
  return { id: `va-${status}`, fileName: `выписка-${status}.txt`, fileType: "text/plain", size: 2048, createdAt: "2026-10-22T09:00:00.000Z", status, counts: {}, rulesApplied: [], needsReview: false, error: null, result: null, ...extra };
}

export function UploadSamples() {
  const none = () => undefined;
  return <div className="va-grid">
    <div className="va-sample" data-sample="upload-empty"><h3>empty</h3><UploadJobCard job={job("queued")} /></div>
    <div className="va-sample" data-sample="upload-processing"><h3>processing</h3><UploadJobCard job={job("processing")} /></div>
    <div className="va-sample" data-sample="upload-completed"><h3>completed</h3><UploadJobCard job={job("completed", { counts: { phone: 2, fio: 1 }, rulesApplied: ["email", "phone", "fio"], result: "ФИО: [REDACTED]" })} onDownload={none} onRetry={none} onStats={none} /></div>
    <div className="va-sample" data-sample="upload-failed"><h3>failed</h3><UploadJobCard job={job("failed", { error: "Формат не поддерживается: обрабатываются текстовые файлы TXT, MD и CSV" })} onRetry={none} /></div>
  </div>;
}
