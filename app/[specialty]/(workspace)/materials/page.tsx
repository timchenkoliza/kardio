import { notFound } from "next/navigation";
import { MaterialsWorkspace } from "@/components/workspace/materials-workspace";
import { materialExamples } from "@/lib/portal/material-examples";
import { isSpecialty } from "@/lib/specialty";
import { pageSession } from "@/server/agents/page-session";
import { getMaterialsView } from "@/server/agents/workspace";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({ params, searchParams }: { params: Promise<{ specialty: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const query = await searchParams;
  const runId = Array.isArray(query.run) ? query.run[0] : query.run;
  const sessionId = await pageSession(specialty);
  const view = await getMaterialsView(sessionId, specialty, runId);
  return <div className="ws-page pt-materials">
    <header className="ws-page-head">
      <h1>Мои материалы</h1>
      <p>Файлы, ссылки, заметки и сохранённые ответы. Вопрос по материалам ищет ответ только в них.</p>
    </header>
    <MaterialsWorkspace specialty={specialty} materials={view.materials.map(material => ({ ...material, text: null }))} collections={view.collections} lastAnswer={view.lastAnswer} answerResults={view.answerResults} examples={materialExamples(specialty)} now={new Date().toISOString()} />
  </div>;
}
