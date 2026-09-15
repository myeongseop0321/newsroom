'use client';

import { Bookmark } from 'lucide-react';
import { publishers, type Article, type Topic } from '@/lib/publishers';

type Props = {
  articles: Article[];
  topics: Topic[];
  savedIds: Set<string>;
  savingIds: string[];
  onScrap: (article: Article) => void;
};

const timestamp = (article: Article) => Date.parse(article.publishedAt || article.collectedAt);
const safeImage = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

function Story({ article, size, saved, saving, onScrap }: {
  article: Article;
  size: 'lead' | 'side' | 'more';
  saved: boolean;
  saving: boolean;
  onScrap: (article: Article) => void;
}) {
  const publisher = publishers.find((item) => item.id === article.publisher);
  const image = safeImage(article.image);
  return <article className={`front-story front-story-${size}`}>
    <a href={`/article/${article.id}`} className="front-story-link">
      <div className={`front-photo ${image ? 'has-image' : ''}`}>
        <span>{publisher?.short || 'NEWS'}</span>
        {/* External publisher images need referrerPolicy, which the framework image wrapper does not preserve here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          loading={size === 'lead' ? 'eager' : 'lazy'}
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />}
      </div>
      <div className="front-source"><i style={{ background: publisher?.color }}/>{publisher?.name || article.publisher}</div>
      <h3>{article.title}</h3>
    </a>
    <div className="front-story-meta">
      <time>{new Date(article.publishedAt || article.collectedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}</time>
      <button className={saved ? 'saved' : ''} onClick={() => onScrap(article)} disabled={saving} aria-label={saved ? '스크랩 해제' : '기사 스크랩'}>
        <Bookmark size={17} fill={saved ? 'currentColor' : 'none'}/>
      </button>
    </div>
  </article>;
}

export default function FrontPage({ articles, topics, savedIds, savingIds, onScrap }: Props) {
  const byId = new Map(articles.map((article) => [article.id, article]));
  const representatives = topics.flatMap((topic) => {
    const matches = topic.articleIds.map((id) => byId.get(id)).filter((article): article is Article => Boolean(article));
    matches.sort((left, right) => Number(Boolean(right.image)) - Number(Boolean(left.image)) || timestamp(right) - timestamp(left));
    return matches.slice(0, 1);
  });
  const prioritized = [...new Map([...representatives, ...[...articles].sort((left, right) => timestamp(right) - timestamp(left))].map((article) => [article.id, article])).values()];
  const ordered = [...prioritized.filter((article) => article.image), ...prioritized.filter((article) => !article.image)];
  const lead = representatives.find((article) => article.image) || ordered[0];
  const surrounding = ordered.filter((article) => article.id !== lead?.id).slice(0, 4);
  const more = ordered.filter((article) => article.id !== lead?.id && !surrounding.some((item) => item.id === article.id)).slice(0, 12);
  const story = (article: Article, size: 'lead' | 'side' | 'more') => <Story key={article.id} article={article} size={size} saved={savedIds.has(article.id)} saving={savingIds.includes(article.id)} onScrap={onScrap}/>;

  if (!lead) return <div className="front-empty">표시할 오늘의 기사가 없습니다.</div>;
  return <div className="front-editorial">
    <div className="front-lead-grid">
      <div className="front-side-stack">{surrounding.slice(0, 2).map((article) => story(article, 'side'))}</div>
      {story(lead, 'lead')}
      <div className="front-side-stack">{surrounding.slice(2, 4).map((article) => story(article, 'side'))}</div>
    </div>
    {more.length > 0 && <section className="front-more">
      <header><span>LATEST</span><h3>더 읽어볼 뉴스</h3></header>
      <div>{more.map((article) => story(article, 'more'))}</div>
    </section>}
  </div>;
}
