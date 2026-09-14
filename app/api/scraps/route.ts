import { z } from 'zod';
import { api,body } from '@/lib/api';
import { saveScrap } from '@/lib/desk-service';
const schema=z.object({articleId:z.string().regex(/^[a-f0-9]{64}$/)});
const handler=api(async(userId,request)=>{const input=schema.parse(await body(request));await saveScrap(userId,input.articleId,request.method==='DELETE');return {ok:true};});
export const POST=handler;
export const DELETE=handler;
