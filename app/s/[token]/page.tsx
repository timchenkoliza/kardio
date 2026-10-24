import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatDateRu } from "@/lib/agents/format";
import { SHARE_TOKEN } from "@/lib/sharing/snapshot";
import { getSpecialty } from "@/lib/specialty";
import { nbsp } from "@/lib/ui/typography";
import { recordAgentEvent } from "@/server/agents/telemetry";
import { shareState, shareStore, type ShareRecord } from "@/server/sharing/store";

export const dynamic = "force-dynamic";

/**
 * A shared result, opened by anyone with the link: a frozen copy made at the
 * moment of sharing — title, short text, sources with their verification
 * label and dates. No session data, no library, no profile; never indexed.
 */

async function load(token: string): Promise<ShareRecord | null> {
  if (!SHARE_TOKEN.test(token)) return null;
  return shareStore().get(token).catch(() => null);
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const record = await load(token);
  const robots = { index: false, follow: false };
  if (!record || shareState(record, new Date()) !== "active") return { title: "Ссылка не действует · Яндекс Мед", robots, referrer: "no-referrer" };
  return { title: `${record.payload.title} · Яндекс Мед`, description: record.payload.summary.slice(0, 200), robots, referrer: "no-referrer", openGraph: { title: record.payload.title, description: record.payload.summary.slice(0, 200), type: "article" } };
}

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await load(token);
  const now = new Date();
  const state = shareState(record, now);

  if (!record || state !== "active") {
    return <main className="sh-page" data-share-state={state}>
      <section className="sh-card">
        <h1>Ссылка больше не действует</h1>
        <p>{nbsp(state === "revoked" ? "Автор отозвал эту ссылку." : state === "expired" ? "Срок действия ссылки истёк: ссылки действуют 30 дней." : "Такой ссылки нет. Проверьте, что она скопирована полностью.")}</p>
        <p><Link className="ws-text-link" href="/">Открыть Яндекс Мед для врачей</Link></p>
      </section>
    </main>;
  }

  await shareStore().recordOpen(token, now).catch(() => undefined);
  await recordAgentEvent(null, "share_opened", { specialty: record.specialty });
  const { payload } = record;
  const specialty = getSpecialty(payload.specialty);
  const sharedAt = formatDateRu(payload.sharedAt) ?? payload.sharedAt;

  return <main className="sh-page" data-share-state="active" data-specialty={payload.specialty}>
    <article className="sh-card" aria-labelledby="sh-title">
      <p className="sh-kicker">{payload.typeLabel} · {specialty.name}</p>
      <h1 id="sh-title">{nbsp(payload.title)}</h1>
      <p className="sh-summary">{nbsp(payload.summary)}</p>
      <p className="sh-meta">{nbsp(`Копия материала от ${sharedAt} — на момент, когда им поделились; она не обновляется. Перед применением сверьте с первоисточником.`)}</p>
      {payload.sources.length > 0 && <section aria-labelledby="sh-sources">
        <h2 id="sh-sources">Источники</h2>
        <ul className="sh-sources">{payload.sources.map(source => <li key={source.url ?? source.title}>
          {source.url ? <a className="ws-text-link" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={14} aria-hidden="true" /></a> : <span>{source.title}</span>}
          <span className="sh-source-meta">{[source.publisher, formatDateRu(source.date), source.verification].filter(Boolean).join(" · ")}</span>
        </li>)}</ul>
      </section>}
    </article>
    <aside className="sh-card sh-cta" aria-label="О сервисе">
      <p>{nbsp(`Яндекс Мед для врачей: ответы по источникам, клинические рекомендации, препараты и новое по специальности «${specialty.name}» — у каждого утверждения есть источник и дата.`)}</p>
      <p><Link className="ws-text-link" href={`/${payload.specialty}`}>Открыть раздел «{specialty.name}»</Link></p>
    </aside>
  </main>;
}
