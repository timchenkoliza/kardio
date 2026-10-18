import { eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import {
  distributionPostCandidateLinks,
  distributionPostCandidateMedia,
  distributionPostCandidates,
} from "@/db/ontology-schema";
import {
  deriveDistributionSignals,
  type ExplicitDistributionFormat,
} from "@/server/ingestion/distribution-signals";

const sourceRegistryId = process.env.TELEGRAM_SOURCE_ID ?? "cardiology_channel_01";
const sampleLimit = Math.max(0, Math.min(10, Number(process.env.DISTRIBUTION_SIGNAL_SAMPLE_LIMIT ?? 3) || 3));

function increment(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function topEntries(map: Map<string, number>, limit = 25): Array<{ value: string; count: number }> {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

try {
  const candidates = await db.select({
    id: distributionPostCandidates.id,
    bodyText: distributionPostCandidates.bodyText,
    hashtags: distributionPostCandidates.hashtags,
    authorDisplayName: distributionPostCandidates.authorDisplayName,
    sourcePresence: distributionPostCandidates.sourcePresence,
  }).from(distributionPostCandidates)
    .where(eq(distributionPostCandidates.sourceRegistryId, sourceRegistryId));

  const links = await db.select({
    candidateId: distributionPostCandidateLinks.candidateId,
    href: distributionPostCandidateLinks.href,
    kind: distributionPostCandidateLinks.kind,
  }).from(distributionPostCandidateLinks)
    .where(eq(distributionPostCandidateLinks.sourceRegistryId, sourceRegistryId));

  const media = await db.select({
    candidateId: distributionPostCandidateMedia.candidateId,
    kind: distributionPostCandidateMedia.kind,
  }).from(distributionPostCandidateMedia)
    .where(eq(distributionPostCandidateMedia.sourceRegistryId, sourceRegistryId));

  const externalLinksByCandidate = new Map<string, string[]>();
  for (const link of links) {
    if (link.kind !== "external") continue;
    const values = externalLinksByCandidate.get(link.candidateId) ?? [];
    values.push(link.href);
    externalLinksByCandidate.set(link.candidateId, values);
  }

  const formatCounts = new Map<string, number>();
  const hashtagCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  const mediaKindCounts = new Map<string, number>();
  const formatSamples = new Map<ExplicitDistributionFormat, Array<{ id: string; excerpt: string }>>();
  let explicitFormatTaggedPosts = 0;
  let multiFormatPosts = 0;
  let scardioEventPagePosts = 0;
  let scardioEventPageRefs = 0;

  for (const item of media) increment(mediaKindCounts, item.kind);

  for (const candidate of candidates) {
    for (const tag of candidate.hashtags) increment(hashtagCounts, tag);
    if (candidate.authorDisplayName) increment(authorCounts, candidate.authorDisplayName);

    const signals = deriveDistributionSignals({
      hashtags: candidate.hashtags,
      bodyText: candidate.bodyText,
      externalLinks: externalLinksByCandidate.get(candidate.id) ?? [],
    });

    if (signals.explicitFormats.length > 0) explicitFormatTaggedPosts += 1;
    if (signals.explicitFormats.length > 1) multiFormatPosts += 1;
    if (signals.scardioEventPageLinks.length > 0) scardioEventPagePosts += 1;
    scardioEventPageRefs += signals.scardioEventPageLinks.length;

    for (const format of signals.explicitFormats) {
      increment(formatCounts, format);
      const samples = formatSamples.get(format) ?? [];
      if (samples.length < sampleLimit) {
        samples.push({ id: candidate.id, excerpt: candidate.bodyText.slice(0, 220) });
        formatSamples.set(format, samples);
      }
    }
    for (const domain of signals.externalDomains) increment(domainCounts, domain);
  }

  const presentCandidates = candidates.filter((candidate) => candidate.sourcePresence === "present").length;
  const externalLinkCount = links.filter((link) => link.kind === "external").length;

  console.log(JSON.stringify({
    mode: "read_only_source_grounded_analysis",
    sourceRegistryId,
    candidates: candidates.length,
    presentCandidates,
    explicitFormatTaggedPosts,
    unclassifiedByExplicitFormat: candidates.length - explicitFormatTaggedPosts,
    multiFormatPosts,
    formatCounts: Object.fromEntries([...formatCounts.entries()].sort()),
    scardioEventPagePosts,
    scardioEventPageRefs,
    externalLinkCount,
    topExternalDomains: topEntries(domainCounts),
    topHashtags: topEntries(hashtagCounts),
    topAuthors: topEntries(authorCounts, 10),
    mediaKinds: Object.fromEntries([...mediaKindCounts.entries()].sort()),
    formatSamples: Object.fromEntries([...formatSamples.entries()]),
    ontologyWrites: 0,
    stagingWrites: 0,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Distribution signal inspection failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
