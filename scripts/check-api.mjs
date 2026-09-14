import assert from 'node:assert/strict';
const base='http://localhost:5173';
const anonymous=await fetch(base+'/api/desk');assert.equal(anonymous.status,401);
const forged=await fetch(base+'/api/desk',{headers:{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.test'}});assert.equal(forged.status,401);
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');assert.ok(cookie);
const request=(path,method='GET',data,extra={})=>fetch(base+path,{method,headers:{cookie,...(method==='GET'?{}:{'Content-Type':'application/json',Origin:base}),...extra},...(data===undefined?{}:{body:JSON.stringify(data)})});
assert.equal((await request('/api/settings','PUT',{publishers:['invalid']})).status,400);
assert.equal((await request('/api/settings','PUT',{publishers:[]},{Origin:'https://evil.example'})).status,403);
const original=await (await request('/api/desk')).json();assert.ok(original.selected.length>0);assert.ok(original.articles.length>0);
const id=original.articles[0].id,wasSaved=original.scraps.some(a=>a.id===id);
assert.equal((await request('/api/scraps','POST',{articleId:id})).status,200);
assert.equal((await request('/api/scraps','POST',{articleId:id})).status,200);
const after=await (await request('/api/desk')).json();assert.equal(after.scraps.filter(a=>a.id===id).length,1);
if(!wasSaved){assert.equal((await request('/api/scraps','DELETE',{articleId:id})).status,200);const clean=await (await request('/api/desk')).json();assert.ok(!clean.scraps.some(a=>a.id===id));}
console.log('PASS: anonymous and forged-identity rejection, publisher validation, cross-origin rejection, persistent and idempotent scraps, scrap removal');
console.log(JSON.stringify({publishers:new Set(original.articles.map(a=>a.publisher)).size,articles:original.articles.length,topics:original.topics.length,analysisMode:original.analysisMode}));
