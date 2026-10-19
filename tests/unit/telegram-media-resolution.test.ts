import { describe, expect, it } from "vitest";
import {
  normalizeTelegramLocalMediaHref,
  resolveTelegramMediaReference,
  semanticRoleForTelegramMedia,
  type RawMediaArtifactLike,
} from "@/server/ingestion/telegram-media-resolution";

const artifacts: RawMediaArtifactLike[] = [
  { id: "root", providerItemId: "root-provider", parentProviderItemId: null, sourceRegistryId: "cardiology-01", name: "cardiology-01", mimeType: "application/vnd.google-apps.folder" },
  { id: "photos", providerItemId: "photos-provider", parentProviderItemId: "root-provider", sourceRegistryId: "cardiology-01", name: "photos", mimeType: "application/vnd.google-apps.folder" },
  { id: "photo", providerItemId: "photo-provider", parentProviderItemId: "photos-provider", sourceRegistryId: "cardiology-01", name: "photo_7.jpg", mimeType: "image/jpeg" },
];

describe("Telegram media resolution", () => {
  it("normalizes safe relative media hrefs", () => {
    expect(normalizeTelegramLocalMediaHref("./photos/photo_7.jpg?x=1#preview")).toBe("photos/photo_7.jpg");
    expect(normalizeTelegramLocalMediaHref("photos\\photo_7.jpg")).toBe("photos/photo_7.jpg");
  });

  it("rejects remote and traversal hrefs", () => {
    expect(normalizeTelegramLocalMediaHref("https://example.com/photo.jpg")).toBeNull();
    expect(normalizeTelegramLocalMediaHref("../photo.jpg")).toBeNull();
  });

  it("classifies source media without inferring a clinical diagnosis", () => {
    expect(semanticRoleForTelegramMedia("photo")).toBe("image_candidate");
    expect(semanticRoleForTelegramMedia("video")).toBe("cine_candidate");
    expect(semanticRoleForTelegramMedia("file")).toBe("document_candidate");
  });

  it("resolves a local Telegram path to raw transport while keeping rights blocked", () => {
    const resolved = resolveTelegramMediaReference({
      candidateId: "post:7",
      sourceRegistryId: "cardiology-01",
      ordinal: 0,
      href: "photos/photo_7.jpg",
      kind: "photo",
    }, artifacts);

    expect(resolved.transportResolution).toBe("resolved");
    expect(resolved.rawArtifactId).toBe("photo");
    expect(resolved.rightsState).toBe("unknown");
    expect(resolved.productEligibility).toBe("blocked_rights_unknown");
  });

  it("does not substitute a missing binary with a different artifact", () => {
    const resolved = resolveTelegramMediaReference({
      candidateId: "post:8",
      sourceRegistryId: "cardiology-01",
      ordinal: 0,
      href: "video_files/unknown.mp4",
      kind: "video",
    }, artifacts);

    expect(resolved.transportResolution).toBe("missing");
    expect(resolved.rawArtifactId).toBeNull();
    expect(resolved.productEligibility).toBe("blocked_missing_transport");
  });
});
