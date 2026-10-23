import bcrypt from 'bcryptjs';
import { conn } from '@/lib/db';
import type { PasswordInput } from './profile_types';

export async function changePassword(userId: number, input: PasswordInput): Promise<boolean> {
  const result = await conn.query<{ password_hash: string }>(
    "SELECT password_hash FROM data.users WHERE user_id = $1 AND status = 'active'", [userId],
  );
  const previousHash = result.rows[0]?.password_hash;
  if (!previousHash || !await bcrypt.compare(input.current_password, previousHash)) return false;
  const hash = await bcrypt.hash(input.new_password, 12);
  const updated = await conn.query(
    `UPDATE data.users SET password_hash = $2, token = NULL, updated_at = NOW()
       WHERE user_id = $1 AND password_hash = $3 AND status = 'active' RETURNING user_id`,
    [userId, hash, previousHash],
  );
  // The comparison in the UPDATE prevents concurrent requests from overwriting a newer password.
  return updated.rows.length === 1;
}
