import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentResultView } from "@/lib/agents/types";
import { APPROVED_CARDIOLOGY_MEDIA, approvedAnatomyMedia, approvedImagingMedia, matchCardioIllustration } from "@/lib/ui/approved-medical-media";
import { agentResultMedia, feedIllustrations } from "@/lib/ui/agent-result-media";

function result(id: string, title: string, kind: AgentResultView["kind"] = "update"): AgentResultView {
  return { id, specialty: "cardiology", kind, title, summary: "", category: null, reasonShown: [], partner: null } as unknown as AgentResultView;
}

describe("approved medical media", () => {
  it("ships local, attributed cardiology illustrations", () => {
    expect(approvedAnatomyMedia("cardiology")?.modality).toBe("anatomy");
    for (const asset of APPROVED_CARDIOLOGY_MEDIA) {
      expect(asset.src).toMatch(/^\/media\/cardiology\/[a-z-]+\.webp$/u);
      expect(existsSync(path.join("public", asset.src))).toBe(true);
      expect(asset.credit.length).toBeGreaterThan(0);
      expect(asset.license).toMatch(/^CC/u);
      expect(asset.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/u);
    }
  });

  it("keeps oncology empty instead of reusing cardiology imagery", () => {
    expect(approvedImagingMedia("oncology")).toEqual([]);
  });

  it("matches the most specific clinical object", () => {
    expect(matchCardioIllustration({ text: "Лёгочная артериальная гипертензия: селексипаг" })?.asset.modality).toBe("pulmonary_hypertension");
    expect(matchCardioIllustration({ text: "Баксдростат при резистентной артериальной гипертензии" })?.asset.modality).toBe("blood_pressure");
    expect(matchCardioIllustration({ text: "Антикоагулянты при фибрилляции предсердий" })?.asset.modality).toBe("ecg");
    expect(matchCardioIllustration({ text: "ЧКВ у пожилых с ОКС" })?.asset.modality).toBe("angiography");
    expect(matchCardioIllustration({ text: "Инклисиран и снижение ЛПНП" })?.asset.modality).toBe("atherosclerosis");
    expect(matchCardioIllustration({ text: "Афикамтен при обструктивной кардиомиопатии" })?.asset.modality).toBe("echo");
    expect(matchCardioIllustration({ text: "Кальциевый индекс по КТ" })?.asset.modality).toBe("ct");
  });

  it("does not show a weak proxy", () => {
    expect(matchCardioIllustration({ text: "Как устроена аккредитация НМО", kind: "update" })).toBeNull();
    expect(matchCardioIllustration({ text: "Задаток в аду" })).toBeNull();
  });

  it("illustrates four of every five article cards in the feed", () => {
    const feed = [
      result("1", "Фибрилляция предсердий: новые данные"),
      result("2", "Инфаркт миокарда у молодых"),
      result("3", "Статины и ЛПНП"),
      result("4", "Сердечная недостаточность с сохранённой фракцией выброса"),
      result("5", "Артериальная гипертензия: обновление рекомендаций"),
      result("e", "ESC Congress", "event"),
    ];
    const media = feedIllustrations(feed);
    expect(media.size).toBe(4);
    expect(media.has("5")).toBe(false);
    expect(agentResultMedia(feed[5])).toBeNull();
  });
});

describe("rhythm illustrations", () => {
  it("uses the AF ECG only for atrial fibrillation", () => {
    expect(matchCardioIllustration({ text: "Желудочковые тахикардии и внезапная смерть" })?.asset.modality).toBe("anatomy");
    expect(matchCardioIllustration({ text: "Трепетание предсердий: аблация" })?.asset.modality).toBe("ecg");
  });
});

describe("feed variety", () => {
  it("does not repeat the same picture on neighbouring cards when an alternative fits", () => {
    const feed = [result("a", "Сердечная недостаточность: новые данные"), result("b", "ХСН с сохранённой фракцией выброса")];
    const media = feedIllustrations(feed);
    expect(media.get("a")?.art).not.toBe(media.get("b")?.art);
  });
});
