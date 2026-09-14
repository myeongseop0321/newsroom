import { database } from "@/db";
import { parse } from "node-html-parser";
import { publishers, type Article } from "./publishers";

export type ReaderContent = {
  paragraphs: string[];
  author: string | null;
  publishedAt: string | null;
  image: string | null;
  available: boolean;
};

type CachedContent = {
  body: string;
  author: string | null;
  publishedAt: string | null;
  image: string | null;
  status: string;
  fetchedAt: string;
};

const SUCCESS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 60 * 1000;

export async function getArticle(id: string): Promise<Article | null> {
  return database()
    .prepare(
      "SELECT id,publisher,title,url,section,published_at AS publishedAt,collected_at AS collectedAt,image FROM articles WHERE id=?",
    )
    .bind(id)
    .first<Article>();
}

export async function loadArticleContent(article: Article): Promise<ReaderContent> {
  const cached = await database()
    .prepare(
      "SELECT body,author,published_at AS publishedAt,image,status,fetched_at AS fetchedAt FROM article_contents WHERE article_id=?",
    )
    .bind(article.id)
    .first<CachedContent>();

  if (cached) {
    const cacheAge = Date.now() - Date.parse(cached.fetchedAt);
    const cacheLimit = cached.status === "ok" ? SUCCESS_CACHE_MS : FAILURE_CACHE_MS;
    if (cacheAge < cacheLimit) return fromCache(cached);
  }

  let content: ReaderContent;
  let status = "ok";
  try {
    content = await fetchArticleContent(article);
    if (!content.paragraphs.length) status = "unavailable";
  } catch {
    status = "unavailable";
    content = { paragraphs: [], author: null, publishedAt: article.publishedAt, image: article.image, available: false };
  }

  await database()
    .prepare(
      `INSERT INTO article_contents(article_id,body,author,published_at,image,status,fetched_at)
       VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(article_id) DO UPDATE SET body=excluded.body,author=excluded.author,published_at=excluded.published_at,image=excluded.image,status=excluded.status,fetched_at=excluded.fetched_at`,
    )
    .bind(
      article.id,
      JSON.stringify(content.paragraphs),
      content.author,
      content.publishedAt,
      content.image,
      status,
      new Date().toISOString(),
    )
    .run();

  return { ...content, available: status === "ok" };
}

async function fetchArticleContent(article: Article): Promise<ReaderContent> {
  const publisher = publishers.find((item) => item.id === article.publisher);
  if (!publisher) throw new Error("Unknown publisher");
  assertPublisherUrl(article.url, publisher.home);

  const response = await fetch(article.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "User-Agent": "Pressroom/1.0 (article reader; source attribution included)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  assertPublisherUrl(response.url, publisher.home);
  const html = await response.text();
  if (html.length > 8_000_000) throw new Error("Response too large");

  const root = parse(html);
  root
    .querySelectorAll("script,style,noscript,nav,header,footer,aside,form,button,iframe,svg,.advertisement,.ad,.related")
    .forEach((element) => element.remove());

  const candidates = [
    "[itemprop=articleBody]",
    "article",
    "#articleBody",
    "#article-body",
    "#news_body_area",
    ".article-body",
    ".article_body",
    ".article-content",
    ".article_txt",
    ".art_txt",
    ".news_view",
    ".news-body",
    ".story-body",
    ".view_con",
  ]
    .flatMap((selector) => root.querySelectorAll(selector))
    .filter((element, index, all) => all.indexOf(element) === index);

  const body = candidates.sort((left, right) => score(right) - score(left))[0];
  if (!body || score(body) < 120) throw new Error("Article body not found");

  let paragraphs = body.querySelectorAll("p").map((element) => clean(element.textContent));
  if (paragraphs.filter((text) => text.length >= 15).length < 2) {
    paragraphs = body.innerText.split(/\n+/).map(clean);
  }
  paragraphs = uniqueParagraphs(paragraphs).slice(0, 160);

  const author = meta(root, ["meta[name=author]", "meta[property=article:author]", "meta[name=byl]"]);
  const publishedAt = meta(root, [
    "meta[property=article:published_time]",
    "meta[name=article:published_time]",
    "meta[name=pubdate]",
    "meta[name=date]",
  ]);
  const rawImage = meta(root, ["meta[property=og:image]", "meta[name=twitter:image]"]);
  const image = safeImage(rawImage, response.url);

  return {
    paragraphs,
    author: author ? clean(author).slice(0, 100) : null,
    publishedAt: publishedAt || article.publishedAt,
    image,
    available: paragraphs.length > 0,
  };
}

function score(element: ReturnType<typeof parse>): number {
  const textLength = clean(element.textContent).length;
  const paragraphCount = element.querySelectorAll("p").length;
  return textLength + paragraphCount * 80;
}

function uniqueParagraphs(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length < 15 || value.length > 5000) continue;
    if (/^(광고|관련기사|추천기사|무단 전재|Copyright|기자\s*=|▶|©)/i.test(value)) continue;
    const key = value.replace(/\s/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function fromCache(cached: CachedContent): ReaderContent {
  let paragraphs: string[] = [];
  try {
    const parsed = JSON.parse(cached.body) as unknown;
    if (Array.isArray(parsed)) paragraphs = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    paragraphs = [];
  }
  return {
    paragraphs,
    author: cached.author,
    publishedAt: cached.publishedAt,
    image: cached.image,
    available: cached.status === "ok" && paragraphs.length > 0,
  };
}

function assertPublisherUrl(value: string, home: string) {
  const url = new URL(value);
  const allowed = new URL(home).hostname.replace(/^www\./, "");
  const hostname = url.hostname.replace(/^www\./, "");
  if ((url.protocol !== "https:" && url.protocol !== "http:") || (hostname !== allowed && !hostname.endsWith(`.${allowed}`))) {
    throw new Error("Foreign article URL");
  }
}

function meta(root: ReturnType<typeof parse>, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.getAttribute("content");
    if (value?.trim()) return value.trim();
  }
  return null;
}

function safeImage(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function clean(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
