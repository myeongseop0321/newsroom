import { parse } from 'node-html-parser';
import { database } from '@/db';
import { indexArticlesInElastic, type ElasticEnv } from './elasticsearch';
import { publishers, type Article } from './publishers';

type HistoricalRow = Omit<Article, 'id' | 'section' | 'collectedAt'>;

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
};
const sourceAliases = new Map<string, string>(publishers.flatMap((publisher) => [
  [publisher.name.replace(/\s+/g, ''), publisher.id] as const,
  [publisher.short.replace(/\s+/g, ''), publisher.id] as const,
]));

const clean = (value: string) => parse(value).textContent
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const articleId = async (url: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))),
).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const queryKey = async (query: string, days: number) => articleId(`${query.toLowerCase().replace(/\s+/g, ' ').trim()}:${days}`);
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dayText = (date: Date) => `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;

function publisherFromName(source: string) {
  const normalized = source.replace(/\s+/g, '').replace(/뉴스$/g, '');
  return sourceAliases.get(normalized)
    || [...sourceAliases].find(([name]) => normalized.includes(name) || name.includes(normalized))?.[1]
    || null;
}

function publisherFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, '');
    return publishers.find((publisher) => {
      const home = new URL(publisher.home).hostname.replace(/^www\./, '');
      return hostname === home || hostname.endsWith(`.${home}`);
    })?.id || null;
  } catch {
    return null;
  }
}

function meta(root: ReturnType<typeof parse>, selectors: string[]) {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.getAttribute('content');
    if (value) return clean(value);
  }
  return '';
}

async function enrich(row: HistoricalRow, fallbackDate: string): Promise<HistoricalRow> {
  try {
    const response = await fetch(row.url, { signal: AbortSignal.timeout(8000), headers: browserHeaders });
    if (!response.ok) return { ...row, publishedAt: row.publishedAt || fallbackDate };
    const html = await response.text();
    if (html.length > 6_000_000) return { ...row, publishedAt: row.publishedAt || fallbackDate };
    const root = parse(html);
    const rawDate = meta(root, ['meta[property="article:published_time"]', 'meta[name="article:published_time"]', 'meta[name="date"]', 'meta[property="og:regDate"]'])
      || html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1]
      || '';
    const parsed = Date.parse(rawDate);
    const image = safeUrl(meta(root, ['meta[property="og:image"]', 'meta[name="twitter:image"]']));
    return { ...row, publishedAt: Number.isNaN(parsed) ? row.publishedAt || fallbackDate : new Date(parsed).toISOString(), image };
  } catch {
    return { ...row, publishedAt: row.publishedAt || fallbackDate };
  }
}

async function googleRows(query: string, days: number): Promise<HistoricalRow[]> {
  const endpoint = new URL('https://news.google.com/rss/search');
  endpoint.searchParams.set('q', `${query} when:${days}d`);
  endpoint.searchParams.set('hl', 'ko');
  endpoint.searchParams.set('gl', 'KR');
  endpoint.searchParams.set('ceid', 'KR:ko');
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000), headers: browserHeaders });
  if (!response.ok) return [];
  const from = Date.now() - days * 86400000;
  const root = parse(await response.text());
  const rows: HistoricalRow[] = [];
  for (const item of root.querySelectorAll('item')) {
    const source = clean(item.querySelector('source')?.textContent || '');
    const publisher = publisherFromName(source);
    const url = safeUrl(clean(item.querySelector('link')?.textContent || ''));
    const published = Date.parse(clean(item.querySelector('pubDate')?.textContent || ''));
    if (!publisher || !url || Number.isNaN(published) || published < from) continue;
    const title = clean(item.querySelector('title')?.textContent || '').replace(new RegExp(`\\s+-\\s+${escapeRegExp(source)}$`), '').trim();
    if (title.length >= 8 && title.length <= 220) rows.push({ publisher, title, url, publishedAt: new Date(published).toISOString(), image: null });
  }
  return rows;
}

async function naverRows(query: string, days: number): Promise<HistoricalRow[]> {
  const earliest = Date.now() - days * 86400000;
  const windows: { start: Date; end: Date }[] = [];
  for (let end = Date.now(); end > earliest; end -= 15 * 86400000) {
    windows.push({ start: new Date(Math.max(earliest, end - 15 * 86400000)), end: new Date(end) });
  }
  const pages = await Promise.all(windows.map(async (window) => {
    const endpoint = new URL('https://search.naver.com/search.naver');
    endpoint.searchParams.set('where', 'news');
    endpoint.searchParams.set('query', query);
    endpoint.searchParams.set('sort', '1');
    endpoint.searchParams.set('pd', '3');
    endpoint.searchParams.set('ds', dayText(window.start));
    endpoint.searchParams.set('de', dayText(window.end));
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000), headers: browserHeaders });
      return response.ok ? { html: await response.text(), fallbackDate: window.end.toISOString() } : null;
    } catch {
      return null;
    }
  }));
  const candidates: { row: HistoricalRow; fallbackDate: string }[] = [];
  for (const page of pages) {
    if (!page || page.html.length > 2_000_000) continue;
    const root = parse(page.html);
    for (const anchor of root.querySelectorAll('a[data-heatmap-target=".tit"]')) {
      const url = safeUrl(anchor.getAttribute('href') || '');
      const publisher = url ? publisherFromUrl(url) : null;
      const title = clean(anchor.textContent).replace(/새 창 열림/g, '').trim();
      if (publisher && url && title.length >= 8 && title.length <= 220) candidates.push({ row: { publisher, title, url, publishedAt: null, image: null }, fallbackDate: page.fallbackDate });
    }
  }
  const unique = [...new Map(candidates.map((item) => [`${item.row.publisher}:${item.row.title}`, item])).values()].slice(0, 36);
  return Promise.all(unique.map((item) => enrich(item.row, item.fallbackDate)));
}

export async function ensureHistoricalSearch(env: ElasticEnv, query: string, days: number) {
  const db = database();
  const key = await queryKey(query, days);
  const cached = await db.prepare('SELECT completed_at AS completedAt FROM search_backfills WHERE query_key=?')
    .bind(key).first<{ completedAt: string }>();
  if (cached && Date.now() - Date.parse(cached.completedAt) < 24 * 3600000) return 0;

  let rows = await googleRows(query, days).catch(() => []);
  if (!rows.length) rows = await naverRows(query, days).catch(() => []);
  const now = new Date().toISOString();
  const articles: Article[] = await Promise.all(rows.map(async (row) => ({
    ...row, id: await articleId(row.url), section: 'front' as const, collectedAt: now,
  })));
  const unique = [...new Map(articles.map((article) => [`${article.publisher}:${article.title}`, article])).values()].slice(0, 90);
  const statements = unique.map((article) => db.prepare(
    `INSERT INTO articles(id,publisher,title,url,section,published_at,collected_at,image)
     SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM articles WHERE publisher=? AND title=?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title,published_at=COALESCE(excluded.published_at,articles.published_at),image=COALESCE(excluded.image,articles.image)`,
  ).bind(article.id, article.publisher, article.title, article.url, article.section, article.publishedAt, article.collectedAt, article.image, article.publisher, article.title));
  statements.push(db.prepare(
    `INSERT INTO search_backfills(query_key,query,days,article_count,completed_at) VALUES(?,?,?,?,?)
     ON CONFLICT(query_key) DO UPDATE SET article_count=excluded.article_count,completed_at=excluded.completed_at`,
  ).bind(key, query, days, unique.length, now));
  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
  await indexArticlesInElastic(env, unique);
  return unique.length;
}
