import { api } from '@/lib/api';
import { followup } from '@/lib/desk-service';
export const dynamic='force-dynamic';
export const GET=api((_userId,request)=>followup(Number(new URL(request.url).searchParams.get('days')||90)));
