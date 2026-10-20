"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Bot, ChevronDown, FolderOpen, LayoutGrid, Settings2 } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { WorkspaceProvider } from "./workspace-provider";
import { ActionConfirmDialog } from "./action-confirm-dialog";
import { ResearchJobWatcher } from "./research-job-watcher";

export type WorkspaceSection = "home" | "agents" | "materials" | "settings" | "content";

const NAV: Array<{ id: Exclude<WorkspaceSection, "content" | "settings">; label: string; short: string; path: string; icon: typeof LayoutGrid }> = [
  { id: "home", label: "Главное", short: "Главное", path: "", icon: LayoutGrid },
  { id: "agents", label: "Мои агенты", short: "Агенты", path: "/agents", icon: Bot },
  { id: "materials", label: "Мои материалы", short: "Материалы", path: "/materials", icon: FolderOpen },
];

export function sectionFromPath(pathname: string, specialty: string): WorkspaceSection {
  const rest = pathname.replace(new RegExp(`^/${specialty}`), "");
  if (rest.startsWith("/agents")) return "agents";
  if (rest.startsWith("/materials")) return "materials";
  if (rest.startsWith("/settings")) return "settings";
  if (rest.startsWith("/content")) return "content";
  return "home";
}

/** The beta lockup exactly as supplied by the design system (never retyped). */
function BrandLockup({ specialty }: { specialty: SpecialtyId }) {
  return <Link className="ws-brand" href={`/${specialty}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- static SVG lockup from the design system */}
    <img src="/brand/yandex-med-beta.svg" alt="Яндекс Мед β — главное" width={159} height={24} />
  </Link>;
}

function SpecialtySelect({ specialty, sectionPath }: { specialty: SpecialtyId; sectionPath: string }) {
  const router = useRouter();
  return <label className="ws-specialty">
    <span className="sr-only">Специальность</span>
    <select value={specialty} onChange={event => router.push(`/${event.target.value}${sectionPath}`)}>
      <option value="cardiology">Кардиология</option>
      <option value="oncology">Онкология</option>
    </select>
    <ChevronDown size={14} aria-hidden="true" />
  </label>;
}

export function WorkspaceFrame({ specialty, pendingActions = 0, children }: { specialty: SpecialtyId; pendingActions?: number; children: ReactNode }) {
  const section = sectionFromPath(usePathname() ?? `/${specialty}`, specialty);
  const sectionPath = section === "agents" ? "/agents" : section === "materials" ? "/materials" : section === "settings" ? "/settings" : "";

  return <WorkspaceProvider specialty={specialty}>
    <div className="ws-app" data-specialty={specialty}>
      <a className="skip-link" href="#ws-main">Перейти к содержанию</a>

      {/* Desktop: 280px structural sidebar */}
      <aside className="ws-sidebar">
        <BrandLockup specialty={specialty} />
        <SpecialtySelect specialty={specialty} sectionPath={sectionPath} />
        <nav className="ws-nav" aria-label="Основная навигация">
          {NAV.map(item => <Link key={item.id} href={`/${specialty}${item.path}`} className={section === item.id ? "ws-nav-item is-active" : "ws-nav-item"} aria-current={section === item.id ? "page" : undefined}>
            <item.icon size={17} aria-hidden="true" /><span>{item.label}</span>
            {item.id === "agents" && pendingActions > 0 && <span className="ws-nav-badge" aria-label={`Ждут подтверждения: ${pendingActions}`}>{pendingActions}</span>}
          </Link>)}
          <span className="ws-nav-divider" aria-hidden="true" />
          <Link href={`/${specialty}/settings`} className={section === "settings" ? "ws-nav-item is-active" : "ws-nav-item"} aria-current={section === "settings" ? "page" : undefined}>
            <Settings2 size={17} aria-hidden="true" /><span>Настройки</span>
          </Link>
        </nav>
        <p className="ws-sidebar-note">Профессиональные источники и ваши материалы. Без данных пациентов.</p>
      </aside>

      <div className="ws-body">
        {/* Phone and tablet: top bar */}
        <header className="ws-topbar">
          <BrandLockup specialty={specialty} />
          <SpecialtySelect specialty={specialty} sectionPath={sectionPath} />
          <Link href={`/${specialty}/settings`} className={section === "settings" ? "ws-icon-link is-active" : "ws-icon-link"} aria-label="Настройки и источники" aria-current={section === "settings" ? "page" : undefined}><Settings2 size={20} /></Link>
        </header>
        <main id="ws-main" className="ws-main" tabIndex={-1}>{children}</main>
      </div>

      <nav className="ws-tabbar" aria-label="Разделы">
        {NAV.map(item => <Link key={item.id} href={`/${specialty}${item.path}`} className={section === item.id ? "ws-tab is-active" : "ws-tab"} aria-current={section === item.id ? "page" : undefined}>
          <item.icon size={20} aria-hidden="true" /><span>{item.short}</span>
          {item.id === "agents" && pendingActions > 0 && <span className="ws-nav-badge">{pendingActions}</span>}
        </Link>)}
        <Link href={`/${specialty}/settings`} className={section === "settings" ? "ws-tab is-active" : "ws-tab"} aria-current={section === "settings" ? "page" : undefined}><Settings2 size={20} aria-hidden="true" /><span>Настройки</span></Link>
      </nav>
      <ResearchJobWatcher specialty={specialty} />
      <ActionConfirmDialog />
    </div>
  </WorkspaceProvider>;
}
