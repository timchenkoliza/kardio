"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Bot, ChevronDown, ChevronRight, FolderOpen, LayoutGrid, Settings, ShieldCheck } from "lucide-react";
import type { ProfileIdentity } from "@/lib/agents/types";
import type { SpecialtyId } from "@/lib/domain/types";
import { launchSpecialtyList, specialties } from "@/lib/specialty";
import { WorkspaceProvider } from "./workspace-provider";
import { ActionConfirmDialog } from "./action-confirm-dialog";
import { ResearchJobWatcher } from "./research-job-watcher";

export type WorkspaceSection = "home" | "agents" | "materials" | "anonymizer" | "settings" | "content";

/**
 * Primary navigation: the one input (Главное), the capabilities behind it as a
 * gallery (Агенты — discovery and shortcuts, never a required step), the
 * physician's own library, and the profile. Every entry is internal, same tab.
 */
const NAV: Array<{ id: "home" | "agents" | "materials" | "anonymizer"; label: string; short: string; path: string; icon: typeof LayoutGrid }> = [
  { id: "home", label: "Главное", short: "Главное", path: "", icon: LayoutGrid },
  { id: "agents", label: "Агенты", short: "Агенты", path: "/agents", icon: Bot },
  { id: "materials", label: "Мои материалы", short: "Материалы", path: "/materials", icon: FolderOpen },
  { id: "anonymizer", label: "Обезличивание", short: "Обезличить", path: "/anonymizer", icon: ShieldCheck },
];

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/u).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map(part => part[0]?.toLocaleUpperCase("ru-RU") ?? "").join("") : "Вы";
}

/** Profile entry: no accounts — the workspace belongs to this browser; the profile is identity, specialty, topics and sources. */
function ProfileAvatar({ size = "regular", name }: { size?: "regular" | "small"; name?: string | null }) {
  return <span className={size === "small" ? "ws-avatar is-small" : "ws-avatar"} aria-hidden="true">{initials(name)}</span>;
}

export function sectionFromPath(pathname: string, specialty: string): WorkspaceSection {
  const rest = pathname.replace(new RegExp(`^/${specialty}`), "");
  if (rest.startsWith("/agents")) return "agents";
  if (rest.startsWith("/ask") || rest.startsWith("/item")) return "home";
  if (rest.startsWith("/tools")) return "agents";
  if (rest.startsWith("/materials")) return "materials";
  if (rest.startsWith("/anonymizer")) return "anonymizer";
  if (rest.startsWith("/settings")) return "settings";
  if (rest.startsWith("/content")) return "content";
  return "home";
}

/** The beta lockup exactly as supplied by the design system (never retyped). */
export function BrandLockup({ specialty, href }: { specialty: SpecialtyId; href?: string }) {
  return <Link className="ws-brand" href={href ?? `/${specialty}`}>
    {/* eslint-disable-next-line @next/next/no-img-element -- static SVG lockup from the design system */}
    <img src="/brand/yandex-med-beta.svg" alt="Яндекс Мед β — главное" width={159} height={24} />
  </Link>;
}

function SpecialtySelect({ specialty, sectionPath }: { specialty: SpecialtyId; sectionPath: string }) {
  const router = useRouter();
  return <label className="ws-specialty">
    <span className="sr-only">Специальность</span>
    <select value={specialty} onChange={event => router.push(`/${event.target.value}${sectionPath}`)}>
      {launchSpecialtyList.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      {!specialties[specialty].launch && <option value={specialty}>{specialties[specialty].name}</option>}
    </select>
    <ChevronDown size={14} aria-hidden="true" />
  </label>;
}

export function WorkspaceFrame({ specialty, pendingActions = 0, identity = null, children }: { specialty: SpecialtyId; pendingActions?: number; identity?: ProfileIdentity | null; children: ReactNode }) {
  const section = sectionFromPath(usePathname() ?? `/${specialty}`, specialty);
  const sectionPath = section === "materials" ? "/materials" : section === "settings" ? "/settings" : section === "agents" ? "/agents" : section === "anonymizer" ? "/anonymizer" : "";
  const name = identity?.name ?? null;

  return <WorkspaceProvider specialty={specialty}>
    <div className="ws-app" data-specialty={specialty}>
      <a className="skip-link" href="#ws-main">Перейти к содержанию</a>

      {/* Desktop: 280px structural sidebar */}
      <aside className="ws-sidebar">
        <div className="ws-sidebar-head">
          <BrandLockup specialty={specialty} />
          <Link href={`/${specialty}/settings`} className={section === "settings" ? "ws-sidebar-gear is-active" : "ws-sidebar-gear"} aria-label="Настройки"><Settings size={18} aria-hidden="true" /></Link>
        </div>
        <SpecialtySelect specialty={specialty} sectionPath={sectionPath} />
        <nav className="ws-nav" aria-label="Основная навигация">
          {NAV.map(item => <Link key={item.id} href={`/${specialty}${item.path}`} className={section === item.id ? "ws-nav-item is-active" : "ws-nav-item"} aria-current={section === item.id ? "page" : undefined}>
            <item.icon size={17} aria-hidden="true" /><span>{item.label}</span>
            {item.id === "home" && pendingActions > 0 && <span className="ws-nav-badge" aria-label={`Ждут подтверждения: ${pendingActions}`}>{pendingActions}</span>}
          </Link>)}
        </nav>
        <Link href={`/${specialty}/settings#profile`} className={section === "settings" ? "ws-profile-entry is-active" : "ws-profile-entry"} aria-current={section === "settings" ? "page" : undefined}>
          <ProfileAvatar name={name} />
          <span className="ws-profile-copy"><strong>{name ?? "Профиль и настройки"}</strong><span>{name ? `Профиль и настройки · ${specialties[specialty].name}` : `${specialties[specialty].name} · темы и источники`}</span></span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <p className="ws-sidebar-note">Профессиональные источники и ваши материалы. Без данных пациентов.</p>
      </aside>

      <div className="ws-body">
        {/* Phone and tablet: top bar */}
        <header className="ws-topbar">
          <BrandLockup specialty={specialty} />
          <SpecialtySelect specialty={specialty} sectionPath={sectionPath} />
          <Link href={`/${specialty}/settings#profile`} className={section === "settings" ? "ws-icon-link is-active" : "ws-icon-link"} aria-label="Вы: профиль и настройки" aria-current={section === "settings" ? "page" : undefined}><ProfileAvatar size="small" name={name} /></Link>
        </header>
        <main id="ws-main" className="ws-main" tabIndex={-1}>{children}</main>
        <footer className="pt-footer ws-footer"><p>© {new Date().getFullYear()} ООО «Яндекс»</p></footer>
      </div>

      <nav className="ws-tabbar" aria-label="Разделы">
        {NAV.map(item => <Link key={item.id} href={`/${specialty}${item.path}`} className={section === item.id ? "ws-tab is-active" : "ws-tab"} aria-current={section === item.id ? "page" : undefined}>
          <item.icon size={20} aria-hidden="true" /><span>{item.short}</span>
          {item.id === "home" && pendingActions > 0 && <span className="ws-nav-badge">{pendingActions}</span>}
        </Link>)}
        <Link href={`/${specialty}/settings#profile`} className={section === "settings" ? "ws-tab is-active" : "ws-tab"} aria-current={section === "settings" ? "page" : undefined}><ProfileAvatar size="small" name={name} /><span>Профиль</span></Link>
      </nav>
      <ResearchJobWatcher specialty={specialty} />
      <ActionConfirmDialog />
    </div>
  </WorkspaceProvider>;
}
