/**
 * Whether a publication title is about a topic or a question, by the words of
 * their PubMed terms. Used wherever a title is shown «по вашей теме»: the feed's
 * guidelines, the learning route, the order of a research review.
 */

/** Phrases a topic's PubMed term looks for («hypertension», «chronic kidney disease», «diabet» as a prefix). */
function termPhrases(term: string): Array<{ phrase: string; prefix: boolean }> {
  return [...term.matchAll(/"([^"]+)"\[[a-z]+\]|([A-Za-z0-9-]+)(\*?)\[[a-z]+\]/giu)].map(match => ({ phrase: (match[1] ?? match[2]).toLowerCase(), prefix: Boolean(match[3]) }));
}

function phraseIn(value: string, { phrase, prefix }: { phrase: string; prefix: boolean }): boolean {
  return new RegExp(`(?<![a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${prefix ? "" : "(?![a-z])"}`, "u").test(value);
}

/**
 * Articles ordered by how many of the question's concepts their title names; a stable sort keeps the given
 * order otherwise. A concept counts only in a title that also names the question's topic, so a stray «aged
 * ≥50» in a heart-failure survey does not lift it above a trial on the topic.
 */
export function byQuestionInTitle<T extends { title: string }>(articles: readonly T[], terms: readonly string[], topicTerms: readonly string[] = []): T[] {
  const groups = terms.map(termPhrases).filter(group => group.length);
  if (!groups.length) return [...articles];
  const topics = topicTerms.map(termPhrases).filter(group => group.length);
  const names = (title: string, group: readonly { phrase: string; prefix: boolean }[]) => group.some(item => phraseIn(title.toLowerCase(), item));
  const score = (title: string) => {
    const onTopic = !topics.length || topics.some(group => names(title, group));
    return onTopic ? (topics.length ? 1 : 0) + groups.filter(group => names(title, group)).length : 0;
  };
  return articles.map((article, index) => ({ article, index, score: score(article.title) })).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.article);
}

/**
 * Does a title name the topic? Not when the words belong to a more specific
 * topic (`specificTopicTerms`): «pulmonary hypertension» is not «hypertension».
 */
export function titleNamesTopic(title: string, term: string, others: readonly string[] = []): boolean {
  const value = title.toLowerCase();
  const own = termPhrases(term).filter(item => phraseIn(value, item));
  if (!own.length) return false;
  const specific = others.flatMap(termPhrases).filter(item => phraseIn(value, item));
  return own.some(item => !specific.some(other => other.phrase !== item.phrase && other.phrase.includes(item.phrase)));
}

