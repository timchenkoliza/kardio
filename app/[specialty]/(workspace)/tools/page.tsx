import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isSpecialty, specialties } from "@/lib/specialty";
import { calculatorsFor } from "@/lib/calculators/catalog";
import { nbsp } from "@/lib/ui/typography";
import { Calculators } from "@/components/portal/calculators";
import { Mascot } from "@/components/portal/mascot";

export const dynamic = "force-dynamic";

export default async function ToolsPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const { primary, other } = calculatorsFor(specialty);
  return <div className="ws-page pt-tools">
    <Link className="ws-back" href={`/${specialty}/agents`}><ArrowLeft size={15} aria-hidden="true" />Агенты</Link>
    <header className="pt-ask-head">
      <Mascot variant="calculators" size={64} />
      <div>
        <h1>Калькуляторы</h1>
        <p className="pt-lead">{nbsp("Справочные шкалы и формулы с источником и областью применимости. Расчёт выполняется в браузере — введённые значения никуда не отправляются. Результат не является диагнозом, дозой или назначением.")}</p>
      </div>
    </header>
    <Calculators ids={primary.map(item => item.id)} />
    {other.length > 0 && <details className="pt-calc-more">
      <summary>{nbsp(`Другие калькуляторы · ${other.length}`)}</summary>
      <Calculators ids={other.map(item => item.id)} />
    </details>}
    <p className="ws-muted">{nbsp(`Для специальности «${specialties[specialty].name}» первыми показаны калькуляторы, к которым обращаются чаще. Референсные значения анализов здесь не приводятся: они зависят от метода и лаборатории.`)}</p>
  </div>;
}
