'use client';

import { ChevronRight, Info, Sparkles } from 'lucide-react';
import type { Topic } from '@/lib/publishers';

export default function RankingPage({ topics, onSelect, onExplain }: {
  topics: Topic[];
  onSelect: (topic: Topic) => void;
  onExplain: () => void;
}) {
  return <div className="ranking-page">
    <header className="ranking-page-intro">
      <div><Sparkles size={20}/><span>TOP ISSUES</span></div>
      <p>선택한 언론사들이 공통으로 다룬 주제를 언론사 수와 최신 보도 순서로 정리했습니다.</p>
    </header>
    {topics.length ? <div className="ranking-page-list">{topics.map((topic, index) => <button key={topic.title} onClick={() => onSelect(topic)}>
      <b>{String(index + 1).padStart(2, '0')}</b>
      <div><h3>{topic.title}</h3><p>{topic.publisherCount}개 언론사 공통 보도</p></div>
      <ChevronRight size={20}/>
    </button>)}</div> : <div className="ranking-page-empty">언론사를 선택하고 뉴스를 새로고침하면 공통 이슈가 표시됩니다.</div>}
    <button className="ranking-explain" onClick={onExplain}><Info size={15}/> 이슈 랭킹 산정 방식 보기</button>
  </div>;
}
