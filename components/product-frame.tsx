"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, Bot, Bookmark, Calculator, ChevronDown, Compass, GraduationCap, Library, Pill, RotateCcw, ScanLine, Search, Settings2, Sparkles, X } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { shellLabel, specialtyLabel } from "@/lib/ui/labels";
import { ONBOARDING_STORAGE_KEY, OnboardingDialog } from "./onboarding-dialog";
import { useProduct } from "./product-provider";

const primaryNavigation = [
  { id: "feed", label: "Главное", icon: Sparkles },
  { id: "agents", label: "Агенты", icon: Bot },
  { id: "saved", label: "Материалы", icon: Bookmark },
  { id: "sources", label: "Источники", icon: Library },
] as const;

const toolNavigation = [
  { id: "tools", label: "Калькуляторы", icon: Calculator },
  { id: "drugs", label: "Препараты", icon: Pill },
  { id: "events", label: "События", icon: Compass },
  { id: "education", label: "Обучение", icon: GraduationCap },
  { id: "imaging", label: "Визуализация", icon: ScanLine, experimental: true },
] as const;

function navigationHref(specialty: SpecialtyId, id: string): string {
  if (id === "feed") return `/${specialty}`;
  if (id === "education") return `/${specialty}/education`;
  return `/${specialty}?view=${id}`;
}

function preferenceModeLabel(mode: "hidden" | "less" | "pinned"): string {
  if (mode === "hidden") return "Скрыт";
  if (mode === "less") return "Показывать реже";
  return "Закреплён выше";
}

export function ProductFrame({ specialty, children }: { specialty: SpecialtyId; children: ReactNode }) {
  const { state, pending, mutate, track } = useProduct();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const settings = useRef<HTMLDialogElement>(null);
  const [historyCleared, setHistoryCleared] = useState(false);
  const pathView = pathname === `/${specialty}/education` ? "education" : null;
  const view = pathView ?? params.get("view") ?? "feed";
  const surfacePreferences = state.uiPreferences.filter(preference => preference.specialty === specialty);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    track("search_submitted");
    void mutate({ action: "recent", entry: { kind: "query", specialty, query } });
    router.push(`/${specialty}?q=${encodeURIComponent(query)}`);
  }

  async function replayOnboarding() {
    settings.current?.close();
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    await mutate({ action: "preferences", onboardingCompleted: false });
  }

  return <div className="product" data-shell="workspace" data-specialty={specialty}>
    <a className="skip-link" href="#main">Перейти к содержанию</a>
    <header className="topbar">
      <Link className="brand" href={`/${specialty}`} aria-label="Яндекс Мед — главное"><span className="brand-symbol" aria-hidden="true">Я</span><span>Яндекс <strong>Мед</strong></span></Link>
      <div className="specialty-control"><label className="sr-only" htmlFor="specialty">Специальность</label><select id="specialty" value="cardiology" disabled><option value="cardiology">Кардиология</option></select><ChevronDown size={14} aria-hidden="true" /></div>
      <form className="global-search" role="search" onSubmit={event => void submit(event)}><Search size={19} aria-hidden="true" /><label className="sr-only" htmlFor="global-search">Поиск</label><input id="global-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Спросить или найти по кардиологии" autoComplete="off" maxLength={160} /><button type="submit" aria-label="Найти"><span className="search-label">Найти</span><ArrowUpRight size={16} aria-hidden="true" /></button></form>
      <button className="icon-button settings-button" aria-label="Настройки" onClick={() => settings.current?.showModal()}><Settings2 size={21} /></button>
      <span className="avatar" aria-label="Личное пространство без регистрации">М</span>
    </header>
    <div className="app-grid">
      <aside className="navigation-rail">
        <nav aria-label="Основная навигация">
          {primaryNavigation.map(item => <Link key={item.id} href={navigationHref(specialty, item.id)} className={`nav-item ${view === item.id && !params.has("q") ? "active" : ""}`} aria-current={view === item.id && !params.has("q") ? "page" : undefined}><item.icon size={19} aria-hidden="true" /><span>{item.label}</span>{item.id === "saved" && state.savedIds.length > 0 && <span className="nav-count">{state.savedIds.length}</span>}{item.id === "agents" && state.professionalAgents.length > 0 && <span className="nav-count">{state.professionalAgents.length}</span>}</Link>)}
          <div className="nav-section-label">Инструменты</div>
          {toolNavigation.map(item => <Link key={item.id} href={navigationHref(specialty, item.id)} className={`nav-item ${item.experimental ? "is-experimental" : ""} ${view === item.id && !params.has("q") ? "active" : ""}`} aria-current={view === item.id && !params.has("q") ? "page" : undefined} onClick={() => track("quick_job_opened")}><item.icon size={19} aria-hidden="true" /><span>{item.label}</span>{item.experimental && <small>эксп.</small>}</Link>)}
        </nav>
        <div className="rail-bottom"><Link className="quiet-button mode-control" href={`/${specialty}?view=agents`}><Bot size={16} aria-hidden="true" /><span>Настроить агента</span></Link><p>Professional intelligence<br />для врача</p></div>
      </aside>
      <main id="main" className="main-content" tabIndex={-1}>{children}</main>
    </div>
    <dialog ref={settings} className="settings-dialog" aria-labelledby="settings-title" onClick={event => { if (event.target === event.currentTarget) settings.current?.close(); }}>
      <div className="dialog-head"><div><span className="eyebrow">Ваше пространство</span><h2 id="settings-title">Настройки</h2></div><button className="icon-button" aria-label="Закрыть настройки" onClick={() => settings.current?.close()}><X size={20} /></button></div>
      <p className="muted">Главное строится вокруг ваших задач, агентов, материалов и источников. Инструменты остаются подключаемыми модулями, а не отдельными рабочими режимами.</p>
      {surfacePreferences.length > 0 && <div className="settings-history"><h3>Интерфейс</h3><p className="muted">Старые настройки блоков сохранены для совместимости. Их можно сбросить.</p><div className="gen-ui-settings-list">{surfacePreferences.map(preference => <div className="gen-ui-setting-row" key={`${preference.shell}:${preference.blockId}`}><span><strong>{preference.label}</strong><small>{shellLabel[preference.shell]} · {preferenceModeLabel(preference.mode)}</small></span><button className="secondary-button" disabled={pending} onClick={() => void mutate({ action: "uiPreference", specialty: preference.specialty, shell: preference.shell, blockId: preference.blockId, label: preference.label, mode: "default" })}><RotateCcw size={14} /> Вернуть</button></div>)}</div></div>}
      <div className="settings-history"><h3>История</h3><p className="muted">Недавние запросы сохраняются в этом браузере. Поисковые фразы не передаются в аналитику.</p><button className="secondary-button" disabled={pending} onClick={async () => { if (await mutate({ action: "clearHistory" })) { setHistoryCleared(true); router.refresh(); } }}>Очистить историю</button>{historyCleared && <p role="status" className="success-text">История очищена</p>}</div>
      <div className="settings-history"><h3>Знакомство</h3><p className="muted">Повторить короткое объяснение возможностей прототипа.</p><button className="secondary-button" disabled={pending} onClick={() => void replayOnboarding()}>Показать снова</button></div>
      <p className="footnote">{specialtyLabel[specialty]} · Без регистрации. Состояние привязано к этому браузеру.</p>
    </dialog>
    <OnboardingDialog specialty={specialty} />
  </div>;
}
