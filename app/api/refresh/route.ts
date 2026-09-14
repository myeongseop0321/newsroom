import { api } from '@/lib/api';
import { refresh } from '@/lib/desk-service';
export const POST=api(userId=>refresh(userId));
