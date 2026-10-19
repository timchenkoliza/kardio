import { describe, expect, it } from "vitest";
import { APPROVED_CARDIOLOGY_MEDIA, approvedAnatomyMedia, approvedImagingMedia } from "@/lib/ui/approved-medical-media";

describe("approved medical media", () => {
  it("ships a cardiology anatomy asset and multiple imaging modalities", () => {
    expect(approvedAnatomyMedia("cardiology")?.modality).toBe("anatomy");
    expect(new Set(approvedImagingMedia("cardiology").map(asset => asset.modality))).toEqual(
      new Set(["anatomy", "echo", "mri", "angiography", "ct"]),
    );
  });

  it("keeps oncology empty instead of reusing cardiology imagery", () => {
    expect(approvedImagingMedia("oncology")).toEqual([]);
  });

  it("requires attribution metadata on every approved asset", () => {
    for (const asset of APPROVED_CARDIOLOGY_MEDIA) {
      expect(asset.src).toMatch(/^https:\/\//u);
      expect(asset.credit.length).toBeGreaterThan(0);
      expect(asset.license.length).toBeGreaterThan(0);
      expect(asset.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org/u);
    }
  });
});
