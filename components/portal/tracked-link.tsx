"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ClientPortalEvent } from "@/lib/portal/metrics";
import type { PortalJob } from "@/lib/portal/jobs";
import { useWorkspace } from "@/components/workspace/workspace-provider";

/**
 * A link that reports a utility event (ids and categories only) without
 * delaying navigation. External links open in a new tab.
 */
export function TrackedLink({ href, external = false, events, job, resultId, resultKind, className, children, ariaLabel }: {
  href: string;
  external?: boolean;
  events: ClientPortalEvent[];
  job?: PortalJob;
  resultId?: string | null;
  resultKind?: string;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const { command } = useWorkspace();
  function report() {
    for (const event of events) void command({ action: "track", event, ...(job ? { job } : {}), ...(resultId && /^res-/.test(resultId) ? { resultId } : {}), ...(resultKind ? { resultKind } : {}) }, { quiet: true, refresh: false });
  }
  if (external) return <a className={className} href={href} target="_blank" rel="noreferrer" onClick={report} aria-label={ariaLabel}>{children}</a>;
  return <Link className={className} href={href} onClick={report} aria-label={ariaLabel}>{children}</Link>;
}
