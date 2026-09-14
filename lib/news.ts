import { publishers, type Article, type Topic, type SourceStatus } from './publishers';
import { parse } from 'node-html-parser';

export function plain(value:string) {
 return parse(value).textContent.replace(/\s+/g,' ').trim();
}
export function canonical(raw:string,base:string) {
 const u=new URL(raw,base), allowed=new URL(base).hostname.replace(/^www\./,'');
 if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error('Invalid URL');
 if(u.hostname!==allowed&&!u.hostname.endsWith('.'+allowed))throw Error('Foreign URL');
 u.protocol='https:';u.hash='';u.search='';return u.href;
}
export function extract(html:string,p:typeof publishers[number],section:Article['section']) {
 const found=new Map<string,{title:string;url:string}>();
 const root=parse(html);root.querySelectorAll('script,style,header,footer,nav').forEach(el=>el.remove());
 for(const anchor of root.querySelectorAll('a[href]')) {
  const href=anchor.getAttribute('href');if(!href)continue;
  try {const url=canonical(plain(href),p.home);if(!new RegExp(p.articlePattern).test(new URL(url).pathname))continue;
   const heading=anchor.querySelector('h1,h2,h3,h4,h5,strong,.tit,.title,.news_ttl');
   const title=(heading?.textContent||anchor.getAttribute('title')||anchor.textContent).replace(/\s+/g,' ').trim();if(title.length<12||title.length>220)continue;
   if(/구독료|구독 신청|광고 문의/.test(title)||/\/special\/|\/promotion\//.test(url))continue;
   if(section==='opinion'&&['chosun','hani','seoul','mk'].includes(p.id)&&!/(opinion|editorial|editOpinion|column)/i.test(url))continue;
   const date=url.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//)||url.match(/\/(20\d{2})(\d{2})(\d{2})\d{4,}/);
   if(date){const age=Date.now()-Date.parse(`${date[1]}-${date[2]}-${date[3]}T00:00:00+09:00`);if(age>4*86400000||age< -86400000)continue;}
   if(!found.has(url))found.set(url,{title,url});
  } catch {continue;}
 }
 return [...found.values()].slice(0,section==='front'?24:16);
}
export async function collect(p:typeof publishers[number],section:Article['section']):Promise<{articles:Article[];status:SourceStatus}> {
 const now=new Date().toISOString();const status:SourceStatus={publisher:p.id,section,status:'ok',count:0,checkedAt:now,message:null};
 try {
  const response=await fetch(section==='front'?p.home:p.opinion,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Pressroom/1.0 (headline reader)','Accept':'text/html'}});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const html=await response.text();if(html.length>8_000_000)throw Error('응답 크기 초과');
  const rows=extract(html,p,section);if(!rows.length)throw Error('기사 링크를 찾지 못했습니다.');
  const articles=await Promise.all(rows.map(async row=>({ ...row,id:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.url)))).map(x=>x.toString(16).padStart(2,'0')).join(''),publisher:p.id,section,publishedAt:null,collectedAt:now,image:null })));
  status.count=articles.length;return {articles,status};
 }catch(e){status.status='error';status.message=e instanceof Error?e.message:'수집 실패';return {articles:[],status};}
}
const tokens=(s:string)=>new Set(s.replace(/\[[^\]]*\]/g,'').toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[]);
export function keywordTopics(articles:Article[]):Topic[] {
 const groups:Article[][]=[];
 for(const article of articles){const a=tokens(article.title);const group=groups.find(g=>{const b=tokens(g[0].title);const shared=[...a].filter(t=>b.has(t)).length;return shared>=3&&shared/Math.max(a.size,b.size)>=0.45;});if(group)group.push(article);else groups.push([article]);}
 return validateTopics(groups.map(g=>({title:g[0].title,summary:'제목 유사도로 묶은 관련 보도입니다. 원문에서 맥락을 확인하세요.',articleIds:g.map(a=>a.id),publisherCount:0})),articles);
}
export function validateTopics(topics:Topic[],articles:Article[]):Topic[] {
 const byId=new Map(articles.map(a=>[a.id,a]));const used=new Set<string>();
 return topics.map(t=>{const ids=[...new Set(t.articleIds)].filter(id=>byId.has(id)&&!used.has(id));const count=new Set(ids.map(id=>byId.get(id)!.publisher)).size;
  if(count<2)return null;ids.forEach(id=>used.add(id));return {...t,title:t.title.slice(0,150),summary:t.summary.slice(0,500),articleIds:ids,publisherCount:count};
 }).filter((t):t is Topic=>!!t).sort((a,b)=>b.publisherCount-a.publisherCount||Math.max(...b.articleIds.map(id=>Date.parse(byId.get(id)!.collectedAt)))-Math.max(...a.articleIds.map(id=>Date.parse(byId.get(id)!.collectedAt)))).slice(0,10);
}
