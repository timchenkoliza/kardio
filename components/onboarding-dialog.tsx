"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, BriefcaseMedical, Compass, FolderKanban } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { specialtyLabel } from "@/lib/ui/labels";
import { useProduct } from "./product-provider";

export const ONBOARDING_STORAGE_KEY = "kardio_onboarding_v1";

const steps = [
  {
    title: "Три режима, один профиль",
    text: "Материалы, сохранения и история остаются общими. Меняется только то, какую задачу решает главный экран.",
    icon: BookOpenCheck,
  },
  {
    title: "Обзор",
    text: "Для открытия нового: редакционная выдача, темы, исследования, рекомендации и путь к первоисточнику.",
    icon: Compass,
  },
  {
    title: "Практика",
    text: "Для повторяемых рабочих задач: текущие рекомендации, инструменты, закреплённое и недавнее.",
    icon: BriefcaseMedical,
  },
  {
    title: "Рабочее пространство",
    text: "Только ваш контекст: сохранения, подборки, интересы и агент по теме. Случайная общая лента сюда не подмешивается.",
    icon: FolderKanban,
  },
] as const;

export function OnboardingDialog({ specialty }: { specialty: SpecialtyId }) {
  const { state, pending, mutate } = useProduct();
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [browserCompleted, setBrowserCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    const localCompleted = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
    if (state.onboardingCompleted && !localCompleted) window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    setBrowserCompleted(localCompleted || state.onboardingCompleted);
  }, [state.onboardingCompleted]);

  useEffect(() => {
    if (browserCompleted === false && !state.onboardingCompleted && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [browserCompleted, state.onboardingCompleted]);

  async function finish() {
    if (await mutate({ action: "preferences", onboardingCompleted: true })) {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
      setBrowserCompleted(true);
      dialog.current?.close();
    }
  }

  const current = steps[step];
  const Icon = current.icon;

  return (
    <dialog ref={dialog} className="onboarding-dialog" aria-labelledby="onboarding-title" onCancel={event => event.preventDefault()}>
      <div className="onboarding-progress" aria-label={`Шаг ${step + 1} из ${steps.length}`}>
        {steps.map((_, index) => <span key={index} className={index <= step ? "active" : ""} />)}
      </div>
      <div className="onboarding-icon" aria-hidden="true"><Icon size={24} /></div>
      <span className="eyebrow">{specialtyLabel[specialty]} · знакомство</span>
      <h2 id="onboarding-title">{current.title}</h2>
      <p>{current.text}</p>
      <div className="onboarding-actions">
        <button className="quiet-button" type="button" disabled={pending} onClick={() => void finish()}>Пропустить</button>
        {step > 0 && <button className="secondary-button" type="button" disabled={pending} onClick={() => setStep(value => value - 1)}>Назад</button>}
        {step < steps.length - 1 ? (
          <button className="primary-source-button" type="button" onClick={() => setStep(value => value + 1)}>Дальше</button>
        ) : (
          <button className="primary-source-button" type="button" disabled={pending} onClick={() => void finish()}>Начать работу</button>
        )}
      </div>
      <p className="onboarding-footnote">Рядом с ключевыми разделами останется небольшой знак вопроса — к логике раздела можно вернуться в любой момент.</p>
    </dialog>
  );
}
