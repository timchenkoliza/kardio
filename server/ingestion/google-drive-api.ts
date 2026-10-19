import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import type { SpecialtyId } from "@/lib/domain/types";
import type { RawArchiveItem, RawArchiveProvider } from "@/server/ingestion/drive-source";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

interface DriveFileResource {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
}

interface DriveListResponse {
  files?: DriveFileResource[];
  nextPageToken?: string;
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value);
}

function toArchiveItem(
  file: DriveFileResource,
  context?: { specialty?: SpecialtyId; sourceRegistryId?: string },
): RawArchiveItem {
  const parsedSize = file.size === undefined ? null : Number(file.size);
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parentId: file.parents?.[0] ?? null,
    specialty: context?.specialty ?? null,
    sourceRegistryId: context?.sourceRegistryId ?? null,
    size: parsedSize !== null && Number.isFinite(parsedSize) ? parsedSize : null,
    modifiedAt: file.modifiedTime ?? null,
    isFolder: file.mimeType === FOLDER_MIME,
  };
}

export class GoogleDriveApiProvider implements RawArchiveProvider {
  readonly kind = "google_drive_api" as const;

  constructor(private readonly accessToken: string) {
    if (!accessToken.trim()) throw new Error("Google Drive access token is required");
  }

  private async request(url: string): Promise<Response> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Google Drive API ${response.status}: ${body.slice(0, 500)}`);
    }
    return response;
  }

  async listChildren(folderId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<readonly RawArchiveItem[]> {
    const items: RawArchiveItem[] = [];
    let pageToken: string | undefined;
    do {
      const query = `'${folderId.replaceAll("'", "\\'")}' in parents and trashed = false`;
      const params = new URLSearchParams({
        q: query,
        pageSize: "1000",
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await this.request(`${DRIVE_API}/files?${params.toString()}`);
      const payload = await response.json() as DriveListResponse;
      for (const file of payload.files ?? []) items.push(toArchiveItem(file, context));
      pageToken = payload.nextPageToken;
    } while (pageToken);
    return items;
  }

  async getMetadata(itemId: string, context?: { specialty?: SpecialtyId; sourceRegistryId?: string }): Promise<RawArchiveItem> {
    const fields = encodeQuery("id,name,mimeType,size,modifiedTime,parents");
    const response = await this.request(`${DRIVE_API}/files/${encodeURIComponent(itemId)}?fields=${fields}&supportsAllDrives=true`);
    return toArchiveItem(await response.json() as DriveFileResource, context);
  }

  async readText(itemId: string): Promise<string> {
    const response = await this.request(`${DRIVE_API}/files/${encodeURIComponent(itemId)}?alt=media&supportsAllDrives=true`);
    return response.text();
  }

  async materializeBinary(itemId: string): Promise<string> {
    const metadata = await this.getMetadata(itemId);
    if (metadata.isFolder) throw new Error(`Cannot materialize Drive folder ${itemId}`);
    const response = await this.request(`${DRIVE_API}/files/${encodeURIComponent(itemId)}?alt=media&supportsAllDrives=true`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const directory = join(tmpdir(), "kardio-drive-cache");
    await mkdir(directory, { recursive: true });
    const safeName = basename(metadata.name).replace(/[^A-Za-z0-9._-]+/g, "_") || itemId;
    const path = join(directory, `${itemId}-${safeName}`);
    await writeFile(path, bytes);
    return path;
  }
}

export function googleDriveProviderFromEnv(): GoogleDriveApiProvider {
  const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!token) throw new Error("GOOGLE_DRIVE_ACCESS_TOKEN is required for Drive API sync");
  return new GoogleDriveApiProvider(token);
}
