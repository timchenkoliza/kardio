import { LAUNCH_SPECIALTY_IDS, SPECIALTY_IDS, type SpecialtyId } from "@/lib/domain/types";

/**
 * Specialty adapters. The portal shell, contracts and interaction model are
 * shared; what differs per specialty is data, never the product.
 *
 * - `catalog`: a canonical, provenance-checked dataset exists (only cardiology,
 *   the Golden Set). Other specialties never borrow it.
 * - `pubmedScope`: a PubMed query fragment that defines the specialty for
 *   live literature updates and learning when the physician has given no topic.
 *   It is a search scope, not a clinical claim.
 * - `organisers`: official organiser or CME pages, verified reachable on the
 *   date given. They are hand-offs to calendars, not event records.
 */
export interface OrganiserLink {
  name: string;
  url: string;
  checkedAt: string;
}

export interface SpecialtyAdapter {
  id: SpecialtyId;
  name: string;
  title: string;
  /** Physician noun, singular: «Терапевт». */
  physician: string;
  /** Physicians, plural: «Терапевты». Used for audience labels. */
  audience: string;
  /** Dative plural: «терапевтам». */
  audienceDative: string;
  description: string;
  launch: boolean;
  available: boolean;
  dataset: string | null;
  catalog: boolean;
  emptyMessage: string;
  pubmedScope: string;
  organisers: OrganiserLink[];
  ingestion: { requiresSource: true; requiresRightsReview: true; requiresEditorialReview: true };
}

const INGESTION = { requiresSource: true, requiresRightsReview: true, requiresEditorialReview: true } as const;
const CHECKED = "2026-10-21";
const NMO_PORTAL: OrganiserLink = { name: "Портал непрерывного медицинского образования Минздрава", url: "https://edu.rosminzdrav.ru/", checkedAt: CHECKED };
const LIVE_EMPTY = "Собственного проверенного каталога по специальности пока нет. Ответы и обновления собираются из открытых источников с указанием происхождения.";

export const specialties: Record<SpecialtyId, SpecialtyAdapter> = {
  therapy: {
    id: "therapy", name: "Терапия", title: "Терапия", physician: "Терапевт", audience: "Терапевты", audienceDative: "терапевтам",
    description: "Ответы, рекомендации, препараты и обновления для терапевта.",
    launch: true, available: true, dataset: null, catalog: false, emptyMessage: LIVE_EMPTY,
    pubmedScope: "\"primary care\"[tiab] OR \"general practice\"[tiab] OR \"internal medicine\"[tiab] OR hypertension[tiab] OR \"type 2 diabetes\"[tiab] OR COPD[tiab] OR asthma[tiab] OR pneumonia[tiab]",
    organisers: [NMO_PORTAL],
    ingestion: INGESTION,
  },
  pediatrics: {
    id: "pediatrics", name: "Педиатрия", title: "Педиатрия", physician: "Педиатр", audience: "Педиатры", audienceDative: "педиатрам",
    description: "Ответы, рекомендации, препараты и обновления для педиатра.",
    launch: true, available: true, dataset: null, catalog: false, emptyMessage: LIVE_EMPTY,
    pubmedScope: "child*[tiab] OR infant*[tiab] OR pediatric*[tiab] OR paediatric*[tiab] OR adolescen*[tiab] OR neonat*[tiab]",
    organisers: [{ name: "Союз педиатров России", url: "https://www.pediatr-russia.ru/", checkedAt: CHECKED }, NMO_PORTAL],
    ingestion: INGESTION,
  },
  obgyn: {
    id: "obgyn", name: "Акушерство и гинекология", title: "Акушерство и гинекология", physician: "Акушер-гинеколог", audience: "Акушеры-гинекологи", audienceDative: "акушерам-гинекологам",
    description: "Ответы, рекомендации, препараты и обновления для акушера-гинеколога.",
    launch: true, available: true, dataset: null, catalog: false, emptyMessage: LIVE_EMPTY,
    pubmedScope: "pregnan*[tiab] OR obstetric*[tiab] OR gynecolog*[tiab] OR gynaecolog*[tiab] OR endometriosis[tiab] OR menopaus*[tiab] OR contracepti*[tiab] OR infertility[tiab]",
    organisers: [{ name: "Российское общество акушеров-гинекологов (РОАГ)", url: "https://roag-portal.ru/", checkedAt: CHECKED }, NMO_PORTAL],
    ingestion: INGESTION,
  },
  cardiology: {
    id: "cardiology", name: "Кардиология", title: "Кардиология", physician: "Кардиолог", audience: "Кардиологи", audienceDative: "кардиологам",
    description: "Рекомендации, исследования и профессиональные источники по кардиологии.",
    launch: true, available: true, dataset: "cardio-goldenset-v2", catalog: true,
    emptyMessage: "Подходящих материалов пока нет. Измените запрос или фильтры.",
    pubmedScope: "cardiovascular[tiab] OR \"heart failure\"[tiab] OR \"atrial fibrillation\"[tiab] OR \"coronary artery disease\"[tiab] OR \"myocardial infarction\"[tiab] OR hypertension[tiab]",
    organisers: [{ name: "Российское кардиологическое общество", url: "https://scardio.ru/", checkedAt: CHECKED }, NMO_PORTAL],
    ingestion: INGESTION,
  },
  neurology: {
    id: "neurology", name: "Неврология", title: "Неврология", physician: "Невролог", audience: "Неврологи", audienceDative: "неврологам",
    description: "Ответы, рекомендации, препараты и обновления для невролога.",
    launch: true, available: true, dataset: null, catalog: false, emptyMessage: LIVE_EMPTY,
    pubmedScope: "stroke[tiab] OR epilep*[tiab] OR migraine[tiab] OR \"multiple sclerosis\"[tiab] OR parkinson*[tiab] OR dementia[tiab] OR neuropath*[tiab]",
    organisers: [NMO_PORTAL],
    ingestion: INGESTION,
  },
  endocrinology: {
    id: "endocrinology", name: "Эндокринология", title: "Эндокринология", physician: "Эндокринолог", audience: "Эндокринологи", audienceDative: "эндокринологам",
    description: "Ответы, рекомендации, препараты и обновления для эндокринолога.",
    launch: true, available: true, dataset: null, catalog: false, emptyMessage: LIVE_EMPTY,
    pubmedScope: "diabet*[tiab] OR thyroid*[tiab] OR obesity[tiab] OR osteoporosis[tiab] OR adrenal[tiab] OR pituitary[tiab]",
    organisers: [{ name: "Российская ассоциация эндокринологов", url: "https://www.rae-org.ru/", checkedAt: CHECKED }, NMO_PORTAL],
    ingestion: INGESTION,
  },
  oncology: {
    id: "oncology", name: "Онкология", title: "Онкология", physician: "Онколог", audience: "Онкологи", audienceDative: "онкологам",
    description: "Раздел готов к подключению проверенного онкологического контента.",
    launch: false, available: false, dataset: null, catalog: false,
    emptyMessage: "Онкологический набор ещё не подключён. Материалы появятся после проверки источников, редакции и прав.",
    pubmedScope: "neoplasm*[tiab] OR cancer[tiab] OR tumor*[tiab] OR tumour*[tiab]",
    organisers: [NMO_PORTAL],
    ingestion: INGESTION,
  },
};

export function isSpecialty(value: unknown): value is SpecialtyId {
  return typeof value === "string" && (SPECIALTY_IDS as readonly string[]).includes(value);
}

export function isLaunchSpecialty(value: unknown): boolean {
  return typeof value === "string" && (LAUNCH_SPECIALTY_IDS as readonly string[]).includes(value);
}

export function getSpecialty(id: SpecialtyId): SpecialtyAdapter { return specialties[id]; }
export const specialtyList = SPECIALTY_IDS.map(id => specialties[id]);
export const launchSpecialtyList = LAUNCH_SPECIALTY_IDS.map(id => specialties[id]);
