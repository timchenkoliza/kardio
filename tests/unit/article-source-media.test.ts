import { describe, expect, it } from "vitest";
import { resolveOriginalArticleImage, telegramMessageIdFromContent, telegramMessageIdFromMediaFilename } from "@/lib/ui/article-source-media";

const provenance = { type: "telegram", asset: null, location: null, notes: null };

describe("article source media matching", () => {
  it("extracts Telegram message ids from exported filenames and canonical URLs", () => {
    expect(telegramMessageIdFromMediaFilename("photo_3813_0.jpg")).toBe("3813");
    expect(telegramMessageIdFromContent({ canonicalUrl: "https://t.me/example/3813", provenance })).toBe("3813");
  });

  it("prefers the first image belonging to the matching message", () => {
    const match = resolveOriginalArticleImage(
      { specialty: "cardiology", canonicalUrl: "https://t.me/example/3813", provenance },
      [
        { id: "b", provider: "google_drive_api", providerItemId: "b", sourceRegistryId: "source", specialty: "cardiology", name: "photo_3813_1.jpg", mimeType: "image/jpeg" },
        { id: "a", provider: "google_drive_api", providerItemId: "a", sourceRegistryId: "source", specialty: "cardiology", name: "photo_3813_0.jpg", mimeType: "image/jpeg" },
        { id: "wrong", provider: "google_drive_api", providerItemId: "wrong", sourceRegistryId: "source", specialty: "cardiology", name: "photo_3814_0.jpg", mimeType: "image/jpeg" },
      ],
    );
    expect(match?.id).toBe("a");
  });

  it("uses an explicit provenance asset before filename heuristics", () => {
    const match = resolveOriginalArticleImage(
      { specialty: "oncology", canonicalUrl: null, provenance: { ...provenance, asset: "photo_42_2.jpg" } },
      [
        { id: "exact", provider: "yandex_disk_api", providerItemId: "/photos/photo_42_2.jpg", sourceRegistryId: "source", specialty: "oncology", name: "photo_42_2.jpg", mimeType: "image/jpeg" },
      ],
    );
    expect(match?.id).toBe("exact");
  });
});
