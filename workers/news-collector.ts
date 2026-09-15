import { collect, enrichArticleImages } from '../lib/news';
import { indexArticlesInElastic, type ElasticEnv } from '../lib/elasticsearch';
import { publishers, type Article, type SourceStatus } from '../lib/publishers';

interface Env extends ElasticEnv { DB:D1Database }

async function run(env:Env){
 const db=env.DB;
 const results=await Promise.all(publishers.flatMap(publisher=>(['front','opinion'] as const).map(section=>collect(publisher,section))));
 const statements:D1PreparedStatement[]=[];
 for(const {articles,status} of results){
  for(const article of articles)statements.push(db.prepare("INSERT INTO articles(id,publisher,title,url,section,published_at,collected_at,image) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,published_at=COALESCE(excluded.published_at,articles.published_at),section=CASE WHEN articles.section='opinion' THEN 'opinion' ELSE excluded.section END,image=COALESCE(excluded.image,articles.image)").bind(article.id,article.publisher,article.title,article.url,article.section,article.publishedAt,article.collectedAt,article.image));
  statements.push(db.prepare('INSERT INTO sources(publisher,section,status,count,checked_at,message) VALUES(?,?,?,?,?,?) ON CONFLICT(publisher,section) DO UPDATE SET status=excluded.status,count=excluded.count,checked_at=excluded.checked_at,message=excluded.message').bind(status.publisher,status.section,status.status,status.count,status.checkedAt,status.message));
 }
 for(let index=0;index<statements.length;index+=50)await db.batch(statements.slice(index,index+50));
 await indexArticlesInElastic(env,results.flatMap(result=>result.articles) as Article[]);
 const statuses=results.map(result=>result.status) as SourceStatus[];
 return {ok:true,collected:results.reduce((total,result)=>total+result.articles.length,0),healthy:statuses.filter(status=>status.status==='ok').length,total:statuses.length,at:new Date().toISOString()};
}

async function backfillImages(env:Env){
 const db=env.DB,articles=(await db.prepare("SELECT id,publisher,title,url,section,published_at AS publishedAt,collected_at AS collectedAt,image FROM articles WHERE section='front' AND (image IS NULL OR image='') AND COALESCE(published_at,collected_at)>=datetime('now','-2 days') ORDER BY COALESCE(published_at,collected_at) DESC LIMIT 16").all<Article>()).results;
 const filled=await enrichArticleImages(articles,16),updates=articles.filter(article=>article.image).map(article=>db.prepare("UPDATE articles SET image=? WHERE id=? AND (image IS NULL OR image='')").bind(article.image,article.id));
 if(updates.length)await db.batch(updates);
 return {ok:true,checked:articles.length,filled,at:new Date().toISOString()};
}

export default {
 async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext){ctx.waitUntil(controller.cron.startsWith('5,')?backfillImages(env):run(env));},
 async fetch(request:Request,env:Env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return Response.json({ok:true,service:'pressroom-news-collector'});
  if(url.pathname==='/collect'&&request.headers.get('CF-Worker')==='scheduled')return Response.json(await run(env));
  return new Response('Not found',{status:404});
 }
};
