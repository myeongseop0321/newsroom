import { api } from '@/lib/api';
import { desk } from '@/lib/desk-service';
export const dynamic='force-dynamic';
export const GET=api(userId=>desk(userId));
