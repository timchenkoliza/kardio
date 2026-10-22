import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isSpecialty, specialties } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { CardiologyCalculators } from "@/components/portal/calculators";
import { Mascot } from "@/components/portal/mascot";

export const dynamic = "force-dynamic";

export default async function ToolsPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  return <div className="ws-page pt-tools">
    <Link className="ws-back" href={`/${specialty}/agents`}><ArrowLeft size={15} aria-hidden="true" />Агенты</Link>
    <header className="pt-ask-head">
      <Mascot variant="calculators" size={64} />
      <div>
        <h1>Калькуляторы</h1>
        <p className="pt-lead">{nbsp("Справочные шкалы риска. Расчёт выполняется в браузере — введённые значения никуда не отправляются. Результат шкалы не является диагнозом или назначением.")}</p>
      </div>
    </header>
    {specialty === "cardiology"
      ? <CardiologyCalculators />
      : <p className="ws-empty">{nbsp(`Калькуляторы для специальности «${specialties[specialty].name}» готовим. Пока задайте вопрос на главной — агенты найдут рекомендации и инструкции по теме.`)}</p>}
  </div>;
}
