import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/auth-service';
import { loadProfile, saveProfile } from '@/lib/pages/profile/profile_controller';
import { validateProfile, type ProfileInput } from '@/lib/pages/profile/profile_types';

async function currentUser() {
  const token = (await cookies()).get('token')?.value;
  return token ? verifySession(token) : null;
}

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export async function GET() {
  try {
    const auth = await currentUser();
    if (!auth) return json({ error: 'Please sign in to view your profile.' }, 401);
    const profile = await loadProfile(auth);
    return profile ? json(profile) : json({ error: 'Profile not found.' }, 404);
  } catch (error) {
    console.error('Profile load failed:', error);
    return json({ error: 'Unable to load your profile. Please try again.' }, 500);
  }
}

export async function PATCH(request: Request) {
  // Reject cross-origin browser writes; the session cookie identifies the account.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'Invalid request origin.' }, 403);
  try {
    const auth = await currentUser();
    if (!auth) return json({ error: 'Please sign in to update your profile.' }, 401);
    if (auth.user_id === 0 && auth.role === 'admin') {
      return json({ error: 'This administrator account is managed through server configuration.' }, 403);
    }
    let input: ProfileInput;
    try {
      input = validateProfile(await request.json());
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Invalid profile details.' }, 400);
    }
    const user = await saveProfile(auth.user_id, input);
    return user ? json({ user }) : json({ error: 'Profile is unavailable.' }, 404);
  } catch (error) {
    if ((error as { code?: string })?.code === '23505') return json({ error: 'That email address is already in use.' }, 409);
    console.error('Profile update failed:', error);
    return json({ error: 'Unable to save your profile. Please try again.' }, 500);
  }
}
