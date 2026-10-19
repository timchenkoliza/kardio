"use client";

import { CalendarPlus, Mail } from "lucide-react";
import { useWorkspace } from "./workspace-provider";

/** Bulk next steps for a list of findings — prepared, then confirmed in one dialog. */
export function BulkActions({ resultIds, calendar = false, email = true }: { resultIds: string[]; calendar?: boolean; email?: boolean }) {
  const { command, setPendingAction, pending } = useWorkspace();
  if (!resultIds.length) return null;
  async function prepare(kind: "calendar_write" | "email") {
    const response = await command({ action: "prepareAction", kind, resultIds: resultIds.slice(0, 12) }, { refresh: false });
    if (response?.action) setPendingAction(response.action);
  }
  return <div className="ws-bulk">
    {calendar && <button type="button" className="ws-button" disabled={pending} onClick={() => void prepare("calendar_write")}><CalendarPlus size={15} aria-hidden="true" />Все в календарь с напоминаниями</button>}
    {email && <button type="button" className="ws-button is-quiet" disabled={pending} onClick={() => void prepare("email")}><Mail size={15} aria-hidden="true" />Письмо себе</button>}
  </div>;
}
