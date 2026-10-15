// users.utils.ts
// Replaces users.data.ts. No static data: types, API -> UI adapter, filter and search only.

export type UserStatus = 'active' | 'inactive';

export const SCOPE_TYPES = ['poi', 'psa', 'smv'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

// ASSUMPTION: confirm these level numbers against your database.
export const LEVEL_LABEL: Record<number, string> = {
  2: 'region',
  3: 'province',
  4: 'municipality',
  5: 'barangay',
};

type RawScope = { scope_level: number; code: string };

// Shape returned by /api/pages/users_management
export type ApiUser = {
  id: number;
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  phone_number: string;
  status: UserStatus;
  address: string;
  role?: string; // add to your SQL if you want it shown on the card
  scope_poi: RawScope[] | null;
  scope_psa: RawScope[] | null;
  scope_smv: RawScope[] | null;
};

// One flattened scope row used by the UI
export type Scope = {
  type: ScopeType;
  scope_level: number;
  code: string;
};

export type User = Omit<ApiUser, 'scope_poi' | 'scope_psa' | 'scope_smv'> & {
  scopes: Scope[];
};

export function normalizeUser(raw: ApiUser): User {
  const { scope_poi, scope_psa, scope_smv, ...rest } = raw;
  const byType: Record<ScopeType, RawScope[]> = {
    poi: scope_poi ?? [],
    psa: scope_psa ?? [],
    smv: scope_smv ?? [],
  };

  const scopes: Scope[] = SCOPE_TYPES.flatMap((type) =>
    byType[type].map((s) => ({ type, scope_level: s.scope_level, code: s.code })),
  );

  return { ...rest, scopes };
}

// ---------- Filters ----------
export type UserFilters = {
  status: UserStatus[];
};

export const EMPTY_FILTERS: UserFilters = {
  status: [],
};

// An empty status list means "no filter"; multiple values are OR.
export function filterUsers(users: User[], filters: UserFilters): User[] {
  const { status } = filters;
  if (status.length === 0) return users;
  return users.filter((user) => status.includes(user.status));
}

// ---------- Global search ----------
function buildSearchText(user: User): string {
  const scopeText = user.scopes.flatMap((s) => [s.type, LEVEL_LABEL[s.scope_level] ?? '', s.code]);

  return [
    user.full_name,
    user.username,
    user.email,
    user.phone_number,
    user.address,
    user.role ?? '',
    user.status,
    ...scopeText,
  ]
    .join(' ')
    .toLowerCase();
}

// Every word you type must appear somewhere in the user's searchable text (AND).
export function searchUsers(users: User[], query: string): User[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return users;

  return users.filter((user) => {
    const text = buildSearchText(user);
    return tokens.every((token) => text.includes(token));
  });
}