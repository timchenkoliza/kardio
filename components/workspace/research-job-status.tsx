"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import type { ResearchJob } from "@/lib/agents/research-jobs";
import { isActiveResearchJob } from "@/lib/agents/research-jobs";
import { researchViewQuery } from "@/lib/ui/physician-research-view";
import type { SpecialtyId } from "@/lib/domain/types";

const STATUS_COPY: Record<ResearchJob["status"], { title: string; text: string }> = {
  queued: { title: "Исследование в очереди", text: "Запуск принят. Можно перейти в другой раздел — выполнение продолжится на сервере." },
  running: { title: "Идёт исследование", text: "Источники собираются и проверяются. Можно уйти со страницы и вернуться позже." },
  completed: { title: "Исследование готово", text: "Результат сохранён в истории исследований." },
  partial: { title: "Исследование готово частично", text: "Часть источников была недоступна; доступные результаты сохранены." },
  failed: { title: "Исследование не завершилось", text: "Запуск остановился. Его можно запустить ещё раз с теми же настройками." },
  blocked: { title: "Запрос остановлен", text: "Проверка безопасности не разрешила запуск исследования." },
};

export function ResearchJobStatus({ job: initialJob, specialty }: { job: ResearchJob; specialty: SpecialtyId }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const copy = STATUS_COPY[job.status];
  const href = useMemo(() => job.runId
    ? `/${specialty}/agents/research?run=${encodeURIComponent(job.runId)}&${researchViewQuery(job.options)}`
    : null, [job, specialty]);

  const active = isActiveResearchJob(job);
  const jobId = job.id;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/agents/research/background?specialty=${encodeURIComponent(specialty)}&job=${encodeURIComponent(jobId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { job?: ResearchJob };
        if (!payload.job || cancelled) return;
        setJob(payload.job);
        if (payload.job.runId && !isActiveResearchJob(payload.job)) {
          router.replace(`/${specialty}/agents/research?run=${encodeURIComponent(payload.job.runId)}&${researchViewQuery(payload.job.options)}`);
          router.refresh();
          return;
        }
      } finally {
        if (!cancelled) timer = setTimeout(poll, 2500);
      }
    };

    timer = setTimeout(poll, 1200);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, jobId, router, specialty]);

  const icon = job.status === "queued" || job.status === "running"
    ? <Loader2 size={20} className="ws-spin" aria-hidden="true" />
    : job.status === "completed" || job.status === "partial"
      ? <CheckCircle2 size={20} aria-hidden="true" />
      : <TriangleAlert size={20} aria-hidden="true" />;

  return <section className={`ws-research-job is-${job.status}`} aria-live="polite">
    <div className="ws-research-job-icon">{icon}</div>
    <div className="ws-research-job-copy">
      <div className="ws-research-job-title-row"><h2>{copy.title}</h2></div>
      <p>{copy.text}</p>
      <strong>{job.question}</strong>
      {job.error && <p className="ws-research-job-error">{job.error}</p>}
      <div className="ws-research-job-actions">
        {href && <Link className="ws-button" href={href}>Открыть результат</Link>}
        {isActiveResearchJob(job) && <Link className="ws-text-link" href={`/${specialty}`}>На главное</Link>}
      </div>
    </div>
  </section>;
}
