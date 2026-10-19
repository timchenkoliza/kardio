"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Search, SlidersHorizontal } from "lucide-react";
import type { SpecialtyId } from "@/lib/domain/types";
import { specialtyLabel } from "@/lib/ui/labels";
import { useProduct } from "./product-provider";

/** Versioned separately from the legacy three-shell onboarding. */
export const ONBOARDING_STORAGE_KEY = "kardio_agent_workspace_onboarding_v1";

const steps = [
  {
    title: "Не портал, а рабочее пространство",
    text: "На Главном не нужно выбирать раздел. Начните с задачи: спросите сейчас или настройте постоянное правило для агента.",
    icon: Search,
  },
  {
    title: "Один запрос — два режима",
    text: "«Спросить сейчас» решает разовую задачу. «Следить» сохраняет инструкцию, темы, источники и формат результата для повторной работы.",
    icon: Bot,
  },
  {
    title: "Вы управляете контекстом",
    text: "Выберите, за какими темами и источниками следить. Настройки можно изменить, поставить на паузу или удалить. Инструменты подключаются к задаче, а не загромождают Главное.",
    icon: SlidersHorizontal,
  },
  {
    title: "Сначала источник, потом вывод",
    text: "Результат должен сохранять первоисточник и отделять факты от интерпретации. Партнёрские каналы подключаются отдельно и не смешиваются с независимой медицинской выдачей.",
    icon: CheckCircle2,
  },
] as const;

export function OnboardingDialog({ specialty }: { specialty: SpecialtyId }) {
  const { pending, mutate } = useProduct();
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const completedForThisVersion = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
    if (completedForThisVersion) {
      if (dialog.current?.open) dialog.current.close();
      return;
    }
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  async function finish() {
    await mutate({ action: "preferences", onboardingCompleted: true });
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    dialog.current?.close();
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
          <button className="primary-source-button" type="button" disabled={pending} onClick={() => void finish()}>Перейти на Главное</button>
        )}
      </div>
      <p className="onboarding-footnote">Фоновый мониторинг появится после подключения runtime. Сейчас продукт честно сохраняет конфигурацию агента и не имитирует выполненную работу.</p>
    </dialog>
  );
}
