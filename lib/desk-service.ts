import { database } from '@/db';
import { env } from 'cloudflare:workers';
import { indexArticlesInElastic } from './elasticsearch';
import { publishers, type Article, type DeskState, type FollowupState, type SourceStatus, type Topic } from './publishers';
import { buildTimeline, collect, keywordTopics, validateTopics } from './news';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
type Setting={publishers:string;revision:number;topics:string;analysis_mode:string;analysis_at:string|null};
const columns='a.id,a.publisher,a.title,a.url,a.section,a.published_at AS publishedAt,a.collected_at AS collectedAt,a.image';
export async function setting(userId:string){return database().prepare('SELECT * FROM settings WHERE user_id=?').bind(userId).first<Setting>();}
export async function desk(userId:string):Promise<DeskState>{
 const db=database(),s=await setting(userId),selected:string[]=JSON.parse(s?.publishers||'[]');
 const saved=await db.prepare(`SELECT ${columns} FROM scraps s JOIN articles a ON a.id=s.article_id WHERE s.user_id=? ORDER BY s.created_at DESC`).bind(userId).all<Article>();
 const articles=selected.length?(await db.prepare(`SELECT ${columns} FROM articles a WHERE a.publisher IN (${selected.map(()=>'?').join(',')}) AND a.collected_at>=? ORDER BY a.collected_at DESC LIMIT 500`).bind(...selected,new Date(Date.now()-48*3600000).toISOString()).all<Article>()).results:[];
 const statuses=selected.length?(await db.prepare(`SELECT publisher,section,status,count,checked_at AS checkedAt,message FROM sources WHERE publisher IN (${selected.map(()=>'?').join(',')})`).bind(...selected).all<SourceStatus>()).results:[];
 const savedTopics=validateTopics(JSON.parse(s?.topics||'[]') as Topic[],articles),topics=savedTopics.length?savedTopics:keywordTopics(articles);
 const cutoff=new Date(Date.now()-10*60*1000).toISOString();
 const breaking=selected.length?(await db.prepare(`SELECT ${columns} FROM articles a WHERE a.publisher IN (${selected.map(()=>'?').join(',')}) AND a.section='front' AND COALESCE(a.published_at,a.collected_at)>=? ORDER BY COALESCE(a.published_at,a.collected_at) DESC LIMIT 20`).bind(...selected,cutoff).all<Article>()).results:[];
 return {selected,articles,scraps:saved.results,topics,breaking,statuses,analysisMode:s?.analysis_mode||'keyword',analysisAt:s?.analysis_at||null,aiAvailable:false};
}
export async function followup(days=90):Promise<FollowupState>{
 const safeDays=[30,60,90,120].includes(days)?days:90,to=new Date(),from=new Date(Date.now()-safeDays*86400000),rows=(await database().prepare(`SELECT ${columns} FROM articles a WHERE COALESCE(a.published_at,a.collected_at)>=? ORDER BY COALESCE(a.published_at,a.collected_at) DESC LIMIT 3000`).bind(from.toISOString()).all<Article>()).results;
 const times=rows.map(row=>Date.parse(row.publishedAt||row.collectedAt)).filter(Number.isFinite),first=times.length?Math.min(...times):from.getTime(),last=times.length?Math.max(...times):to.getTime(),padding=Math.max(3600000,(last-first)*.025);
 return {days:safeDays,from:new Date(Math.max(from.getTime(),first-padding)).toISOString(),to:new Date(Math.min(to.getTime()+padding,last+padding)).toISOString(),topics:buildTimeline(rows),publisherCount:new Set(rows.map(row=>row.publisher)).size};
}
export async function saveSettings(userId:string,selected:string[]){
 await database().prepare("INSERT INTO settings(user_id,publishers) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET publishers=excluded.publishers,revision=revision+1,topics='[]',analysis_mode='none',analysis_at=NULL").bind(userId,JSON.stringify(selected)).run();
}
export async function refresh(userId:string){
 const db=database(),s=await setting(userId);const selected:string[]=JSON.parse(s?.publishers||'[]');if(!s||!selected.length)throw new HttpError(400,'언론사를 먼저 선택해 주세요.');
 const lock=await db.prepare('UPDATE settings SET refresh_until=? WHERE user_id=? AND refresh_until<?').bind(Date.now()+120000,userId,Date.now()).run();
 if(!lock.meta.changes)throw new HttpError(429,'수집 중이거나 방금 업데이트했습니다. 잠시 후 다시 시도해 주세요.');
 try {
  const results=await Promise.all(publishers.filter(p=>selected.includes(p.id)).flatMap(p=>(['front','opinion'] as const).map(section=>collect(p,section))));
  const statements:D1PreparedStatement[]=[];
  for(const {articles,status} of results){
   for(const a of articles)statements.push(db.prepare("INSERT INTO articles(id,publisher,title,url,section,published_at,collected_at,image) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,published_at=COALESCE(excluded.published_at,articles.published_at),section=CASE WHEN articles.section='opinion' THEN 'opinion' ELSE excluded.section END").bind(a.id,a.publisher,a.title,a.url,a.section,a.publishedAt,a.collectedAt,a.image));
   statements.push(db.prepare('INSERT INTO sources(publisher,section,status,count,checked_at,message) VALUES(?,?,?,?,?,?) ON CONFLICT(publisher,section) DO UPDATE SET status=excluded.status,count=excluded.count,checked_at=excluded.checked_at,message=excluded.message').bind(status.publisher,status.section,status.status,status.count,status.checkedAt,status.message));
  }
  for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
  await indexArticlesInElastic(env,results.flatMap(result=>result.articles));
  const state=await desk(userId),topics=keywordTopics(state.articles.filter(article=>article.section==='front'));
  await db.prepare('UPDATE settings SET topics=?,analysis_mode=?,analysis_at=? WHERE user_id=? AND revision=?').bind(JSON.stringify(topics),'keyword',new Date().toISOString(),userId,s.revision).run();
  const failed=results.filter(r=>r.status.status==='error').length;
  return {ok:true,warning:failed?`${failed}개 수집 경로에서 오류가 발생했습니다. 기존 기사는 유지합니다.`:null};
 }finally{await db.prepare('UPDATE settings SET refresh_until=? WHERE user_id=?').bind(Date.now()+30000,userId).run();}
}
export async function saveScrap(userId:string,id:string,remove:boolean){
 const db=database();if(remove){await db.prepare('DELETE FROM scraps WHERE user_id=? AND article_id=?').bind(userId,id).run();return;}
 const article=await db.prepare('SELECT publisher FROM articles WHERE id=?').bind(id).first<{publisher:string}>();
 if(!article)throw new HttpError(404,'기사를 찾을 수 없습니다.');
 const s=await setting(userId);if(!(JSON.parse(s?.publishers||'[]') as string[]).includes(article.publisher))throw new HttpError(403,'선택한 언론사의 기사만 스크랩할 수 있습니다.');
 await db.prepare('INSERT INTO scraps(user_id,article_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,article_id) DO NOTHING').bind(userId,id,new Date().toISOString()).run();
}
