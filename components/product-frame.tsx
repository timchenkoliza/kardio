"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, Bookmark, Calculator, ChevronDown, Compass, GraduationCap, Library, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
import type { Shell, SpecialtyId } from "@/lib/domain/types";
import { shellLabel, specialtyLabel } from "@/lib/ui/labels";
import { ONBOARDING_STORAGE_KEY, OnboardingDialog } from "./onboarding-dialog";
import { PbzContextStrip } from "./pbz-context-strip";
import { useProduct } from "./product-provider";

const secondaryNavigation = [
  { id: "saved", label: "Мои материалы", icon: Bookmark },
  { id: "sources", label: "Источники", icon: Library }, { id: "tools", label: "Калькуляторы", icon: Calculator },
  { id: "reference", label: "Справочник", icon: BookOpen }, { id: "referral", label: "ВМП", icon: ArrowUpRight },
  { id: "events", label: "События", icon: Compass }, { id: "education", label: "Обучение", icon: GraduationCap },
];
export function ProductFrame({ specialty, children }: { specialty: SpecialtyId; children: ReactNode }) {
  const { state, pending, mutate, track } = useProduct();
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const settings = useRef<HTMLDialogElement>(null);
  const [historyCleared, setHistoryCleared] = useState(false);
  const view = params.get("view") ?? "feed";
  const homeLabel = state.shell === "explore" ? "Лента" : state.shell === "practice" ? "Практика" : "Пространство";
  const navigation = [{ id: "feed", label: homeLabel, icon: Compass }, ...secondaryNavigation];
  const rootHome = view === "feed" && !params.has("q") && !params.has("kind");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    track("search_submitted");
    await mutate({ action: "recent", entry: { kind: "query", specialty, query } });
    router.push(`/${specialty}?q=${encodeURIComponent(query)}`);
  }
  async function changeShell(shell: Shell) {
    if (await mutate({ action: "preferences", shell })) {
      track("shell_changed");
      settings.current?.close();
      router.push(`/${specialty}`);
      router.refresh();
    }
  }
  async function changeSpecialty(next: SpecialtyId) {
    if (await mutate({ action: "preferences", specialty: next })) { track("specialty_changed"); router.push(`/${next}`); }
  }
  async function replayOnboarding() {
    settings.current?.close();
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    await mutate({ action: "preferences", onboardingCompleted: false });
  }
  return <div className="product" data-shell={state.shell}>
    <a className="skip-link" href="#main">Перейти к содержанию</a>
    <header className="topbar">
      <Link className="brand" href={`/${specialty}`} aria-label="Яндекс Мед — главная"><span className="brand-symbol" aria-hidden="true">Я</span><span>Яндекс <strong>Мед</strong></span></Link>
      <div className="specialty-control"><label className="sr-only" htmlFor="specialty">Специальность</label><select id="specialty" value={specialty} disabled={pending} onChange={event => void changeSpecialty(event.target.value as SpecialtyId)}><option value="cardiology">Кардиология</option><option value="oncology">Онкология</option></select><ChevronDown size={14} aria-hidden="true" /></div>
      <form className="global-search" role="search" onSubmit={event => void submit(event)}><Search size={19} aria-hidden="true" /><label className="sr-only" htmlFor="global-search">Поиск</label><input id="global-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Тема, рекомендация или вопрос" autoComplete="off" maxLength={160} /><button type="submit" aria-label="Найти"><span className="search-label">Найти</span><ArrowUpRight size={16} aria-hidden="true" /></button></form>
      <button className="icon-button settings-button" aria-label="Настройки" onClick={() => settings.current?.showModal()}><Settings2 size={21} /></button>
      <span className="avatar" aria-label="Личное пространство без регистрации">М</span>
    </header>
    <div className="app-grid">
      <aside className="navigation-rail"><nav aria-label="Основная навигация">{navigation.map(item => <Link key={item.id} href={`/${specialty}${item.id === "feed" ? "" : `?view=${item.id}`}`} className={`nav-item ${view === item.id && !params.has("q") ? "active" : ""}`} aria-current={view === item.id && !params.has("q") ? "page" : undefined} onClick={() => { if (["tools", "reference", "referral"].includes(item.id)) track("quick_job_opened"); }}><item.icon size={19} aria-hidden="true" /><span>{item.label}</span>{item.id === "saved" && state.savedIds.length > 0 && <span className="nav-count">{state.savedIds.length}</span>}</Link>)}</nav><div className="rail-bottom"><button className="quiet-button mode-control" onClick={() => settings.current?.showModal()}><SlidersHorizontal size={16} aria-hidden="true" /><span>{shellLabel[state.shell]}</span></button><p>Для профессионального<br />медицинского сообщества</p></div></aside>
      <main id="main" className="main-content" tabIndex={-1}>{rootHome && <PbzContextStrip specialty={specialty} shell={state.shell} />}{children}</main>
    </div>
    <dialog ref={settings} className="settings-dialog" aria-labelledby="settings-title" onClick={event => { if (event.target === event.currentTarget) settings.current?.close(); }}><div className="dialog-head"><div><span className="eyebrow">Ваше пространство</span><h2 id="settings-title">Настройки</h2></div><button className="icon-button" aria-label="Закрыть настройки" onClick={() => settings.current?.close()}><X size={20} /></button></div><p className="muted">Режим меняет не только компоновку, но и саму модель работы: обзор — для открытия нового, практика — для повторяемых задач, пространство — только для вашего собственного контекста.</p><fieldset className="mode-options" disabled={pending}><legend>Рабочий режим</legend>{(["explore", "practice", "workspace"] as Shell[]).map(shell => <label key={shell} className={state.shell === shell ? "mode-option selected" : "mode-option"}><input type="radio" name="shell" value={shell} checked={state.shell === shell} onChange={() => void changeShell(shell)} /><span><strong>{shellLabel[shell]}</strong><small>{shell === "explore" ? "Открывать новые темы, материалы и источники" : shell === "practice" ? "Быстро возвращаться к рекомендациям, инструментам и закреплённому" : "Работать только со своими сохранениями, подборками, темами и историей"}</small></span></label>)}</fieldset><div className="settings-history"><h3>История</h3><p className="muted">Недавние запросы и открытия сохраняются в вашем пространстве. Поисковые фразы не передаются в аналитику.</p><button className="secondary-button" disabled={pending} onClick={async () => { if (await mutate({ action: "clearHistory" })) { setHistoryCleared(true); router.refresh(); } }}>Очистить историю</button>{historyCleared && <p role="status" className="success-text">История очищена</p>}</div><div className="settings-history"><h3>Как устроен продукт</h3><p className="muted">Коротко повторить различия между обзором, практикой и рабочим пространством.</p><button className="secondary-button" disabled={pending} onClick={() => void replayOnboarding()}>Показать знакомство снова</button></div><p className="footnote">{specialtyLabel[specialty]} · Без регистрации. Состояние привязано к этому браузеру.</p></dialog>
    <OnboardingDialog specialty={specialty} />
  </div>;
}
