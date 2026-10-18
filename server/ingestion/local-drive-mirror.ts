import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import type { SpecialtyId } from "@/lib/domain/types";
import type { DriveSourceRegistry, RawArchiveItem, RawArchiveProvider } from "@/server/ingestion/drive-source";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function mimeTypeFor(path: string, isFolder: boolean): string {
  if (isFolder) return FOLDER_MIME;
  switch (extname(path).toLowerCase()) {
    case ".html": return "text/html";
    case ".json": return "application/json";
    case ".txt": return "text/plain";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".mp4": return "video/mp4";
    case ".pdf": return "application/pdf";
    default: return "application/octet-stream";
  }
}

export class LocalDriveMirrorProvider implements RawArchiveProvider {
  readonly kind = "local_mirror" as const;
  private readonly rootPath: string;
  private readonly idToPath = new Map<string, string>();
  private readonly pathToId = new Map<string, string>();

  constructor(rootPath: string, registry: DriveSourceRegistry) {
    this.rootPath = resolve(rootPath);
    this.registerKnown(registry.root.folder_id, this.rootPath);
    this.registerKnown(registry.collections.telegram.folder_id, join(this.rootPath, "telegram"));
    this.registerKnown(registry.collections.journals.folder_id, join(this.rootPath, "journals"));
    this.registerKnown(registry.collections.events.folder_id, join(this.rootPath, "events"));
    this.registerKnown(registry.collections.experts.folder_id, join(this.rootPath, "experts"));
    for (const source of registry.telegram_exports) this.registerKnown(source.folder_id, join(this.rootPath, "telegram", source.id));
  }

  private registerKnown(id: string, path: string): void {
    const resolved = resolve(path);
    this.idToPath.set(id, resolved);
    this.pathToId.set(resolved, id);
  }

  private idForPath(path: string): string {
    const resolved = resolve(path);
    const known = this.pathToId.get(resolved);
    if (known) return known;
    const rel = relative(this.rootPath, resolved).split("\\").join("/");
    const id = `local:${encodeURIComponent(rel)}`;
    this.registerKnown(id, resolved);
    return id;
  }

  private pathForId(id: string): string {
    const path = this.idToPath.get(id);
    if (!path) throw new Error(`Unknown local mirror item ${id}`);
    return path;
  }

  private async item(path: string, parentId: string | null, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<RawArchiveItem> {
    const info = await stat(path);
    return {
      id: this.idForPath(path),
      name: basename(path),
      mimeType: mimeTypeFor(path, info.isDirectory()),
      parentId,
      specialty: context?.specialty ?? null,
      sourceRegistryId: context?.sourceRegistryId ?? null,
      size: info.isFile() ? info.size : null,
      modifiedAt: info.mtime.toISOString(),
      isFolder: info.isDirectory(),
    };
  }

  async listChildren(folderId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<readonly RawArchiveItem[]> {
    const folderPath = this.pathForId(folderId);
    const entries = await readdir(folderPath, { withFileTypes: true });
    const items: RawArchiveItem[] = [];
    for (const entry of entries) items.push(await this.item(join(folderPath, entry.name), folderId, context));
    return items.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  async getMetadata(itemId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<RawArchiveItem> {
    const path = this.pathForId(itemId);
    const parentPath = resolve(path, "..");
    const parentId = parentPath === path || !parentPath.startsWith(this.rootPath) ? null : this.idForPath(parentPath);
    return this.item(path, parentId, context);
  }

  async readText(itemId: string): Promise<string> {
    return readFile(this.pathForId(itemId), "utf8");
  }

  async materializeBinary(itemId: string): Promise<string> {
    const path = this.pathForId(itemId);
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`Cannot materialize local folder ${itemId}`);
    return path;
  }
}
