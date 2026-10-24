import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth/auth-service';

export async function parcelSession() {
  const token = (await cookies()).get('token')?.value;
  return token ? verifySession(token) : null;
}
