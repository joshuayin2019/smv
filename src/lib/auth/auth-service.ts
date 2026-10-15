import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { conn } from "@/lib/db";
import { Auth } from "@/stores/global_stores";

type LoginResult =
  | { success: true; token: string; user: Auth }
  | { success: false; message: string; status: number };

const ADMIN_SCOPE = [{ scope_level: 1, code: null }];

const scopeAgg = (flag: string, alias: string) => `
  COALESCE(
    json_agg(
      json_build_object(
        'scope_level', y.scope_level,
        'code', CASE y.scope_level
                  WHEN 2 THEN y.reg_code
                  WHEN 3 THEN y.pro_code
                  WHEN 4 THEN y.mun_code
                  ELSE NULL
                END
      )
    ) FILTER (WHERE y.${flag} = true),
    '[]'
  ) AS ${alias}`;

const USER_SQL = `
  SELECT x.*,
    ${scopeAgg("poi", "scope_poi")},
    ${scopeAgg("psa", "scope_psa")},
    ${scopeAgg("smv", "scope_smv")}
  FROM data.users x
  INNER JOIN data.scope y ON x.user_id = y.user_id
  WHERE x.username = $1
  GROUP BY x.id
`;

const adminUser = (username: string): Auth => ({
  user_id: 0,
  username,
  fullname: "Admin",
  email: process.env.ADMIN_EMAIL || "admin",
  role: "admin",
  scope_poi: ADMIN_SCOPE,
  scope_smv: ADMIN_SCOPE,
  scope_psa: ADMIN_SCOPE,
});

const toAuth = (row: any): Auth => ({
  user_id: row.user_id,
  username: row.username,
  fullname: row.full_name,
  email: row.email, 
  role: row.role,
  scope_poi: row.scope_poi,
  scope_smv: row.scope_smv,
  scope_psa: row.scope_psa,
});

const invalid = (): LoginResult => ({
  success: false,
  message: "Invalid username or password",
  status: 401,
});

export async function login(data: {
  username?: unknown;
  password?: unknown;
}): Promise<LoginResult> {
  const { username, password } = data;
  if (typeof username !== "string" || typeof password !== "string") {
    return invalid();
  }

  try {
    // Admin account from env
    if (username === process.env.admin_username) {
      const match = await bcrypt.compare(password, process.env.admin_password!);
      if (!match) return invalid();

      const token = jwt.sign({ username, role: "admin" }, process.env.JWT_SECRET!, {
        expiresIn: "1d",
      });
      return { success: true, token, user: adminUser(username) };
    }

    // Normal users from the database
    const res = await conn.query(USER_SQL, [username]);
    if (res.rows.length === 0) return invalid();

    const row = res.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return invalid();

    if (row.status !== "active") {
      return { success: false, message: "Your account is disabled", status: 403 };
    }

    // Per-user random secret, saved so the token can be verified and revoked
    const randomSecret = crypto.randomBytes(32).toString("hex");
    const token = jwt.sign({ username, role: row.role }, randomSecret, {
      expiresIn: "1d",
    });
    await conn.query("UPDATE data.users SET token = $2 WHERE user_id = $1", [
      row.user_id,
      randomSecret,
    ]);

    return { success: true, token, user: toAuth(row) };
  } catch (error) {
    console.warn("login error:", error);
    return { success: false, message: "Internal server error", status: 500 };
  }
}

// Used by check-auth: returns the user if the cookie token is valid
export async function verifySession(token: string): Promise<Auth | null> {
  try {
    const decoded = jwt.decode(token) as { username?: string } | null;
    if (!decoded?.username) return null;

    if (decoded.username === process.env.admin_username) {
      jwt.verify(token, process.env.JWT_SECRET!);
      return adminUser(decoded.username);
    }

    const res = await conn.query(USER_SQL, [decoded.username]);
    const row = res.rows[0];
    if (!row || row.status !== "active" || !row.token) return null;

    jwt.verify(token, row.token); // throws if invalid or expired
    return toAuth(row);
  } catch {
    return null;
  }
}

export async function revokeSession(token: string) {
  const decoded = jwt.decode(token) as { username?: string } | null;
  if (!decoded?.username || decoded.username === process.env.admin_username) return;
  await conn.query("UPDATE data.users SET token = NULL WHERE username = $1", [
    decoded.username,
  ]);
}