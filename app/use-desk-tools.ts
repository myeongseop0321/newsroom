'use client';
import { useEffect } from 'react';
type Context={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
export function useDeskTools(setView:(view:string)=>void){
 useEffect(()=>{const context=(document as Document & {modelContext?:Context}).modelContext;if(!context)return;const lifecycle=new AbortController();
  Promise.resolve(context.registerTool({name:'open_news_view',description:'뉴스 데스크에서 오늘의 뉴스, 이슈 랭킹, 오피니언, 이슈 팔로우업 또는 스크랩 탭을 엽니다. 저장 데이터는 변경하지 않습니다.',inputSchema:{type:'object',properties:{view:{type:'string',enum:['front','ranking','opinion','followup','scraps']}},required:['view'],additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||typeof input!=='object'||!('view' in input)||typeof input.view!=='string'||!['front','ranking','opinion','followup','scraps'].includes(input.view))throw Error('지원하지 않는 화면입니다.');setView(input.view);return {view:input.view};}},{signal:lifecycle.signal})).catch(()=>{});
  return()=>lifecycle.abort();
 },[setView]);
}
