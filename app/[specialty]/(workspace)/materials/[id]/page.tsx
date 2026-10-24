import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MaterialReader } from "@/components/workspace/material-reader";
import { formatDateRu } from "@/lib/agents/format";
import { paragraphsOf } from "@/lib/materials/fragments";
import { isSpecialty } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { pageSession } from "@/server/agents/page-session";
import { workspaceStore } from "@/server/agents/store";

export const dynamic = "force-dynamic";

/**
 * One of the physician's own materials, read inside the product: numbered
 * paragraphs (the place a passage is cited by) and «Спросить» on a fragment.
 * Only the owner's session can open it; the text shown is the de-identified
 * text stored at upload.
 */
export default async function MaterialPage({ params }: { params: Promise<{ specialty: string; id: string }> }) {
  const { specialty, id } = await params;
  if (!isSpecialty(specialty)) notFound();
  const sessionId = await pageSession(specialty);
  const material = sessionId ? (await workspaceStore().listMaterials(sessionId, specialty)).find(item => item.id === id) : undefined;
  if (!material) notFound();
  const paragraphs = paragraphsOf(material.text);
  const added = formatDateRu(material.createdAt, { day: "numeric", month: "long", year: "numeric" });
  return <div className="ws-page pt-material-view">
    <Link className="ws-back" href={`/${specialty}/materials`}><ArrowLeft size={15} aria-hidden="true" />Мои материалы</Link>
    <header className="ws-page-head">
      <h1>{nbsp(material.title)}</h1>
      <p>{nbsp([material.fileName, added ? `добавлен ${added}` : null, material.redactions.length ? "персональные данные замаскированы при загрузке" : null].filter(Boolean).join(" · "))}</p>
    </header>
    {paragraphs.length
      ? <MaterialReader specialty={specialty} materialId={material.id} paragraphs={paragraphs} />
      : <p className="ws-empty">{nbsp(`Текст этого материала не извлечён${material.parseNote ? `: ${material.parseNote}` : ""}. Вопрос к фрагменту доступен для заметок и для файлов TXT, MD, CSV, HTML и DOCX.`)}</p>}
  </div>;
}
