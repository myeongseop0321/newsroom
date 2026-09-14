import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
async function moduleFrom(path){const source=await readFile(new URL(path,import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("'node-html-parser'",JSON.stringify(import.meta.resolve('node-html-parser')));return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));}
const {publishers}=await moduleFrom('../lib/publishers.ts');
const {extract,canonical,keywordTopics,validateTopics,collect}=await moduleFrom('../lib/news.ts');
assert.throws(()=>canonical('https://evil.example/news/a','https://www.donga.com'));
assert.throws(()=>canonical('javascript:alert(1)','https://www.donga.com'));
const stamp=new Date().toISOString().slice(0,10).replaceAll('-','');
const html=`<a href="/news/Politics/article/${stamp}/123/1?utm=a"><strong>정부 오늘 새로운 정책 발표 후 여야 반응</strong></a><a href="/news/Politics/article/${stamp}/123/1">정부 오늘 새로운 정책 발표 후 여야 반응</a>`;
assert.equal(extract(html,publishers[0],'front').length,1);
const article=(id,publisher,title)=>({id,publisher,title,collectedAt:new Date().toISOString()});
const fixture=[article('a','donga','정부 새로운 정책 발표 여야 반응'),article('b','hani','정부 새로운 정책 발표 여야 반응'),article('c','hani','전국 내일 비 예보 기온 하락')];
assert.equal(keywordTopics(fixture)[0].publisherCount,2);
assert.equal(validateTopics([{title:'t',summary:'s',articleIds:['a','a','missing'],publisherCount:99}],fixture).length,0);
assert.equal(validateTopics([{title:'t',summary:'s',articleIds:['a','b'],publisherCount:99},{title:'dup',summary:'s',articleIds:['a','b'],publisherCount:99}],fixture).length,1);
console.log('PASS: canonical URL, hostile URL rejection, duplicate links, distinct publishers, unknown IDs, duplicate topic membership');
if(process.argv.includes('--live')){
 const results=await Promise.all(publishers.flatMap(p=>['front','opinion'].map(async section=>{const result=await collect(p,section);return {publisher:p.id,section,count:result.articles.length,message:result.status.message,sample:result.articles[0]?.title};})));
 console.log(JSON.stringify(results,null,2));
}
