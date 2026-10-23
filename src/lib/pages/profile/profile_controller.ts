import { conn } from '@/lib/db';
import type { Auth } from '@/stores/global_stores';
import type { ProfileData, ProfileInput, ProfileScope, ProfileUser } from './profile_types';

// Keep session secrets and password hashes out of all profile responses.
const USER_COLUMNS = 'user_id, username, email, full_name, phone_number, address, role, status, created_at, updated_at';

export async function loadProfile(auth: Auth): Promise<ProfileData | null> {
  // The environment administrator has no row in data.users.
  if (auth.user_id === 0 && auth.role === 'admin') {
    return {
      user: { user_id: 0, username: auth.username, email: auth.email, full_name: auth.fullname,
        phone_number: null, address: null, role: auth.role, status: 'active', created_at: null, updated_at: null },
      scopes: [{ scope_id: 0, scope_level: 1, reg_code: null, pro_code: null, mun_code: null,
        bgy_code: null, poi: true, smv: true, psa: true }],
      managedExternally: true,
    };
  }
  const user = await conn.query<ProfileUser>(`SELECT ${USER_COLUMNS} FROM data.users WHERE user_id = $1`, [auth.user_id]);
  if (!user.rows[0]) return null;
  const scopes = await conn.query<ProfileScope>(
    `SELECT scope_id, scope_level, reg_code, pro_code, mun_code, bgy_code, poi, smv, psa
       FROM data.scope WHERE user_id = $1 ORDER BY scope_level, reg_code, pro_code, mun_code, bgy_code, scope_id`,
    [auth.user_id],
  );
  return { user: user.rows[0], scopes: scopes.rows, managedExternally: false };
}

export async function saveProfile(userId: number, input: ProfileInput): Promise<ProfileUser | null> {
  const result = await conn.query<ProfileUser>(
    `UPDATE data.users SET full_name = $2, email = $3, phone_number = $4, address = $5, updated_at = NOW()
      WHERE user_id = $1 AND status = 'active' RETURNING ${USER_COLUMNS}`,
    [userId, input.full_name, input.email, input.phone_number || null, input.address || null],
  );
  return result.rows[0] ?? null;
}
