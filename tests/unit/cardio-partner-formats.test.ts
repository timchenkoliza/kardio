import { describe, expect, it } from "vitest";
import { CARDIO_PARTNER_FORMATS } from "@/lib/demo/cardio-partner-formats";

describe("cardiology partner format prototypes", () => {
  it("keeps a compact five-format demo set", () => {
    expect(CARDIO_PARTNER_FORMATS).toHaveLength(5);
    expect(new Set(CARDIO_PARTNER_FORMATS.map(item => item.id)).size).toBe(5);
  });

  it("labels every format as HCP-facing and synthetic", () => {
    for (const item of CARDIO_PARTNER_FORMATS) {
      expect(item.audience).toBe("HCP");
      expect(item.disclosure.toLocaleLowerCase("ru-RU")).toMatch(/партн|поддерж/);
      if (item.brand) expect(item.brand.toLocaleLowerCase("ru-RU")).toContain("демо");
    }
  });

  it("does not use real reference-company names", () => {
    const payload = JSON.stringify(CARDIO_PARTNER_FORMATS).toLocaleLowerCase("ru-RU");
    for (const name of ["moderna", "герофарм", "промомед", "astrazeneca", "астразенека", "bayer", "байер", "гедеон", "richter", "рихтер"]) {
      expect(payload).not.toContain(name);
    }
  });
});
