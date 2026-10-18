"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { StateCommand, UserState, SpecialtyId } from "@/lib/domain/types";

type EventData = { contentId?: string; sourceId?: string; rankPosition?: number; currentness?: string };
interface ProductContextValue {
  state: UserState;
  pending: boolean;
  mutate: (command: StateCommand) => Promise<boolean>;
  track: (event: string, data?: EventData) => void;
}
const ProductContext = createContext<ProductContextValue | null>(null);
export function ProductProvider({ initialState, specialty, children }: { initialState: UserState; specialty: SpecialtyId; children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const mutate = useCallback(async (command: StateCommand) => {
    if (locked.current) return false;
    locked.current = true;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      if (!response.ok) {
        let apiMessage = "Не удалось сохранить изменение. Попробуйте ещё раз.";
        try {
          const payload = await response.json() as { error?: unknown };
          if (typeof payload.error === "string" && payload.error.trim()) apiMessage = payload.error;
        } catch {
          // Keep the bounded user-facing fallback when the response is not JSON.
        }
        throw new Error(apiMessage);
      }
      const next: UserState = await response.json();
      setState(next);
      return true;
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Не удалось сохранить изменение. Попробуйте ещё раз.");
      return false;
    } finally {
      locked.current = false;
      setPending(false);
    }
  }, []);
  const track = useCallback((event: string, data: EventData = {}) => {
    void fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, specialty, shell: state.shell, ...data }), keepalive: true }).catch(() => undefined);
  }, [specialty, state.shell]);
  return <ProductContext.Provider value={{ state, pending, mutate, track }}>{children}{message && <div className="toast error-toast" role="alert"><span>{message}</span><button aria-label="Закрыть сообщение" onClick={() => setMessage("")}>×</button></div>}</ProductContext.Provider>;
}
export function useProduct() {
  const context = useContext(ProductContext);
  if (!context) throw new Error("ProductProvider is required");
  return context;
}
