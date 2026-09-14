import { api,body } from '@/lib/api';
import { searchFollowup } from '@/lib/followup-search';
export const dynamic='force-dynamic';
export const POST=api(async(_userId,request)=>searchFollowup(await body(request)));
