import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, ExternalLink, GraduationCap, PlayCircle } from "lucide-react";
import { ProductFrame } from "@/components/product-frame";
import { ProductProvider } from "@/components/product-provider";
import type { ContentObject, Shell, SpecialtyId } from "@/lib/domain/types";
import { educationContent } from "@/lib/ui/content-completeness";
import { curatedSourcesForSurface } from "@/lib/ui/curated-external-tools";
import { deterministicContentOrder } from "@/lib/ui/feed";
import { kindLabel, specialtyLabel } from "@/lib/ui/labels";
import { listContent } from "@/server/repositories/catalog";
import { readState, SESSION_COOKIE } from "@/server/services/state";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSpecialty(value: string): value is SpecialtyId {
  return value === "cardiology" || value === "oncology";
}

function isShell(value: string | undefined): value is Shell {
  return value === "explore" || value === "practice" || value === "workspace";
}

function publicationLabel(item: ContentObject): string | null {
  if (item.publicationDate) {
    const date = new Date(`${item.publicationDate}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }
  return item.publicationYear ? String(item.publicationYear) : null;
}

export default async function EducationPage({
  params,
  searchParams,
}: {
  params: Promise<{ specialty: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { specialty: rawSpecialty } = await params;
  if (!isSpecialty(rawSpecialty)) notFound();
  const specialty = rawSpecialty;
  const queryParams = await searchParams;
  const shellParam = first(queryParams.shell);
  const cookieStore = await cookies();
  const state = await readState(cookieStore.get(SESSION_COOKIE)?.value);
  const activeShell = isShell(shellParam) ? shellParam : state.shell;
  const content = await listContent(specialty);
  const materials = educationContent(content).sort(deterministicContentOrder);
  const externalSources = curatedSourcesForSurface(specialty, "education");
  const featured = materials[0] ?? null;
  const rest = materials.slice(1, 9);

  return <ProductProvider initialState={{ ...state, specialty, shell: activeShell }} specialty={specialty}>
    <ProductFrame specialty={specialty}>
      <div className="education-hub">
        <header className="education-intro">
          <div>
            <span className="eyebrow">{specialtyLabel[specialty]} · Обучение</span>
            <h1>Разобраться глубже</h1>
            <p>{specialty === "cardiology" ? "Лекции, видео и образовательные материалы из текущего каталога с понятным источником и статусом." : "Онкологические образовательные материалы и внешние профессиональные платформы. Кардиологический контент сюда не переносится."}</p>
          </div>
          <div className="education-stats" aria-label="Состояние раздела">
            <span><strong>{materials.length}</strong> материалов каталога</span>
            <span><strong>{externalSources.length}</strong> внешних источников</span>
          </div>
        </header>

        {featured ? <>
          <section className="education-feature" aria-labelledby="education-feature-title">
            <div className="education-feature-art" aria-hidden="true"><span className="education-orbit orbit-a" /><span className="education-orbit orbit-b" /><div className="education-play"><PlayCircle size={42} /></div></div>
            <div className="education-feature-copy">
              <span className="eyebrow">{featured.source.name} · {kindLabel[featured.kind]}</span>
              <h2 id="education-feature-title">{featured.title}</h2>
              {featured.summary && <p>{featured.summary}</p>}
              <div className="education-meta">{publicationLabel(featured) && <span>{publicationLabel(featured)}</span>}{featured.topics.slice(0, 2).map(topic => <span key={topic}>{topic}</span>)}</div>
              <Link className="primary-source-button" href={`/${specialty}/content/${encodeURIComponent(featured.id)}`}>Открыть материал <ArrowRight size={15} /></Link>
            </div>
          </section>

          {rest.length > 0 && <section className="education-section" aria-labelledby="education-library-title">
            <div className="education-section-head"><div><span className="eyebrow">Каталог</span><h2 id="education-library-title">Ещё для изучения</h2></div><span>{materials.length} всего</span></div>
            <div className="education-grid">{rest.map(item => <article className="education-card" key={item.id}>
              <div className="education-card-icon">{item.kind === "video" ? <PlayCircle size={21} /> : <BookOpen size={21} />}</div>
              <span className="education-source">{item.source.name}</span>
              <h3>{item.title}</h3>
              {item.summary && <p>{item.summary}</p>}
              <div className="education-card-footer"><span>{publicationLabel(item) ?? kindLabel[item.kind]}</span><Link href={`/${specialty}/content/${encodeURIComponent(item.id)}`} aria-label={`Открыть: ${item.title}`}><ArrowRight size={16} /></Link></div>
            </article>)}</div>
          </section>}
        </> : externalSources.length === 0 ? <section className="education-empty">
          <div className="education-empty-icon"><GraduationCap size={28} /></div>
          <span className="eyebrow">Пока без собственного набора</span>
          <h2>Образовательные материалы ещё не добавлены</h2>
          <p>Раздел наполнится после отдельной проверки и загрузки материалов этой специальности.</p>
        </section> : null}

        {externalSources.length > 0 && <section className="education-section" aria-labelledby="education-platforms-title">
          <div className="education-section-head"><div><span className="eyebrow">Профессиональные первоисточники</span><h2 id="education-platforms-title">Обучение и архивы</h2></div></div>
          <div className="education-platforms">{externalSources.map(source => <a className="education-platform-card" key={source.id} href={source.url} target="_blank" rel="noreferrer">
            <div className="education-platform-icon"><GraduationCap size={22} /></div>
            <div><span>{source.category}</span><strong>{source.name}</strong><p>{source.note}</p></div>
            <ExternalLink size={16} />
          </a>)}</div>
          <p className="tools-footnote">Внешний ресурс открывается отдельно. Его материалы попадут во внутренний каталог только после отдельной проверки.</p>
        </section>}
      </div>
    </ProductFrame>
  </ProductProvider>;
}
