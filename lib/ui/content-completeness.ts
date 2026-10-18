import type { ContentObject, Source, SpecialtyId } from "@/lib/domain/types";
import { curatedSourcesForSpecialty, curatedSourcesForSurface } from "@/lib/ui/curated-external-tools";

export type ProductDestination = "sources" | "reference" | "education" | "events" | "tools" | "imaging";

export interface DestinationReadiness {
  destination: ProductDestination;
  ready: boolean;
  canonicalObjects: number;
  curatedExternalObjects: number;
  basis: string;
}

export interface ContentCompletenessSnapshot {
  specialty: SpecialtyId;
  destinations: readonly DestinationReadiness[];
  readyCount: number;
  totalCount: number;
}

function normalizedIdentity(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/\/$/, "")
    .trim();
}

export function uniqueCuratedSourceCount(specialty: SpecialtyId, canonicalSources: readonly Source[]): number {
  const canonicalIdentities = new Set(
    canonicalSources.flatMap(source => [normalizedIdentity(source.name), normalizedIdentity(source.url)].filter(Boolean)),
  );
  return curatedSourcesForSpecialty(specialty).filter(source => (
    !canonicalIdentities.has(normalizedIdentity(source.name))
    && !canonicalIdentities.has(normalizedIdentity(source.url))
  )).length;
}

export function educationContent(content: readonly ContentObject[]): ContentObject[] {
  return content.filter(item => (
    item.kind === "video"
    || item.tags.some(tag => /курс|лекц|образован|вебинар|школ/i.test(tag))
    || item.topics.some(topic => /курс|лекц|образован|вебинар|школ/i.test(topic))
  ));
}

export function canonicalEventContent(content: readonly ContentObject[]): ContentObject[] {
  return content.filter(item => item.kind === "event");
}

export function buildContentCompletenessSnapshot(args: {
  specialty: SpecialtyId;
  content: readonly ContentObject[];
  sources: readonly Source[];
}): ContentCompletenessSnapshot {
  const { specialty, content, sources } = args;
  const curatedSourceExtras = uniqueCuratedSourceCount(specialty, sources);
  const referenceExternal = curatedSourcesForSurface(specialty, "reference").length;
  const educationExternal = curatedSourcesForSurface(specialty, "education").length;
  const toolsExternal = curatedSourcesForSurface(specialty, "tools").length;
  const imagingExternal = curatedSourcesForSurface(specialty, "imaging").length;
  const educationCanonical = educationContent(content).length;
  const eventCanonical = canonicalEventContent(content).length;
  const nativeCardiologyCalculators = specialty === "cardiology" ? 2 : 0;
  const nativeImagingShell = specialty === "cardiology" ? 1 : 0;

  const destinations: DestinationReadiness[] = [
    {
      destination: "sources",
      ready: sources.length + curatedSourceExtras > 0,
      canonicalObjects: sources.length,
      curatedExternalObjects: curatedSourceExtras,
      basis: "Канонические источники каталога + явно отмеченные внешние ресурсы из исследования источников.",
    },
    {
      destination: "reference",
      ready: referenceExternal > 0,
      canonicalObjects: 0,
      curatedExternalObjects: referenceExternal,
      basis: "Внешние справочники и средства проверки взаимодействий из реестра источников; без синтетических клинических сущностей.",
    },
    {
      destination: "education",
      ready: educationCanonical + educationExternal > 0,
      canonicalObjects: educationCanonical,
      curatedExternalObjects: educationExternal,
      basis: "Канонические видео/образовательные материалы + образовательные платформы из реестра источников.",
    },
    {
      destination: "events",
      ready: eventCanonical > 0,
      canonicalObjects: eventCanonical,
      curatedExternalObjects: 0,
      basis: "Только канонические объекты event. Event reference candidates из staging сюда не промотируются автоматически.",
    },
    {
      destination: "tools",
      ready: nativeCardiologyCalculators + toolsExternal > 0,
      canonicalObjects: nativeCardiologyCalculators,
      curatedExternalObjects: toolsExternal,
      basis: "Нативные проверяемые demo-калькуляторы для кардиологии или явно заданные внешние инструменты специальности.",
    },
    {
      destination: "imaging",
      ready: nativeImagingShell + imagingExternal > 0,
      canonicalObjects: nativeImagingShell,
      curatedExternalObjects: imagingExternal,
      basis: "Локальный imaging shell + внешний DICOM reference; без загрузки пациентских данных на сервер.",
    },
  ];

  return {
    specialty,
    destinations,
    readyCount: destinations.filter(item => item.ready).length,
    totalCount: destinations.length,
  };
}
