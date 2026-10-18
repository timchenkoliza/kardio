export type SpecialtyId = "cardiology" | "oncology";
export type Shell = "explore" | "practice" | "workspace";
export type ContentKind = "guideline" | "article" | "video" | "event" | "clinical" | "service" | "tool" | "drug" | "referral";
export type Currentness = "current" | "review" | "superseded" | "archived";

export interface Source {
  id: string;
  specialty: SpecialtyId;
  name: string;
  type: string;
  publisher: string | null;
  url: string | null;
  trustStatus: string;
  commercialStatus: string;
  metadataCompleteness: number;
  notes: string | null;
  lastCheckedAt: string | null;
}
export interface Asset {
  id: string;
  url: string | null;
  sourceUrl: string | null;
  credit: string | null;
  caption: string | null;
  status: string;
  rights: string;
  semanticMatch: string;
  width: number | null;
  height: number | null;
}
export interface ContentObject {
  id: string;
  specialty: SpecialtyId;
  kind: ContentKind;
  type: string;
  title: string;
  summary: string;
  sourceId: string;
  source: Source;
  canonicalUrl: string | null;
  publicationDate: string | null;
  publicationYear: number | null;
  updatedAt: string | null;
  lastCheckedAt: string | null;
  language: string;
  topics: string[];
  tags: string[];
  currentness: Currentness;
  requiresReview: boolean;
  freshness: string;
  version: string | null;
  parentId: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  trustLayer: string;
  editorialStatus: string;
  rightsStatus: string;
  priority: number;
  author: string | null;
  provenance: { type: string; asset: string | null; location: string | null; notes: string | null };
  asset: Asset | null;
}
export type QueryIntent = "all" | "guideline" | "evidence" | "tool" | "drug" | "referral" | "source" | "update" | "education" | "event";
export interface RankedResult {
  content: ContentObject;
  score: number;
  reasons: string[];
  components: Record<string, number>;
}
export interface SearchResponse {
  results: RankedResult[];
  total: number;
  intent: QueryIntent;
  query: string;
}
export interface RecentEntry {
  kind: "content" | "source" | "query";
  specialty: SpecialtyId;
  id?: string;
  query?: string;
  at: string;
}
export interface Collection {
  id: string;
  specialty: SpecialtyId;
  name: string;
  contentIds: string[];
}
export interface UserState {
  specialty: SpecialtyId;
  shell: Shell;
  savedIds: string[];
  pinnedIds: string[];
  pinnedSourceIds: string[];
  followedSourceIds: string[];
  followedTopics: string[];
  recent: RecentEntry[];
  collections: Collection[];
}
export type StateCommand =
  | { action: "preferences"; specialty?: SpecialtyId; shell?: Shell }
  | { action: "save" | "pin" | "followSource" | "pinSource" | "followTopic"; id: string; enabled: boolean; specialty: SpecialtyId }
  | { action: "recent"; entry: Omit<RecentEntry, "at"> }
  | { action: "createCollection"; name: string; specialty: SpecialtyId }
  | { action: "collectionItem"; collectionId: string; contentId: string; enabled: boolean; specialty: SpecialtyId }
  | { action: "deleteCollection"; collectionId: string; specialty: SpecialtyId }
  | { action: "clearHistory" };
export const emptyUserState = (): UserState => ({ specialty: "cardiology", shell: "explore", savedIds: [], pinnedIds: [], pinnedSourceIds: [], followedSourceIds: [], followedTopics: [], recent: [], collections: [] });
