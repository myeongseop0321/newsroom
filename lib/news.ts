import { publishers, type Article, type Topic, type SourceStatus } from './publishers';
import { parse } from 'node-html-parser';

export function plain(value:string) {
 return parse(value).textContent.replace(/\s+/g,' ').trim();
}
export function canonical(raw:string,base:string) {
 const u=new URL(raw,base), allowed=new URL(base).hostname.replace(/^www\./,'');
 if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error('Invalid URL');
 if(u.hostname!==allowed&&!u.hostname.endsWith('.'+allowed))throw Error('Foreign URL');
 u.protocol='https:';u.hash='';
 for(const key of [...u.searchParams.keys()])if(/^utm(?:_|$)|^(fbclid|gclid|ref|source)$/i.test(key))u.searchParams.delete(key);
 return u.href;
}
export function extract(html:string,p:typeof publishers[number],section:Article['section'],maxAgeDays=4) {
 const found=new Map<string,{title:string;url:string;publishedAt:string|null}>();
 const root=parse(html);root.querySelectorAll('script,style,header,footer,nav').forEach(el=>el.remove());
 for(const anchor of root.querySelectorAll('a[href]')) {
  const href=anchor.getAttribute('href');if(!href)continue;
  try {const url=canonical(plain(href),p.home),parsedUrl=new URL(url);if(!new RegExp(p.articlePattern,'i').test(parsedUrl.pathname+parsedUrl.search))continue;
   const heading=anchor.querySelector('h1,h2,h3,h4,h5,strong,.tit,.title,.news_ttl');
   const rawTitle=(heading?.textContent||anchor.getAttribute('title')||anchor.textContent).replace(/\s+/g,' ').trim(), repeated=rawTitle.match(/^(.{12,}?)\s+\1$/),title=repeated?.[1]||rawTitle;if(title.length<12||title.length>220)continue;
   if(/구독료|구독 신청|광고 문의/.test(title)||/\/special\/|\/promotion\//.test(url))continue;
   if(section==='opinion'&&['chosun','hani','seoul','mk'].includes(p.id)&&!/(opinion|editorial|editOpinion|column)/i.test(url))continue;
   const date=url.match(/(20\d{2})[\/.\-](\d{2})[\/.\-](\d{2})/)||url.match(/(20\d{2})(\d{2})(\d{2})\d{4,}/),publishedAt=date?new Date(`${date[1]}-${date[2]}-${date[3]}T00:00:00+09:00`).toISOString():null;
   if(publishedAt){const age=Date.now()-Date.parse(publishedAt);if(age>maxAgeDays*86400000||age< -86400000)continue;}
   if(!found.has(url))found.set(url,{title,url,publishedAt});
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
  const rows=extract(html,p,section), feedRows=section==='front'&&p.rss?await feed(p).catch(()=>[]):[];
  const merged=new Map([...feedRows,...rows].map(row=>[row.url,row]));if(!merged.size)throw Error('기사 링크를 찾지 못했습니다.');
  const articles=await Promise.all([...merged.values()].slice(0,32).map(async row=>({ ...row,id:await articleId(row.url),publisher:p.id,section,publishedAt:'publishedAt' in row&&typeof row.publishedAt==='string'?row.publishedAt:null,collectedAt:now,image:null })));
  status.count=articles.length;return {articles,status};
 }catch(e){status.status='error';status.message=e instanceof Error?e.message:'수집 실패';return {articles:[],status};}
}
async function feed(p:typeof publishers[number]):Promise<{title:string;url:string;publishedAt:string|null}[]> {
 const response=await fetch(p.rss,{signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Pressroom/1.0 (RSS reader)','Accept':'application/rss+xml,application/xml,text/xml'}});if(!response.ok)throw Error(`RSS HTTP ${response.status}`);
 const root=parse(await response.text()), rows=[] as {title:string;url:string;publishedAt:string|null}[];
 for(const item of root.querySelectorAll('item,entry')){const title=cleanFeed(item.querySelector('title')?.textContent||'');const raw=item.querySelector('link')?.getAttribute('href')||item.querySelector('link')?.textContent||'';if(title.length<12||!raw)continue;
  try{const url=canonical(cleanFeed(raw),p.home),u=new URL(url);if(!new RegExp(p.articlePattern,'i').test(u.pathname+u.search))continue;const rawDate=cleanFeed(item.querySelector('pubDate,published,updated,dc\\:date')?.textContent||'');const parsed=Date.parse(rawDate);rows.push({title,url,publishedAt:Number.isNaN(parsed)?null:new Date(parsed).toISOString()});}catch{continue;}
 }
 return rows.slice(0,32);
}
const cleanFeed=(value:string)=>value.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const articleId=async(url:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const tokens=(s:string)=>new Set(s.replace(/\[[^\]]*\]/g,'').toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[]);
const rankingStopWords=new Set(['속보','단독','종합','영상','포토','오늘','뉴스','관련','대한','통해','위해','정부','대통령','대표','위원장','기자','언론사','공식','발표','밝혀','논란']);
const rankingTokens=(title:string)=>new Set([...tokens(title)].filter(token=>!rankingStopWords.has(token)&&!/^\d+$/.test(token)));
const similarity=(left:Set<string>,right:Set<string>)=>{
 const shared=[...left].filter(token=>right.has(token)).length;
 const smaller=Math.min(left.size,right.size);
 if(!smaller||shared<2)return 0;
 const containment=shared/smaller,jaccard=shared/(left.size+right.size-shared);
 return shared>=3&&containment>=.5?containment+jaccard:shared>=2&&containment>=.67&&jaccard>=.34?containment+jaccard:0;
};
export function keywordTopics(articles:Article[]):Topic[] {
 const groups:Article[][]=[];
 for(const article of [...articles].sort((a,b)=>Date.parse(b.collectedAt)-Date.parse(a.collectedAt))){
  const articleTokens=rankingTokens(article.title);
  const best=groups.map((group,index)=>({index,score:Math.max(...group.map(candidate=>similarity(articleTokens,rankingTokens(candidate.title))))})).sort((a,b)=>b.score-a.score)[0];
  if(best?.score>0)groups[best.index].push(article);else groups.push([article]);
 }
 return validateTopics(groups.map(g=>({title:g[0].title,summary:'제목 유사도로 묶은 관련 보도입니다. 원문에서 맥락을 확인하세요.',articleIds:g.map(a=>a.id),publisherCount:0})),articles);
}
export function validateTopics(topics:Topic[],articles:Article[]):Topic[] {
 const byId=new Map(articles.map(a=>[a.id,a]));const used=new Set<string>();
 return topics.map(t=>{const ids=[...new Set(t.articleIds)].filter(id=>byId.has(id)&&!used.has(id));const count=new Set(ids.map(id=>byId.get(id)!.publisher)).size;
  if(count<2)return null;ids.forEach(id=>used.add(id));return {...t,title:t.title.slice(0,150),summary:t.summary.slice(0,500),articleIds:ids,publisherCount:count};
 }).filter((t):t is Topic=>!!t).sort((a,b)=>b.publisherCount-a.publisherCount||Math.max(...b.articleIds.map(id=>Date.parse(byId.get(id)!.collectedAt)))-Math.max(...a.articleIds.map(id=>Date.parse(byId.get(id)!.collectedAt)))).slice(0,10);
}

const timelineStopWords=new Set(['단독','속보','종합','영상','포토','오늘','내일','관련','대한','통해','위해','기자','정부','국민','한국','서울','대통령','대표','위원장','밝혀','논란','뉴스']);
const topicTokens=(title:string)=>[...tokens(title)].filter(token=>!timelineStopWords.has(token)&&!/^\d+$/.test(token));
export function buildTimeline(articles:Article[]) {
 const rows=articles.slice(0,3000), buckets=new Map<string,Article[]>();
 for(const article of rows)for(const word of new Set(topicTokens(article.title)))buckets.set(word,[...(buckets.get(word)||[]),article]);
 const candidates=[...buckets].map(([anchor,matches])=>{const publishers=new Set(matches.map(article=>article.publisher));if(publishers.size<2||matches.length<3)return null;
  const coTerms=new Map<string,number>();for(const article of matches)for(const word of new Set(topicTokens(article.title)))if(word!==anchor)coTerms.set(word,(coTerms.get(word)||0)+1);
  const keywords=[anchor,...[...coTerms].filter(([,count])=>count>=2).sort((a,b)=>b[1]-a[1]||b[0].length-a[0].length).slice(0,2).map(([word])=>word)];
  const points=matches.map(article=>({id:article.id,publisher:article.publisher,title:article.title,at:article.publishedAt||article.collectedAt})).filter(point=>!Number.isNaN(Date.parse(point.at))).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-120);
  const span=points.length?Math.max(0,Date.parse(points.at(-1)!.at)-Date.parse(points[0].at))/86400000:0;
  return {title:keywords.join(' · '),keywords,publisherCount:publishers.size,articleCount:matches.length,points,ids:new Set(matches.map(article=>article.id)),score:publishers.size*20+Math.min(matches.length,30)+Math.min(span,90)/3};
 }).filter((topic):topic is NonNullable<typeof topic>=>!!topic).sort((a,b)=>b.score-a.score);
 const selected:typeof candidates=[];
 for(const candidate of candidates){if(selected.some(existing=>{let overlap=0;for(const id of candidate.ids)if(existing.ids.has(id))overlap++;return overlap/Math.min(candidate.ids.size,existing.ids.size)>.62;}))continue;selected.push(candidate);if(selected.length===12)break;}
 return selected.map(topic=>({title:topic.title,keywords:topic.keywords,publisherCount:topic.publisherCount,articleCount:topic.articleCount,points:topic.points}));
}
