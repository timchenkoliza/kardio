import type { AgentResultView } from "@/lib/agents/types";
import { approvedImagingMedia, type ApprovedMedicalMediaAsset } from "@/lib/ui/approved-medical-media";

export interface AgentResultMedia {
  src: string;
  alt: string;
  credit: string;
  sourceUrl: string;
  label: string;
}

function mediaByModality(result: AgentResultView, modality: ApprovedMedicalMediaAsset["modality"]): ApprovedMedicalMediaAsset | null {
  return approvedImagingMedia(result.specialty).find(asset => asset.modality === modality) ?? null;
}

function matchedMedia(result: AgentResultView): ApprovedMedicalMediaAsset | null {
  const text = [result.title, result.summary, result.category ?? "", ...result.reasonShown].join(" ").toLocaleLowerCase("ru-RU");
  if (/эхо|эхокар|ультразв|узи/iu.test(text)) return mediaByModality(result, "echo");
  if (/коронар|чкв|стент|ангиограф/iu.test(text)) return mediaByModality(result, "angiography");
  if (/\bкт\b|томограф|аорт|сосуд/iu.test(text)) return mediaByModality(result, "ct");
  if (/\bмрт\b|миокард|инфаркт|желудоч/iu.test(text)) return mediaByModality(result, "mri");
  if (result.kind === "guideline_change" || result.kind === "drug_change") return mediaByModality(result, "anatomy");
  if (result.kind === "research_finding" && result.category === "guideline") return mediaByModality(result, "anatomy");
  return null;
}

/**
 * UI-only visual supplement. The image is never evidence and is labelled as an illustration.
 * ResultList decides which cards get a visual so a text-heavy feed does not turn into a gallery.
 */
export function agentResultMedia(result: AgentResultView): AgentResultMedia | null {
  if (result.partner || result.kind === "event" || result.kind === "material_hit") return null;
  const asset = matchedMedia(result);
  if (!asset) return null;
  return {
    src: asset.src,
    alt: asset.alt,
    credit: asset.credit,
    sourceUrl: asset.sourceUrl,
    label: asset.compactLabel,
  };
}
