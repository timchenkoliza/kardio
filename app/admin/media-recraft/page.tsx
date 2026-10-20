import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StandaloneBar } from "@/components/workspace/standalone-bar";
import { RecraftReview, type RecraftPair } from "@/components/admin/recraft-review";
import { matchCardioIllustration } from "@/lib/ui/approved-medical-media";
import { getRequestAccessState } from "@/server/access/request-access";
import { recraftAvailability } from "@/server/recraft/providers";
import { listContent } from "@/server/repositories/catalog";

export const dynamic = "force-dynamic";

export default async function MediaRecraftPage() {
  const access = await getRequestAccessState();
  const editorial = access.subject.role === "editorial" || access.subject.role === "admin";
  const availability = recraftAvailability();
  const catalog = editorial ? await listContent("cardiology") : [];
  const pairs: RecraftPair[] = catalog
    .map(content => ({ content, match: matchCardioIllustration({ text: [content.title, content.summary, ...content.tags, ...content.topics].join(" "), kind: content.kind }) }))
    .filter((item): item is typeof item & { match: NonNullable<typeof item.match> } => Boolean(item.match))
    .slice(0, 24)
    .map(({ content, match }) => ({
      contentId: content.id,
      title: content.title,
      source: content.source.name,
      grade: match.grade,
      image: { id: match.asset.id, src: match.asset.src, alt: match.asset.alt, credit: match.asset.credit, label: match.asset.compactLabel },
    }));

  return <div className="ws-app ws-app-standalone">
    <StandaloneBar label="Редакция · изображения к статьям" />
    <main className="ws-main" id="ws-main">
      <div className="ws-page">
        <Link className="ws-back" href="/cardiology"><ArrowLeft size={15} aria-hidden="true" />В рабочее пространство</Link>
        <header className="ws-page-head">
          <h1>Перерисовать источник</h1>
          <p>Изображение к статье перерисовывается в визуальной системе Яндекс Мед без изменения медицинского содержания: оригинал → смысловая фиксация → перерисовка.</p>
        </header>
        {editorial
          ? <RecraftReview pairs={pairs} availability={availability} />
          : <section className="ws-card-block"><p>Раздел доступен редакции. Переключить роль можно в <Link className="ws-text-link" href="/admin/agent-access">доступе к агентам</Link>.</p></section>}
      </div>
    </main>
  </div>;
}
