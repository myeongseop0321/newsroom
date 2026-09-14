import { getAppUser } from '@/app/auth';
import { HttpError } from './desk-service';
import { ZodError } from 'zod';
export function api(action:(userId:string,request:Request)=>Promise<unknown>){return async(request:Request)=>{
 try{
  const user=await getAppUser();if(!user)throw new HttpError(401,'로그인이 필요합니다.');
  if(request.method!=='GET'){
   const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new HttpError(403,'허용되지 않은 요청입니다.');
   if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError(415,'JSON 요청이 필요합니다.');
  }
  return Response.json(await action(user.userId,request),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){const status=e instanceof HttpError?e.status:e instanceof ZodError||e instanceof SyntaxError?400:503;return Response.json({error:e instanceof HttpError?e.message:status===400?'입력값을 확인해 주세요.':'뉴스 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'},{status,headers:{'Cache-Control':'no-store'}});}
};}
export async function body(request:Request){const text=await request.text();if(text.length>4096)throw new HttpError(413,'입력이 너무 큽니다.');return JSON.parse(text);}
