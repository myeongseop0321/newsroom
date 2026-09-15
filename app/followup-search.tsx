'use client';
import { FormEvent, useMemo, useState } from 'react';
import { ArrowRight, Clock3, Database, LoaderCircle, Search } from 'lucide-react';
import { publishers } from '@/lib/publishers';

type TimelineEvent = {
  id: string;
  date: string;
  publisher: string;
  publisherName: string;
  title: string;
  summary: string;
  url: string;
};
type Result = {
  query: string;
  days: number;
  headline: string;
  overview: string;
  from: string;
  to: string;
  publisherCount: number;
  searchMode: 'database' | 'elasticsearch';
  events: TimelineEvent[];
};

const shortLabel = (title: string) => {
  const text = title.replace(/^\s*\[[^\]]+]\s*/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 20 ? `${text.slice(0, 19)}…` : text;
};

export default function FollowupSearch({ days }: { days: number }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: value, days }),
      });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw Error(data.error || '검색을 완료하지 못했습니다.');
      setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '검색을 완료하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const timelineWidth = Math.max(900, (result?.events.length || 0) * 170 + 100);
  const timelinePoints = useMemo(() => {
    if (!result) return [];
    return result.events.map((item, index) => ({
      item,
      left: 55 + index * 170,
      press: publishers.find((publisher) => publisher.id === item.publisher),
    }));
  }, [result]);

  return <section className="search-followup">
    <form className="followup-searchbox" onSubmit={submit}>
      <Search size={21}/>
      <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder="저장된 뉴스에서 이슈를 검색해 보세요" aria-label="이슈 검색어"/>
      <button disabled={loading || query.trim().length < 2}>{loading ? <LoaderCircle className="spin" size={17}/> : <Search size={17}/>} 검색</button>
    </form>
    {!result && !loading && !error && <div className="followup-intro">
      <Database/>
      <h3>데이터베이스에 쌓인 뉴스 흐름을 찾아드립니다.</h3>
      <p>예: 의대 정원, 반도체 관세, 부동산 공급 대책</p>
      <span>같은 검색어는 같은 저장 데이터와 정렬 기준으로 검색됩니다.</span>
    </div>}
    {loading && <div className="followup-progress"><LoaderCircle className="spin"/><strong>저장된 기사를 검색하고 있습니다.</strong><p>웹에서 새로 수집하지 않고 뉴스 데이터베이스만 확인합니다.</p></div>}
    {error && <div className="followup-error" role="alert"><strong>타임라인을 만들지 못했습니다.</strong><p>{error}</p><button onClick={() => setError('')}>다시 검색하기</button></div>}
    {result && <div className="searched-timeline">
      <header>
        <span>{result.searchMode === 'elasticsearch' ? 'ELASTICSEARCH' : 'DATABASE SEARCH'} · {result.days} DAYS</span>
        <h3>{result.headline}</h3>
        <p>{result.overview}</p>
        <div><b>{result.events.length}건</b><b>{result.publisherCount}개 언론사</b><time>{new Date(result.events[0].date).toLocaleDateString('ko-KR')} — {new Date(result.events.at(-1)!.date).toLocaleDateString('ko-KR')}</time></div>
      </header>
      <p className="timeline-scroll-note"><Clock3 size={14}/> 말풍선을 누르면 홈페이지 안에서 기사를 읽을 수 있습니다. 기사량이 많으면 좌우로 움직여 보세요.</p>
      <div className="searched-axis">
        <div className="searched-bar" style={{ width: `${timelineWidth}px` }}>
          {timelinePoints.map(({ item, left, press }) => <a className="searched-point" key={item.id} href={`/article/${item.id}`} style={{ left: `${left}px`, top: '48px', background: press?.color }} aria-label={`${item.publisherName} ${item.title}`}>
            <span className="searched-point-label">
              <small>{new Date(item.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} · {item.publisherName}</small>
              <strong>{shortLabel(item.title)}</strong>
            </span>
          </a>)}
        </div>
      </div>
      <div className="searched-events">{[...result.events].reverse().map((item) => <a href={`/article/${item.id}`} key={item.id}>
        <time>{new Date(item.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</time>
        <div><b>{item.publisherName}</b><strong>{item.title}</strong></div>
        <ArrowRight size={17}/>
      </a>)}</div>
    </div>}
  </section>;
}
