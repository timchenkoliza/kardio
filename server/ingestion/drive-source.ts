import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { SpecialtyId } from "@/lib/domain/types";

const specialtySchema = z.enum(["cardiology", "oncology"]);

const telegramExportSchema = z.object({
  id: z.string().min(1),
  folder_id: z.string().min(1),
  specialty: specialtySchema,
  format: z.literal("telegram_desktop_html"),
  expected_entry: z.literal("messages.html"),
  canonical_authority: z.literal(false),
}).strict();

export const driveSourceRegistrySchema = z.object({
  version: z.literal(1),
  purpose: z.string().min(1),
  root: z.object({ folder_id: z.string().min(1), kind: z.literal("raw_archive") }).strict(),
  collections: z.object({
    telegram: z.object({ folder_id: z.string().min(1), kind: z.literal("telegram_exports") }).strict(),
    journals: z.object({ folder_id: z.string().min(1), kind: z.literal("journal_assets") }).strict(),
    events: z.object({ folder_id: z.string().min(1), kind: z.literal("event_assets") }).strict(),
    experts: z.object({ folder_id: z.string().min(1), kind: z.literal("expert_assets") }).strict(),
  }).strict(),
  telegram_exports: z.array(telegramExportSchema).min(1),
}).strict();

export type DriveSourceRegistry = z.infer<typeof driveSourceRegistrySchema>;
export type TelegramExportRegistryEntry = z.infer<typeof telegramExportSchema>;

export interface RawArchiveItem {
  id: string;
  name: string;
  mimeType: string;
  parentId: string | null;
  specialty: SpecialtyId | null;
  sourceRegistryId: string | null;
  size: number | null;
  modifiedAt: string | null;
  isFolder: boolean;
}

export interface RawArchiveProvider {
  readonly kind: "google_drive_api" | "local_mirror";
  listChildren(folderId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<readonly RawArchiveItem[]>;
  getMetadata(itemId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<RawArchiveItem>;
  readText(itemId: string): Promise<string>;
  /** Returns a local temporary/application-controlled path; never a Drive sharing URL. */
  materializeBinary(itemId: string): Promise<string>;
}

export async function loadDriveSourceRegistry(root = process.cwd()): Promise<DriveSourceRegistry> {
  const raw = JSON.parse(await readFile(join(root, "data/drive-source-registry.json"), "utf8")) as unknown;
  const registry = driveSourceRegistrySchema.parse(raw);
  const ids = registry.telegram_exports.map((entry) => entry.id);
  const folderIds = registry.telegram_exports.map((entry) => entry.folder_id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate Drive source registry ID");
  if (new Set(folderIds).size !== folderIds.length) throw new Error("Duplicate Telegram export folder ID");
  return registry;
}

export function telegramExportsForSpecialty(registry: DriveSourceRegistry, specialty: SpecialtyId): readonly TelegramExportRegistryEntry[] {
  return registry.telegram_exports.filter((entry) => entry.specialty === specialty);
}
