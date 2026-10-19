import { groupBy, sortByPriorityThenFreshness } from './contentSelectors.js';

function baseUtility(item) {
  let score = 0;
  if (item.prototype_priority === 'P0') score += 30;
  if (item.prototype_priority === 'P1') score += 20;
  if (item.prototype_priority === 'P2') score += 10;
  if (item.freshness_status === 'current') score += 20;
  if (item.freshness_status === 'current_in_export') score += 15;
  if (item.trust_layer === 'official') score += 12;
  if (item.trust_layer === 'professional') score += 8;
  if (item.trust_layer === 'expert') score += 6;
  if (item.freshness_status === 'superseded') score -= 25;
  if (item.freshness_status === 'archive') score -= 20;
  return score;
}

export function rankForSearchFirst(items, query = '') {
  const q = String(query || '').toLocaleLowerCase('ru-RU');
  return [...items].sort((a, b) => {
    const qa = q && a.searchableText.includes(q) ? 50 : 0;
    const qb = q && b.searchableText.includes(q) ? 50 : 0;
    return (baseUtility(b) + qb) - (baseUtility(a) + qa);
  });
}

export function groupForToolbelt(items) {
  const sorted = sortByPriorityThenFreshness(items);
  return {
    recommendations: sorted.filter((item) => item.prototype_surface === 'Рекомендации'),
    learning: sorted.filter((item) => item.prototype_surface === 'Обучение'),
    news: sorted.filter((item) => item.prototype_surface === 'Новости'),
    community: sorted.filter((item) => item.prototype_surface === 'Сообщество'),
    profile: sorted.filter((item) => item.prototype_surface === 'Профиль'),
  };
}

export function groupForKnowledgeWorkspace(items) {
  const byTopic = groupBy(sortByPriorityThenFreshness(items), 'canonical_topic_id');
  return Object.entries(byTopic)
    .map(([topicId, topicItems]) => ({
      topicId,
      items: topicItems,
      currentGuideline: topicItems.find(
        (item) => item.content_type === 'Клинические рекомендации' && item.is_current === 'yes'
      ) || null,
      sourceCount: new Set(topicItems.map((item) => item.source_id)).size,
    }))
    .sort((a, b) => {
      const ap = a.items.some((item) => item.prototype_priority === 'P0') ? 1 : 0;
      const bp = b.items.some((item) => item.prototype_priority === 'P0') ? 1 : 0;
      return bp - ap || b.items.length - a.items.length;
    });
}

// Important: A/B/C may rank and group differently, but they never mutate or fork canonical facts.
