import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { database } from '@/db';
import { searchArticlesInElastic } from './elasticsearch';
import { HttpError } from './desk-service';
import { publishers, type Article } from './publishers';

const inputSchema = z.object({
  query: z.string().trim().min(2).max(80),
  days: z.number().int().refine((days) => [30, 60, 90, 120].includes(days)),
});
const columns = 'a.id,a.publisher,a.title,a.url,a.section,a.published_at AS publishedAt,a.collected_at AS collectedAt,a.image';
const searchTokens = (value: string) => [...new Set(value.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [])].slice(0, 8);
const relatedTerms:Record<string,string[]>={
  전쟁:['전쟁','전투','공격','공습','휴전','파병','격추','미사일','드론','기뢰','충돌','군사'],
  선거:['선거','투표','후보','공천','개표','당선'],
  부동산:['부동산','아파트','주택','집값','전세','분양'],
  관세:['관세','무역','수출','수입','통상'],
};
const alternatives=(term:string)=>relatedTerms[term]||[term];
const ftsTerm=(term:string)=>`"${term.replace(/"/g,'""')}"*`;
const publisherName = (id: string) => publishers.find((publisher) => publisher.id === id)?.name || id;

async function searchD1(query: string, from: string): Promise<Article[]> {
  const terms = searchTokens(query);
  if (!terms.length) return [];
  const first=alternatives(terms[0]).map(ftsTerm).join(' OR ');
  const rest=terms.slice(1).flatMap(alternatives);
  const match=rest.length?`(${first}) AND (${rest.map(ftsTerm).join(' OR ')})`:first;
  try {
    return (await database().prepare(`SELECT ${columns}
      FROM articles_fts
      JOIN articles a ON a.rowid=articles_fts.rowid
      WHERE articles_fts MATCH ? AND COALESCE(a.published_at,a.collected_at)>=?
      ORDER BY bm25(articles_fts,5.0),COALESCE(a.published_at,a.collected_at) DESC
      LIMIT 500`).bind(match, from).all<Article>()).results;
  } catch {
    const firstTerms=alternatives(terms[0]),restTerms=terms.slice(1).flatMap(alternatives);
    const firstFilters=firstTerms.map(()=>'LOWER(a.title) LIKE ?').join(' OR ');
    const restFilters=restTerms.map(()=>'LOWER(a.title) LIKE ?').join(' OR ');
    return (await database().prepare(`SELECT ${columns} FROM articles a
      WHERE COALESCE(a.published_at,a.collected_at)>=? AND (${firstFilters}) ${restFilters?`AND (${restFilters})`:''}
      ORDER BY COALESCE(a.published_at,a.collected_at) DESC LIMIT 500`)
      .bind(from,...firstTerms.map(term=>`%${term}%`),...restTerms.map(term=>`%${term}%`)).all<Article>()).results;
  }
}

const relevance = (article: Article, query: string, terms: string[]) => {
  const title = article.title.toLowerCase();
  const primaryMatched=alternatives(terms[0]||'').some(term=>title.includes(term));
  const secondary=terms.slice(1).flatMap(alternatives);
  const secondaryMatched=secondary.filter(term=>title.includes(term)).length;
  if(!primaryMatched||secondary.length&&!secondaryMatched)return 0;
  let score=5+secondaryMatched*2;
  if(terms.every(term=>title.includes(term)))score+=5;
  if (title.includes(query.toLowerCase())) score += 8;
  return score;
};

export async function searchFollowup(raw: unknown) {
  const { query, days } = inputSchema.parse(raw);
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000).toISOString();
  const terms = searchTokens(query);
  const elasticRows = await searchArticlesInElastic(env, query, from);
  const databaseRows = elasticRows?.length ? elasticRows : await searchD1(query, from);
  const source = elasticRows?.length ? 'elasticsearch' : 'database';
  const seen = new Set<string>();
  const ranked = databaseRows.map((article) => ({ article, score: relevance(article, query, terms) }))
    .filter(({ article, score }) => score >= 5 && !Number.isNaN(Date.parse(article.publishedAt || article.collectedAt)))
    .sort((a, b) => b.score - a.score || Date.parse(b.article.publishedAt || b.article.collectedAt) - Date.parse(a.article.publishedAt || a.article.collectedAt) || a.article.id.localeCompare(b.article.id))
    .flatMap(({ article }) => {
      const key = article.url.replace(/[?#].*$/, '').replace(/\/$/, '');
      if (seen.has(key)) return [];
      seen.add(key);
      return [article];
    })
    .slice(0, 120)
    .sort((a, b) => Date.parse(a.publishedAt || a.collectedAt) - Date.parse(b.publishedAt || b.collectedAt));
  if (!ranked.length) throw new HttpError(404, '저장된 기사에서 관련 뉴스를 찾지 못했습니다. 다른 검색어 또는 더 긴 기간을 선택해 주세요.');
  return {
    query,
    days,
    headline: `‘${query}’ 보도 타임라인`,
    overview: `저장된 기사에서 검색어와 관련성이 높은 보도 ${ranked.length}건을 찾았습니다. 새 기사가 데이터베이스에 쌓이면 같은 검색어의 타임라인에도 일관된 기준으로 반영됩니다.`,
    from,
    to: now.toISOString(),
    searchMode: source,
    events: ranked.map((article) => ({
      id: article.id,
      date: article.publishedAt || article.collectedAt,
      publisher: article.publisher,
      publisherName: publisherName(article.publisher),
      title: article.title,
      summary: '',
      url: article.url,
    })),
    publisherCount: new Set(ranked.map((article) => article.publisher)).size,
  };
}
