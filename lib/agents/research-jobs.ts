import type { ResearchRunOptions } from "./research-options";
import type { SpecialtyId } from "@/lib/domain/types";

export const RESEARCH_JOB_STATUSES = ["queued", "running", "completed", "partial", "failed", "blocked"] as const;
export type ResearchJobStatus = (typeof RESEARCH_JOB_STATUSES)[number];

export interface ResearchJob {
  id: string;
  specialty: SpecialtyId;
  question: string;
  options: ResearchRunOptions;
  status: ResearchJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  runId: string | null;
  resultCount: number;
  error: string | null;
}

export function isActiveResearchJob(job: Pick<ResearchJob, "status">): boolean {
  return job.status === "queued" || job.status === "running";
}

export function isFinishedResearchJob(job: Pick<ResearchJob, "status">): boolean {
  return !isActiveResearchJob(job);
}
