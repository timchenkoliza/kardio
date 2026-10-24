"use client";

import { useEffect, useRef } from "react";
import type { ResearchJob } from "@/lib/agents/research-jobs";
import { isActiveResearchJob } from "@/lib/agents/research-jobs";
import type { SpecialtyId } from "@/lib/domain/types";
import { useWorkspace } from "./workspace-provider";

const RECENT_COMPLETION_MS = 24 * 60 * 60_000;

function notificationText(job: ResearchJob): { text: string; tone?: "error" } {
  const question = `${job.question.slice(0, 90)}${job.question.length > 90 ? "…" : ""}`;
  if (job.status === "completed") return { text: `Исследование готово: ${question}` };
  if (job.status === "partial") return { text: `Исследование готово частично: ${question}` };
  return { text: job.error ?? "Фоновое исследование не завершилось.", tone: "error" };
}

export function ResearchJobWatcher({ specialty }: { specialty: SpecialtyId }) {
  const { notify } = useWorkspace();
  const fallbackSeen = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const storageKey = `research-job-notified:${specialty}`;

    const readSeen = (): Set<string> => {
      try {
        // Shared by every tab of this browser: a finished review is announced once, not in each new tab.
        const raw = localStorage.getItem(storageKey);
        return new Set(raw ? JSON.parse(raw) as string[] : []);
      } catch {
        return new Set(fallbackSeen.current);
      }
    };

    const writeSeen = (seen: Set<string>) => {
      fallbackSeen.current = new Set(seen);
      try { localStorage.setItem(storageKey, JSON.stringify([...seen].slice(-40))); } catch { /* fallback ref is enough */ }
    };

    const poll = async () => {
      try {
        const response = await fetch(`/api/agents/research/background?specialty=${encodeURIComponent(specialty)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { jobs?: ResearchJob[] };
        if (!payload.jobs || cancelled) return;
        const seen = readSeen();
        const terminal = payload.jobs.filter(job => !isActiveResearchJob(job));
        const recentUnseen = terminal.find(job => {
          if (seen.has(job.id)) return false;
          const completedAt = new Date(job.completedAt ?? job.createdAt).getTime();
          return Number.isFinite(completedAt) && Date.now() - completedAt <= RECENT_COMPLETION_MS;
        });
        if (recentUnseen) {
          const message = notificationText(recentUnseen);
          // The announcement leads to the result, on the same page as from «История».
          notify(message.text, message.tone, recentUnseen.runId ? { href: `/${specialty}/ask?run=${encodeURIComponent(recentUnseen.runId)}`, label: "Открыть результат" } : undefined);
        }
        for (const job of terminal) seen.add(job.id);
        writeSeen(seen);
      } finally {
        if (!cancelled) timer = setTimeout(poll, 5000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [notify, specialty]);

  return null;
}
