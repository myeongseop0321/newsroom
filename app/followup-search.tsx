'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock3, LoaderCircle, Search } from 'lucide-react';
import { publishers } from '@/lib/publishers';

type Result={query:string;days:number;headline:string;overview:string;from:string;to:string;publisherCount:number;events:Array<{date:string;publisher:string;publisherName:string;title:string;summary:string;url:string}>};
const progress=['관련 기사를 찾고 있습니다.','발행일과 언론사를 확인하고 있습니다.','기사의 흐름을 시간순으로 정리하고 있습니다.'];
export default function FollowupSearch({days}:{days:number}){
 const [query,setQuery]=useState(''),[result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[step,setStep]=useState(0);
 useEffect(()=>{setResult(null);setError('')},[days]);
 useEffect(()=>{if(!loading)return;const timer=setInterval(()=>setStep(value=>(value+1)%progress.length),2400);return()=>clearInterval(timer)},[loading]);
 async function submit(event:FormEvent){event.preventDefault();const value=query.trim();if(value.length<2)return;setLoading(true);setError('');setResult(null);setStep(0);try{const response=await fetch('/api/followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:value,days})}),data=await response.json() as Result&{error?:string};if(!response.ok)throw Error(data.error||'검색을 완료하지 못했습니다.');setResult(data)}catch(reason){setError(reason instanceof Error?reason.message:'검색을 완료하지 못했습니다.')}finally{setLoading(false)}}
 const scale=useMemo(()=>{if(!result)return null;const first=Math.min(...result.events.map(item=>Date.parse(item.date))),last=Math.max(...result.events.map(item=>Date.parse(item.date))),padding=Math.max(86400000,(last-first)*.04);return {start:first-padding,end:last+padding}},[result]);
 return <section className="search-followup">
  <form className="followup-searchbox" onSubmit={submit}><Search size={21}/><input value={query} onChange={event=>setQuery(event.target.value)} maxLength={80} placeholder="추적할 뉴스나 이슈를 검색해 보세요" aria-label="이슈 검색어"/><button disabled={loading||query.trim().length<2}>{loading?<LoaderCircle className="spin" size={17}/>:<Search size={17}/>} 검색</button></form>
  {!result&&!loading&&!error&&<div className="followup-intro"><Clock3/><h3>검색한 이슈의 보도 흐름을 만들어 드립니다.</h3><p>예: 의대 정원, 반도체 관세, 부동산 공급 대책</p><span>검색할 때마다 선택한 {days}일 범위의 기사를 새로 확인합니다.</span></div>}
  {loading&&<div className="followup-progress"><LoaderCircle className="spin"/><strong>{progress[step]}</strong><p>검색 범위와 기사량에 따라 30초~1분 정도 걸릴 수 있습니다. 화면을 닫지 말고 잠시 기다려 주세요.</p><div><i className={step>=0?'active':''}/><i className={step>=1?'active':''}/><i className={step>=2?'active':''}/></div></div>}
  {error&&<div className="followup-error" role="alert"><strong>타임라인을 만들지 못했습니다.</strong><p>{error}</p><button onClick={()=>setError('')}>다시 검색하기</button></div>}
  {result&&scale&&<div className="searched-timeline"><header><span>SEARCHED ISSUE · {result.days} DAYS</span><h3>{result.headline}</h3><p>{result.overview}</p><div><b>{result.events.length}건</b><b>{result.publisherCount}개 언론사</b><time>{new Date(result.events[0].date).toLocaleDateString('ko-KR')} — {new Date(result.events.at(-1)!.date).toLocaleDateString('ko-KR')}</time></div></header>
   <div className="searched-axis"><div className="searched-bar">{[0,.25,.5,.75,1].map(value=><span className="axis-tick" key={value} style={{left:`${value*100}%`}}><i/><time>{new Date(scale.start+(scale.end-scale.start)*value).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</time></span>)}{result.events.map((item,index)=>{const press=publishers.find(publisher=>publisher.id===item.publisher),left=Math.max(1,Math.min(99,(Date.parse(item.date)-scale.start)/(scale.end-scale.start)*100));return <a className="searched-point" key={item.url} href={item.url} target="_blank" rel="noreferrer" style={{left:`${left}%`,top:`${18+(index%4)*17}px`,background:press?.color}} aria-label={`${item.publisherName} ${item.title}`}><span><time>{new Date(item.date).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'})}</time><b>{item.publisherName}</b><em>{item.title}</em><small>{item.summary}</small></span></a>})}</div></div>
   <div className="searched-events">{[...result.events].reverse().map(item=><a href={item.url} target="_blank" rel="noreferrer" key={item.url}><time>{new Date(item.date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</time><div><b>{item.publisherName}</b><strong>{item.title}</strong><p>{item.summary}</p></div><ArrowUpRight size={17}/></a>)}</div>
  </div>}
 </section>;
}
