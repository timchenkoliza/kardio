import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import { isSpecialty } from "@/lib/specialty";
import { getRequestAccessState } from "@/server/access/request-access";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";
import { loadProfile } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children, params }: { children: ReactNode; params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();

  const access = await getRequestAccessState();
  if (access.subject.role === "pharma" || access.subject.role === "editorial") redirect(`/${specialty}/pharma`);

  const sessionId = await pageSession(specialty);
  const [pendingActions, profile] = await Promise.all([
    sessionId ? workspaceStore().listActions(sessionId, specialty).then(actions => actions.filter(action => action.status === "pending_confirmation").length) : Promise.resolve(0),
    loadProfile(sessionId, specialty),
  ]);
  return <WorkspaceFrame specialty={specialty} pendingActions={pendingActions} identity={profile.identity}>{children}</WorkspaceFrame>;
}
