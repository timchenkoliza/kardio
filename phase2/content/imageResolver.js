// Images are enrichment, not canonical content facts.
// Semantic match + provenance > image coverage.

export function createImageResolver(enrichment) {
  const mappings = enrichment?.mappings || {};

  return function resolveImage(goldenId) {
    const image = mappings[goldenId] || null;
    if (!image) return null;
    if (image.render_policy === 'do_not_render') return null;

    return {
      ...image,
      canRender: image.render_policy === 'publishable' || image.render_policy === 'prototype_only_until_rights_verified',
      requiresReview: image.image_status !== 'verified',
    };
  };
}

export function shouldRenderImage(image) {
  if (!image) return false;
  if (image.render_policy === 'do_not_render') return false;
  return Boolean(image.asset_filename || image.image_url);
}

export function imageEditorialClass(image) {
  if (!image) return 'image-free';
  switch (image.image_semantic_role) {
    case 'clinical': return 'image-clinical';
    case 'expert': return 'image-portrait';
    case 'event': return 'image-event';
    case 'publication': return 'image-publication';
    case 'research': return 'image-research';
    case 'anatomy': return 'image-anatomy';
    default: return 'image-free';
  }
}

export function imageProvenance(image) {
  if (!image) return null;
  return {
    sourceName: image.image_source_name || null,
    sourceUrl: image.image_source_url || null,
    credit: image.image_credit || null,
    usageNote: image.image_usage_note || null,
    status: image.image_status || 'needs_review',
  };
}
