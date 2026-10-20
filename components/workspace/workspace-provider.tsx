"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { ActionRequest, AgentId, Material } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";

export interface CommandResponse {
  ok: true;
  profileChanged: boolean;
  runId?: string;
  agentId?: AgentId;
  ran?: AgentId[];
  action?: ActionRequest;
  actions?: ActionRequest[];
  material?: Material;
  notices?: string[];
}

interface WorkspaceContextValue {
  specialty: SpecialtyId;
  pending: boolean;
  command: (body: Record<string, unknown>, options?: { refresh?: boolean; quiet?: boolean }) => Promise<CommandResponse | null>;
  upload: (form: FormData) => Promise<{ material: Material; notices: string[] } | null>;
  notify: (message: string, tone?: "info" | "error") => void;
  pendingAction: ActionRequest | null;
  setPendingAction: (action: ActionRequest | null) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) return payload.error;
  } catch {
    // fall through to the generic message
  }
  return "Не получилось выполнить действие. Попробуйте ещё раз.";
}

export function WorkspaceProvider({ specialty, children }: { specialty: SpecialtyId; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "info" | "error" } | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionRequest | null>(null);
  const inflight = useRef(0);

  const notify = useCallback((message: string, tone: "info" | "error" = "info") => setToast({ message, tone }), []);

  const command = useCallback(async (body: Record<string, unknown>, options: { refresh?: boolean; quiet?: boolean } = {}) => {
    inflight.current += 1;
    if (!options.quiet) setPending(true);
    try {
      const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ specialty, ...body }) });
      if (!response.ok) {
        if (!options.quiet) setToast({ message: await errorMessage(response), tone: "error" });
        return null;
      }
      const result = await response.json() as CommandResponse;
      if (result.notices?.length && !options.quiet) setToast({ message: result.notices[0], tone: "info" });
      if (options.refresh !== false) router.refresh();
      return result;
    } catch {
      if (!options.quiet) setToast({ message: "Нет связи с сервером. Проверьте подключение.", tone: "error" });
      return null;
    } finally {
      inflight.current -= 1;
      if (inflight.current === 0) setPending(false);
    }
  }, [router, specialty]);

  const upload = useCallback(async (form: FormData) => {
    setPending(true);
    try {
      form.set("specialty", specialty);
      const response = await fetch("/api/agents/materials/upload", { method: "POST", body: form });
      if (!response.ok) {
        setToast({ message: await errorMessage(response), tone: "error" });
        return null;
      }
      const result = await response.json() as { material: Material; notices: string[] };
      if (result.notices?.length) setToast({ message: result.notices[0], tone: "info" });
      router.refresh();
      return result;
    } catch {
      setToast({ message: "Не удалось загрузить файл.", tone: "error" });
      return null;
    } finally {
      setPending(false);
    }
  }, [router, specialty]);

  return <WorkspaceContext.Provider value={{ specialty, pending, command, upload, notify, pendingAction, setPendingAction }}>
    {children}
    {toast && <div className={`ws-toast ${toast.tone === "error" ? "is-error" : ""}`} role={toast.tone === "error" ? "alert" : "status"}>
      <span>{toast.message}</span>
      <button type="button" aria-label="Закрыть сообщение" onClick={() => setToast(null)}>×</button>
    </div>}
  </WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is required");
  return value;
}
