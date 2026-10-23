import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/auth-service';
import { changePassword } from '@/lib/pages/profile/password_controller';
import { validatePassword } from '@/lib/pages/profile/profile_types';

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export async function POST(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Invalid request origin.' }, 403);
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token')?.value;
    const auth = token ? await verifySession(token) : null;
    if (!auth) return json({ error: 'Please sign in to change your password.' }, 401);
    if (auth.user_id === 0 && auth.role === 'admin') {
      return json({ error: 'This administrator password is managed through server configuration.' }, 403);
    }
    let input;
    try { input = validatePassword(await request.json()); }
    catch (error) { return json({ error: error instanceof Error ? error.message : 'Invalid password details.' }, 400); }
    if (!await changePassword(auth.user_id, input)) {
      return json({ error: 'The current password is incorrect or the account has changed. Please try again.' }, 400);
    }
    cookieStore.delete('token');
    return json({ message: 'Password updated. Please sign in with your new password.' });
  } catch {
    // Do not log password payloads or database parameters.
    return json({ error: 'Unable to change your password. Please try again.' }, 500);
  }
}
