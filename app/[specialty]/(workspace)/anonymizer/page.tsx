import { notFound } from "next/navigation";
import { AnonymizerTool } from "@/components/workspace/anonymizer-tool";
import { isSpecialty } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";

export const dynamic = "force-dynamic";

/** The de-identification tool: a top-level capability of its own, separate from «Мои материалы» and from the profile. */
export default async function AnonymizerPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  return <div className="ws-page pt-anonymizer">
    <header className="ws-page-head">
      <h1>{nbsp("Обезличивание")}</h1>
      <p>{nbsp("Удаляет персональные данные из текстовых документов по правилам 152-ФЗ: контакты, документы, ФИО, адрес и дату рождения. Обработка идёт в браузере, файлы никуда не отправляются.")}</p>
    </header>
    <AnonymizerTool specialty={specialty} />
  </div>;
}
