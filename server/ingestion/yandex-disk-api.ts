import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { SpecialtyId } from "@/lib/domain/types";
import type { RawArchiveItem, RawArchiveProvider } from "@/server/ingestion/drive-source";

const YANDEX_DISK_API = "https://cloud-api.yandex.net/v1/disk";
const FOLDER_MIME = "application/vnd.yandex.disk.folder";

interface YandexResource {
  name: string;
  path: string;
  type: "dir" | "file";
  mime_type?: string;
  size?: number;
  modified?: string;
  _embedded?: {
    items?: YandexResource[];
    total?: number;
    offset?: number;
    limit?: number;
  };
}

interface YandexDownloadLink {
  href: string;
  method?: string;
  templated?: boolean;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Yandex Disk path is required");
  const withoutPrefix = trimmed.replace(/^disk:/u, "");
  return withoutPrefix.startsWith("/") ? withoutPrefix : `/${withoutPrefix}`;
}

function parentPath(path: string): string | null {
  const normalized = normalizePath(path);
  if (normalized === "/") return null;
  const parent = dirname(normalized).replaceAll("\\", "/");
  return parent === "." ? "/" : parent;
}

function toArchiveItem(
  resource: YandexResource,
  context?: { specialty?: SpecialtyId; sourceRegistryId?: string },
): RawArchiveItem {
  const path = normalizePath(resource.path);
  return {
    id: path,
    name: resource.name,
    mimeType: resource.type === "dir" ? FOLDER_MIME : (resource.mime_type ?? "application/octet-stream"),
    parentId: parentPath(path),
    specialty: context?.specialty ?? null,
    sourceRegistryId: context?.sourceRegistryId ?? null,
    size: resource.size ?? null,
    modifiedAt: resource.modified ?? null,
    isFolder: resource.type === "dir",
  };
}

export class YandexDiskApiProvider implements RawArchiveProvider {
  readonly kind = "yandex_disk_api" as const;

  constructor(private readonly accessToken: string) {
    if (!accessToken.trim()) throw new Error("Yandex Disk access token is required");
  }

  private async apiRequest(endpoint: string, params: Record<string, string>): Promise<Response> {
    const search = new URLSearchParams(params);
    const response = await fetch(`${YANDEX_DISK_API}${endpoint}?${search.toString()}`, {
      headers: { Authorization: `OAuth ${this.accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Yandex Disk API ${response.status}: ${body.slice(0, 500)}`);
    }
    return response;
  }

  async listChildren(folderId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<readonly RawArchiveItem[]> {
    const path = normalizePath(folderId);
    const items: RawArchiveItem[] = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
      const response = await this.apiRequest("/resources", {
        path,
        limit: String(limit),
        offset: String(offset),
        fields: "_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.mime_type,_embedded.items.size,_embedded.items.modified,_embedded.total",
      });
      const payload = await response.json() as YandexResource;
      const page = payload._embedded?.items ?? [];
      items.push(...page.map(item => toArchiveItem(item, context)));
      const total = payload._embedded?.total ?? items.length;
      offset += page.length;
      if (page.length === 0 || offset >= total) break;
    }

    return items;
  }

  async getMetadata(itemId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<RawArchiveItem> {
    const response = await this.apiRequest("/resources", {
      path: normalizePath(itemId),
      fields: "name,path,type,mime_type,size,modified",
    });
    return toArchiveItem(await response.json() as YandexResource, context);
  }

  private async downloadLink(itemId: string): Promise<string> {
    const response = await this.apiRequest("/resources/download", { path: normalizePath(itemId) });
    const payload = await response.json() as YandexDownloadLink;
    if (!payload.href) throw new Error(`Yandex Disk did not return a download URL for ${itemId}`);
    return payload.href;
  }

  async readText(itemId: string): Promise<string> {
    const response = await fetch(await this.downloadLink(itemId));
    if (!response.ok) throw new Error(`Yandex Disk download ${response.status}`);
    return response.text();
  }

  async materializeBinary(itemId: string): Promise<string> {
    const metadata = await this.getMetadata(itemId);
    if (metadata.isFolder) throw new Error(`Cannot materialize Yandex Disk folder ${itemId}`);
    const response = await fetch(await this.downloadLink(itemId));
    if (!response.ok) throw new Error(`Yandex Disk download ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const directory = join(tmpdir(), "kardio-yandex-disk-cache");
    await mkdir(directory, { recursive: true });
    const safeName = basename(metadata.name).replace(/[^A-Za-z0-9._-]+/g, "_") || "asset";
    const pathKey = Buffer.from(normalizePath(itemId)).toString("base64url").slice(0, 32);
    const path = join(directory, `${pathKey}-${safeName}`);
    await writeFile(path, bytes);
    return path;
  }
}

export function yandexDiskProviderFromEnv(): YandexDiskApiProvider {
  const token = process.env.YANDEX_DISK_ACCESS_TOKEN;
  if (!token) throw new Error("YANDEX_DISK_ACCESS_TOKEN is required for Yandex Disk media sync");
  return new YandexDiskApiProvider(token);
}
