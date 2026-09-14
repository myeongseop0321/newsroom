import { z } from 'zod';
import { api,body } from '@/lib/api';
import { saveSettings } from '@/lib/desk-service';
import { publishers } from '@/lib/publishers';
const schema=z.object({publishers:z.array(z.string().refine(id=>publishers.some(p=>p.id===id))).max(8)});
export const PUT=api(async(userId,request)=>{const input=schema.parse(await body(request));await saveSettings(userId,[...new Set(input.publishers)]);return {ok:true};});
