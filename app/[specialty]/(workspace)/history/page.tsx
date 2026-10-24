import { notFound } from "next/navigation";
import { RecentQuestions } from "@/components/portal/recent-questions";
import { isSpecialty, specialties } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";

export const dynamic = "force-dynamic";

/**
 * «История»: the physician's own questions in this browser, newest first.
 * Each opens the stored result — no new search. Background checks are not
 * questions and are not listed here; they feed «Для вас».
 */
export default async function HistoryPage({ params }: { params: Promise<{ specialty: string }> }) {
  const { specialty } = await params;
  if (!isSpecialty(specialty)) notFound();
  const sessionId = await pageSession(specialty);
  const runs = sessionId ? await workspaceStore().listRuns(sessionId, specialty, undefined, 120) : [];
  const shown = <RecentQuestions specialty={specialty} runs={runs} limit={40} title="Вопросы" />;
  return <div className="ws-page pt-history">
    <header className="ws-page-head">
      <h1>История</h1>
      <p>{nbsp(`Ваши вопросы по специальности «${specialties[specialty].name}» в этом браузере. Результат открывается таким, каким был получен, — без нового поиска. Вопросы других специальностей — в их разделах.`)}</p>
      {workspaceStore().kind === "memory" && <p className="ws-muted" data-storage="memory">{nbsp("На этом стенде история хранится только до перезапуска сервера.")}</p>}
    </header>
    {runs.some(run => run.trigger === "composer" && run.input.text)
      ? shown
      : <p className="ws-empty">{nbsp("Вопросов пока нет. Задайте вопрос на главной — он появится здесь, и к ответу можно будет вернуться.")}</p>}
  </div>;
}
