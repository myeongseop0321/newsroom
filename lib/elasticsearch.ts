import type { Article } from './publishers';

export type ElasticEnv = {
  ELASTICSEARCH_URL?: string;
  ELASTICSEARCH_API_KEY?: string;
  ELASTICSEARCH_INDEX?: string;
};

const settings = (env: ElasticEnv) => {
  if (!env.ELASTICSEARCH_URL || !env.ELASTICSEARCH_API_KEY) return null;
  return {
    root: env.ELASTICSEARCH_URL.replace(/\/$/, ''),
    key: env.ELASTICSEARCH_API_KEY,
    index: env.ELASTICSEARCH_INDEX || 'pressroom-articles',
  };
};

export async function indexArticlesInElastic(env: ElasticEnv, articles: Article[]) {
  const config = settings(env);
  if (!config || !articles.length) return;
  const body = articles.flatMap((article) => [
    JSON.stringify({ index: { _index: config.index, _id: article.id } }),
    JSON.stringify({ ...article, effectiveAt: article.publishedAt || article.collectedAt }),
  ]).join('\n') + '\n';
  try {
    const response = await fetch(`${config.root}/_bulk`, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${config.key}`, 'Content-Type': 'application/x-ndjson' },
      body,
    });
    if (!response.ok) console.warn('Elasticsearch indexing failed', response.status);
  } catch (error) {
    console.warn('Elasticsearch indexing unavailable', error instanceof Error ? error.message : 'unknown');
  }
}

export async function searchArticlesInElastic(env: ElasticEnv, query: string, from: string, size = 300): Promise<Article[] | null> {
  const config = settings(env);
  if (!config) return null;
  try {
    const response = await fetch(`${config.root}/${encodeURIComponent(config.index)}/_search`, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size,
        _source: ['id', 'publisher', 'title', 'url', 'section', 'publishedAt', 'collectedAt', 'image'],
        query: {
          bool: {
            must: [{ match: { title: { query, operator: 'or', minimum_should_match: '50%' } } }],
            filter: [{ range: { effectiveAt: { gte: from } } }],
          },
        },
        sort: [{ _score: 'desc' }, { effectiveAt: 'desc' }, { _id: 'asc' }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { hits?: { hits?: Array<{ _source?: Article }> } };
    return (data.hits?.hits || []).flatMap((hit) => hit._source ? [hit._source] : []);
  } catch {
    return null;
  }
}
