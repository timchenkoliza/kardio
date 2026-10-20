import { describe, expect, it } from "vitest";
import {
  createContentStudioPackage,
  partnerWorkspaceForSubject,
  requestContentStudioReview,
  updatePublicationDraft,
} from "@/lib/pharma/content-studio";

const NOW = "2026-10-20T12:00:00.000Z";

describe("Content Studio package lifecycle", () => {
  it("creates a persisted-shaped package with five draft formats and no invented evidence", () => {
    const pkg = createContentStudioPackage({
      specialty: "cardiology",
      ownerSubjectId: "pharma_demo",
      briefText: "Подготовь материал о ХСН: статья + чек-лист. Источник https://example.org/source",
      now: NOW,
    });

    expect(pkg.workspaceId).toBe("partner_demo");
    expect(pkg.status).toBe("draft");
    expect(pkg.run.status).toBe("completed");
    expect(pkg.run.mode).toBe("template_scaffold");
    expect(pkg.brief.sourceUrls).toEqual(["https://example.org/source"]);
    expect(pkg.drafts.map(draft => draft.kind)).toEqual(["article", "useful", "media", "event", "performance"]);
    expect(pkg.drafts.every(draft => draft.status === "draft" && draft.evidenceStatus === "not_checked")).toBe(true);
    expect(pkg.drafts.every(draft => draft.content.includes(pkg.brief.rawText))).toBe(true);
  });

  it("lets partner roles share one demo partner workspace while physician stays outside it", () => {
    expect(partnerWorkspaceForSubject("pharma_demo")).toBe("partner_demo");
    expect(partnerWorkspaceForSubject("editorial_demo")).toBe("partner_demo");
    expect(partnerWorkspaceForSubject("admin_demo")).toBe("partner_demo");
    expect(partnerWorkspaceForSubject("physician_demo")).toBeNull();
  });

  it("updates a draft while the package is editable", () => {
    const pkg = createContentStudioPackage({ specialty: "cardiology", ownerSubjectId: "pharma_demo", briefText: "Сделай материал для врачей", now: NOW });
    const draft = pkg.drafts[0];
    const updated = updatePublicationDraft(pkg, draft.id, { title: "Новый заголовок", content: "Новый редакторский текст" }, "2026-10-20T12:05:00.000Z");
    const nextDraft = updated.drafts.find(item => item.id === draft.id);

    expect(nextDraft?.title).toBe("Новый заголовок");
    expect(nextDraft?.content).toBe("Новый редакторский текст");
    expect(updated.status).toBe("draft");
  });

  it("locks all drafts after request for review", () => {
    const pkg = createContentStudioPackage({ specialty: "cardiology", ownerSubjectId: "pharma_demo", briefText: "Сделай пакет для кардиологов", now: NOW });
    const review = requestContentStudioReview(pkg, "2026-10-20T12:10:00.000Z");

    expect(review.status).toBe("in_review");
    expect(review.reviewRequestedAt).toBe("2026-10-20T12:10:00.000Z");
    expect(review.drafts.every(draft => draft.status === "in_review")).toBe(true);
    expect(() => updatePublicationDraft(review, review.drafts[0].id, { content: "Нельзя" })).toThrow("package_not_editable");
  });
});
