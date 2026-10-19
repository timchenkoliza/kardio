import { pool } from "@/db/client";
import { listContent } from "@/server/repositories/catalog";
import { approvedEditorialMediaForContent } from "@/lib/ui/approved-medical-media";
import { buildArticleMotionPrompt, readyArticleMotionForContent, shouldQueueArticleMotion } from "@/lib/ui/article-motion-media";
import type { SpecialtyId } from "@/lib/domain/types";

const specialties: readonly SpecialtyId[] = ["cardiology", "oncology"];

try {
  const candidates = [] as Array<{
    contentId: string;
    specialty: SpecialtyId;
    title: string;
    fallbackAssetId: string;
    prompt: string;
  }>;

  for (const specialty of specialties) {
    const content = await listContent(specialty);
    for (const item of content) {
      const genericFallback = approvedEditorialMediaForContent(item);
      const readyMotion = readyArticleMotionForContent(item);
      if (!readyMotion && shouldQueueArticleMotion(item, Boolean(genericFallback)) && genericFallback) {
        candidates.push({
          contentId: item.id,
          specialty,
          title: item.title,
          fallbackAssetId: genericFallback.id,
          prompt: buildArticleMotionPrompt(item),
        });
      }
    }
  }

  const repeatedFallbacks = Object.entries(
    candidates.reduce<Record<string, number>>((counts, item) => {
      counts[item.fallbackAssetId] = (counts[item.fallbackAssetId] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  console.log(JSON.stringify({
    mode: "read_only_article_motion_candidate_inspection",
    candidates: candidates.length,
    repeatedFallbacks,
    sample: candidates.slice(0, 20),
    note: "A candidate is eligible for generation only after an original article image is resolved and its usage is allowed for derivative rendering.",
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Article motion candidate inspection failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
