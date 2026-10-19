import { describe, expect, it } from "vitest";
import {
  PROTOTYPE_MEDIA_BANK,
  extractBundledImageDataUri,
  prototypeImagingMedia,
  prototypeMediaAwaitingRightsReview,
  prototypeMediaForContent,
} from "@/lib/ui/prototype-media-bank";

describe("prototype media bank", () => {
  it("keeps the matched echo still blocked until rights are explicitly approved", () => {
    const asset = PROTOTYPE_MEDIA_BANK.find(item => item.id === "cardiology-echo-still");
    expect(asset?.src).toBe("/api/prototype-media/echo");
    expect(asset?.rightsStatus).toBe("needs_review");
    expect(prototypeMediaForContent({ id: "fact-ar-echo-2025", specialty: "cardiology" })).toBeNull();
    expect(prototypeMediaAwaitingRightsReview("cardiology").map(item => item.id)).toContain("cardiology-echo-still");
  });

  it("keeps MR and angiography clips registered but not falsely runtime-available", () => {
    const media = prototypeImagingMedia("cardiology");
    const mr = media.find(asset => asset.modality === "mri");
    const angiography = media.find(asset => asset.modality === "angiography");
    expect(mr?.availability).toBe("registered_only");
    expect(mr?.src).toBeNull();
    expect(angiography?.availability).toBe("registered_only");
    expect(angiography?.src).toBeNull();
  });

  it("does not expose the synthetic support animation as real clinical media", () => {
    const excluded = PROTOTYPE_MEDIA_BANK.find(asset => asset.id === "cardiology-mechanical-support-animation");
    expect(excluded?.availability).toBe("excluded");
    expect(excluded?.renderPolicy).toBe("exclude_from_real_photo_pool");
    expect(prototypeImagingMedia("cardiology").some(asset => asset.id === excluded?.id)).toBe(false);
  });

  it("does not invent oncology media from cardiology assets", () => {
    expect(prototypeImagingMedia("oncology")).toEqual([]);
    expect(prototypeMediaAwaitingRightsReview("oncology")).toEqual([]);
  });

  it("parses only the constrained echo bundle format", () => {
    const uri = extractBundledImageDataUri("window.KARDIO_ECHO_IMAGE='data:image/jpeg;base64,QUJD';");
    expect(uri).toBe("data:image/jpeg;base64,QUJD");
    expect(() => extractBundledImageDataUri("window.anything = 'QUJD'")).toThrow(/Invalid prototype echo asset bundle/u);
  });
});
