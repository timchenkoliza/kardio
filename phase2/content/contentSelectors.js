// Shared content layer for all KARDIO shells.
// Canonical facts come from data/cardio-goldenset.json.

const PRIORITY_WEIGHT = { P0: 3, P1: 2, P2: 1 };

export function normalizeGoldenSet(db) {
  const content = Array.isArray(db?.content) ? db.content : [];
  const sources = Array.isArray(db?.sources) ? db.sources : [];
  const sourceById = new Map(sources.map((source) => [source.source_id, source]));
  const contentById = new Map(content.map((item) => [item.golden_id, item]));

  const normalized = content.map((item) => ({
    ...item,
    source: sourceById.get(item.source_id) || null,
    searchableText: [
      item.title,
      item.card_summary,
      item.topic,
      item.organization,
      item.author_expert,
      item.category,
      item.subcategory,
      item.tags,
      sourceById.get(item.source_id)?.name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ru-RU'),
  }));

  return { normalized, sources, sourceById, contentById };
}

export function getEvaluationSet(model, evaluationManifest) {
  const ids = evaluationManifest?.golden_ids || [];
  const byId = new Map(model.normalized.map((item) => [item.golden_id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function searchContent(items, query, filters = {}) {
  const q = String(query || '').trim().toLocaleLowerCase('ru-RU');
  return items.filter((item) => {
    if (q && !item.searchableText.includes(q)) return false;
    if (filters.topic && item.topic !== filters.topic) return false;
    if (filters.content_type && item.content_type !== filters.content_type) return false;
    if (filters.source_id && item.source_id !== filters.source_id) return false;
    if (filters.year && String(item.publication_year || '') !== String(filters.year)) return false;
    if (filters.trust_layer && item.trust_layer !== filters.trust_layer) return false;
    if (filters.freshness_status && item.freshness_status !== filters.freshness_status) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.subcategory && item.subcategory !== filters.subcategory) return false;
    return true;
  });
}

export function priorityScore(item) {
  return PRIORITY_WEIGHT[item.prototype_priority] || 0;
}

export function currentnessState(item, model) {
  const supersededBy = item.superseded_by_id
    ? model.contentById.get(item.superseded_by_id) || null
    : null;

  if (item.freshness_status === 'superseded' || item.is_current === 'no') {
    return {
      state: 'superseded',
      label: 'Есть более новая версия',
      replacement: supersededBy,
    };
  }

  if (item.is_current === 'review' || String(item.freshness_status || '').startsWith('needs_')) {
    return { state: 'needs_review', label: 'Требует проверки', replacement: null };
  }

  if (item.freshness_status === 'archive' || item.freshness_status === 'legacy') {
    return { state: 'legacy', label: 'Архивный материал', replacement: null };
  }

  return { state: 'current', label: null, replacement: null };
}

export function sourceAction(item) {
  if (!item?.source_url) return null;
  return { label: 'Открыть источник', href: item.source_url };
}

export function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    (acc[value] ||= []).push(item);
    return acc;
  }, {});
}

export function sortByPriorityThenFreshness(items) {
  const freshnessWeight = {
    current: 5,
    current_in_export: 4,
    needs_date_check: 3,
    needs_version_check: 3,
    needs_currentness_check: 3,
    legacy: 2,
    archive: 1,
    superseded: 0,
  };

  return [...items].sort((a, b) => {
    const p = priorityScore(b) - priorityScore(a);
    if (p) return p;
    const f = (freshnessWeight[b.freshness_status] || 0) - (freshnessWeight[a.freshness_status] || 0);
    if (f) return f;
    return String(b.publication_date || b.publication_year || '').localeCompare(
      String(a.publication_date || a.publication_year || '')
    );
  });
}
