import Link from "next/link";
import type { ReactNode } from "react";
import type { SpecialtyId } from "@/lib/domain/types";
import { BrandLockup } from "./workspace-frame";

/** Top bar for pages outside the physician workspace frame (partner cabinet, administration). */
export function StandaloneBar({ specialty = "cardiology", home, label, action }: { specialty?: SpecialtyId; home?: string; label: string; action?: { href: string; label: string; icon?: ReactNode } }) {
  return <header className="ws-partner-bar">
    <BrandLockup specialty={specialty} href={home} />
    <span className="ws-partner-bar-label">{label}</span>
    {action && <Link className="ws-text-link" href={action.href}>{action.icon}{action.label}</Link>}
  </header>;
}
