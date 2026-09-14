import { collect, discoverHistory } from '../lib/news';
import { publishers, type SourceStatus } from '../lib/publishers';

interface Env { DB:D1Database }

async function run(db:D1Database){
 const results=await Promise.all(publishers.flatMap(publisher=>(['front','opinion'] as const).map(section=>collect(publisher,section))));
 const frontByPublisher=new Map(results.filter(result=>result.status.section==='front').map(result=>[result.status.publisher,result.articles[0]]));
 const candidates=(await db.prepare(`SELECT a.id,a.publisher,a.title,a.url,a.section,a.published_at AS publishedAt,a.collected_at AS collectedAt,a.image FROM articles a
  LEFT JOIN history_crawls h ON h.article_id=a.id WHERE h.article_id IS NULL AND a.published_at>=? ORDER BY a.published_at ASC LIMIT 3`).bind(new Date(Date.now()-120*86400000).toISOString()).all<import('../lib/publishers').Article>()).results;
 const seeds=candidates.length?candidates:[...frontByPublisher.values()].filter(Boolean).slice(0,1),history=(await Promise.all(seeds.map(seed=>{const publisher=publishers.find(item=>item.id===seed.publisher);return publisher?discoverHistory(publisher,seed,120):[]}))).flat();
 const statements:D1PreparedStatement[]=[];
 for(const {articles,status} of results){
  for(const article of articles)statements.push(db.prepare("INSERT INTO articles(id,publisher,title,url,section,published_at,collected_at,image) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,published_at=COALESCE(excluded.published_at,articles.published_at),section=CASE WHEN articles.section='opinion' THEN 'opinion' ELSE excluded.section END").bind(article.id,article.publisher,article.title,article.url,article.section,article.publishedAt,article.collectedAt,article.image));
  statements.push(db.prepare('INSERT INTO sources(publisher,section,status,count,checked_at,message) VALUES(?,?,?,?,?,?) ON CONFLICT(publisher,section) DO UPDATE SET status=excluded.status,count=excluded.count,checked_at=excluded.checked_at,message=excluded.message').bind(status.publisher,status.section,status.status,status.count,status.checkedAt,status.message));
 }
 for(const article of history)statements.push(db.prepare("INSERT INTO articles(id,publisher,title,url,section,published_at,collected_at,image) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,published_at=COALESCE(excluded.published_at,articles.published_at)").bind(article.id,article.publisher,article.title,article.url,article.section,article.publishedAt,article.collectedAt,article.image));
 for(const seed of seeds)statements.push(db.prepare('INSERT INTO history_crawls(article_id,crawled_at) VALUES(?,?) ON CONFLICT(article_id) DO NOTHING').bind(seed.id,new Date().toISOString()));
 for(let index=0;index<statements.length;index+=50)await db.batch(statements.slice(index,index+50));
 const statuses=results.map(result=>result.status) as SourceStatus[];
 return {ok:true,collected:results.reduce((total,result)=>total+result.articles.length,0),history:history.length,healthy:statuses.filter(status=>status.status==='ok').length,total:statuses.length,at:new Date().toISOString()};
}

export default {
 async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(run(env.DB));},
 async fetch(request:Request,env:Env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return Response.json({ok:true,service:'pressroom-news-collector'});
  if(url.pathname==='/collect'&&request.headers.get('CF-Worker')==='scheduled')return Response.json(await run(env.DB));
  return new Response('Not found',{status:404});
 }
};
