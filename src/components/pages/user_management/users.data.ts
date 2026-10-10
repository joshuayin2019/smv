// Static sample data shaped like your tables.
// Region / province / municipality codes are sample PSGC-style strings, replace with your real codes.
//
// NOTE: password_hash and token are intentionally NOT part of these types.
// Never return them from your API to the frontend; select only the columns the UI needs.

export type UserStatus = 'active' | 'inactive';

export type ScopeLevel = 'region' | 'province' | 'municipality' | 'barangay';

// data.scope (many scopes per user, linked by username)
export type Scope = {
  scope_id: number;
  username: string;
  scope_level: ScopeLevel;
  reg_code: string | null;
  pro_code: string | null;
  mun_code: string | null;
  bgy_code: string | null;
  // Assumed to be on/off access flags. Change the type if your columns store something else.
  poi: boolean;
  zonalvalue: boolean;
  psa: boolean;
  created_at: string;
  updated_at: string;
};

// data.users
export type User = {
  user_id: number;
  username: string;
  email: string;
  full_name: string;
  phone_number: string;
  address: string;
  role: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  scopes: Scope[]; // joined from data.scope
};

// ---------- Sample location codes ----------
export const REGIONS = [
  { code: '0300000000', name: 'Region III (Central Luzon)' },
  { code: '0400000000', name: 'Region IV-A (CALABARZON)' },
  { code: '1300000000', name: 'National Capital Region' },
];

export const PROVINCES = [
  { code: '0314000000', name: 'Bulacan', reg_code: '0300000000' },
  { code: '0354000000', name: 'Pampanga', reg_code: '0300000000' },
  { code: '0434000000', name: 'Laguna', reg_code: '0400000000' },
  { code: '1339000000', name: 'NCR, First District', reg_code: '1300000000' },
];

export const MUNICIPALITIES = [
  { code: '0314100000', name: 'Malolos City', pro_code: '0314000000' },
  { code: '0314040000', name: 'Bocaue', pro_code: '0314000000' },
  { code: '0354160000', name: 'City of San Fernando', pro_code: '0354000000' },
  { code: '0354010000', name: 'Angeles City', pro_code: '0354000000' },
  { code: '0434040000', name: 'Calamba City', pro_code: '0434000000' },
  { code: '0434250000', name: 'Santa Rosa City', pro_code: '0434000000' },
  { code: '1339010000', name: 'City of Manila', pro_code: '1339000000' },
];

// ---------- Helper to build scopes ----------
let scopeCounter = 0;
const scope = (
  username: string,
  scope_level: ScopeLevel,
  codes: Partial<Pick<Scope, 'reg_code' | 'pro_code' | 'mun_code' | 'bgy_code'>>,
  flags: Pick<Scope, 'poi' | 'zonalvalue' | 'psa'>,
): Scope => ({
  scope_id: ++scopeCounter,
  username,
  scope_level,
  reg_code: codes.reg_code ?? null,
  pro_code: codes.pro_code ?? null,
  mun_code: codes.mun_code ?? null,
  bgy_code: codes.bgy_code ?? null,
  ...flags,
  created_at: '2026-09-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
});

const ALL = { poi: true, zonalvalue: true, psa: true };
const POI_ONLY = { poi: true, zonalvalue: false, psa: false };
const ZV_PSA = { poi: false, zonalvalue: true, psa: true };

// ---------- Users ----------
export const USERS: User[] = [
  {
    user_id: 1,
    username: 'rebecca',
    email: 'rebecca.fox@example.com',
    full_name: 'Rebecca Fox',
    phone_number: '+63 917 100 0001',
    address: 'Makati City, Metro Manila',
    role: 'CEO',
    status: 'active',
    created_at: '2026-01-10T09:00:00Z',
    updated_at: '2026-10-01T09:00:00Z',
    scopes: [
      scope('rebecca', 'region', { reg_code: '0300000000' }, ALL),
      scope('rebecca', 'region', { reg_code: '0400000000' }, ALL),
      scope('rebecca', 'region', { reg_code: '1300000000' }, ALL),
    ],
  },
  {
    user_id: 2,
    username: 'stanis',
    email: 'stanis.ryle@example.com',
    full_name: 'Stanis Ryle',
    phone_number: '+63 917 100 0002',
    address: 'Quezon City, Metro Manila',
    role: 'HR Manager',
    status: 'active',
    created_at: '2026-01-12T09:00:00Z',
    updated_at: '2026-09-20T09:00:00Z',
    scopes: [scope('stanis', 'region', { reg_code: '1300000000' }, POI_ONLY)],
  },
  {
    user_id: 3,
    username: 'brian',
    email: 'brian.lord@example.com',
    full_name: 'Brian Lord',
    phone_number: '+63 917 100 0003',
    address: 'Pasig City, Metro Manila',
    role: 'Finance Manager',
    status: 'active',
    created_at: '2026-01-15T09:00:00Z',
    updated_at: '2026-09-18T09:00:00Z',
    scopes: [
      scope('brian', 'province', { reg_code: '0300000000', pro_code: '0314000000' }, ZV_PSA),
      scope('brian', 'province', { reg_code: '0300000000', pro_code: '0354000000' }, ZV_PSA),
    ],
  },
  {
    user_id: 4,
    username: 'diane',
    email: 'diane.hall@example.com',
    full_name: 'Diane Hall',
    phone_number: '+63 917 100 0004',
    address: 'Taguig City, Metro Manila',
    role: 'Social Media Manager',
    status: 'inactive',
    created_at: '2026-02-01T09:00:00Z',
    updated_at: '2026-08-30T09:00:00Z',
    scopes: [scope('diane', 'region', { reg_code: '1300000000' }, POI_ONLY)],
  },
  {
    user_id: 5,
    username: 'marie',
    email: 'marie.goodwin@example.com',
    full_name: 'Marie Goodwin',
    phone_number: '+63 917 100 0005',
    address: 'Malolos, Bulacan',
    role: 'Accountant',
    status: 'active',
    created_at: '2026-02-05T09:00:00Z',
    updated_at: '2026-09-25T09:00:00Z',
    scopes: [
      scope('marie', 'municipality', { reg_code: '0300000000', pro_code: '0314000000', mun_code: '0314100000' }, ZV_PSA),
      scope('marie', 'municipality', { reg_code: '0300000000', pro_code: '0314000000', mun_code: '0314040000' }, ZV_PSA),
    ],
  },
  {
    user_id: 6,
    username: 'taylor',
    email: 'taylor.hardy@example.com',
    full_name: 'Taylor Hardy',
    phone_number: '+63 917 100 0006',
    address: 'Angeles City, Pampanga',
    role: 'Marketing Manager',
    status: 'active',
    created_at: '2026-02-10T09:00:00Z',
    updated_at: '2026-10-02T09:00:00Z',
    scopes: [scope('taylor', 'province', { reg_code: '0300000000', pro_code: '0354000000' }, ALL)],
  },
  {
    user_id: 7,
    username: 'sofia',
    email: 'sofia.reynolds@example.com',
    full_name: 'Sofia Reynolds',
    phone_number: '+63 917 100 0007',
    address: 'Santa Rosa, Laguna',
    role: 'Community Officer',
    status: 'active',
    created_at: '2026-03-01T09:00:00Z',
    updated_at: '2026-09-29T09:00:00Z',
    scopes: [
      scope('sofia', 'municipality', { reg_code: '0400000000', pro_code: '0434000000', mun_code: '0434250000' }, POI_ONLY),
      scope('sofia', 'municipality', { reg_code: '0400000000', pro_code: '0434000000', mun_code: '0434040000' }, POI_ONLY),
    ],
  },
  {
    user_id: 8,
    username: 'gabriel',
    email: 'gabriel.allen@example.com',
    full_name: 'Gabriel Allen',
    phone_number: '+63 917 100 0008',
    address: 'Calamba, Laguna',
    role: 'Support',
    status: 'inactive',
    created_at: '2026-03-12T09:00:00Z',
    updated_at: '2026-07-15T09:00:00Z',
    scopes: [
      scope('gabriel', 'barangay', {
        reg_code: '0400000000',
        pro_code: '0434000000',
        mun_code: '0434040000',
        bgy_code: '0434040001',
      }, POI_ONLY),
    ],
  },
  {
    user_id: 9,
    username: 'benjamin',
    email: 'benjamin.hunter@example.com',
    full_name: 'Benjamin Hunter',
    phone_number: '+63 917 100 0009',
    address: 'City of San Fernando, Pampanga',
    role: 'Research Analyst',
    status: 'active',
    created_at: '2026-04-02T09:00:00Z',
    updated_at: '2026-10-05T09:00:00Z',
    scopes: [
      scope('benjamin', 'municipality', { reg_code: '0300000000', pro_code: '0354000000', mun_code: '0354160000' }, ZV_PSA),
      scope('benjamin', 'municipality', { reg_code: '0300000000', pro_code: '0354000000', mun_code: '0354010000' }, ZV_PSA),
      scope('benjamin', 'municipality', { reg_code: '0300000000', pro_code: '0314000000', mun_code: '0314100000' }, ZV_PSA),
    ],
  },
  {
    user_id: 10,
    username: 'edward',
    email: 'edward.crawford@example.com',
    full_name: 'Edward Crawford',
    phone_number: '+63 917 100 0010',
    address: 'Manila',
    role: 'Business Consultant',
    status: 'active',
    created_at: '2026-04-20T09:00:00Z',
    updated_at: '2026-10-07T09:00:00Z',
    scopes: [scope('edward', 'province', { reg_code: '1300000000', pro_code: '1339000000' }, ALL)],
  },
  {
    user_id: 11,
    username: 'amber',
    email: 'amber.foster@example.com',
    full_name: 'Amber Foster',
    phone_number: '+63 917 100 0011',
    address: 'Bocaue, Bulacan',
    role: 'Support',
    status: 'inactive',
    created_at: '2026-05-08T09:00:00Z',
    updated_at: '2026-08-01T09:00:00Z',
    scopes: [
      scope('amber', 'municipality', { reg_code: '0300000000', pro_code: '0314000000', mun_code: '0314040000' }, POI_ONLY),
    ],
  },
];

// ---------- Filters ----------
// Every filter is a list (multi-select). An empty list means "no filter on this field".
export type UserFilters = {
  reg_code: string[];
  pro_code: string[];
  mun_code: string[];
  status: UserStatus[];
};

export const EMPTY_FILTERS: UserFilters = {
  reg_code: [],
  pro_code: [],
  mun_code: [],
  status: [],
};

// Rules:
// - Values inside one filter are OR   (region A or region B)
// - Different filters are AND         (region A AND status active)
// - Location filters are checked against a single scope: a user matches when at least
//   one of their scopes satisfies every location filter that is set.
export function filterUsers(users: User[], filters: UserFilters): User[] {
  const { reg_code, pro_code, mun_code, status } = filters;
  const hasLocationFilter = reg_code.length > 0 || pro_code.length > 0 || mun_code.length > 0;

  return users.filter((user) => {
    if (status.length > 0 && !status.includes(user.status)) return false;
    if (!hasLocationFilter) return true;

    return user.scopes.some(
      (s) =>
        (reg_code.length === 0 || (s.reg_code !== null && reg_code.includes(s.reg_code))) &&
        (pro_code.length === 0 || (s.pro_code !== null && pro_code.includes(s.pro_code))) &&
        (mun_code.length === 0 || (s.mun_code !== null && mun_code.includes(s.mun_code))),
    );
  });
}

// ---------- Global search ----------
const REGION_NAME = new Map<string, string>(REGIONS.map((r) => [r.code, r.name]));
const PROVINCE_NAME = new Map<string, string>(PROVINCES.map((p) => [p.code, p.name]));
const MUNICIPALITY_NAME = new Map<string, string>(MUNICIPALITIES.map((m) => [m.code, m.name]));

// Everything a person might type to find a user: profile fields + the names and codes of their scopes.
function buildSearchText(user: User): string {
  const scopeText = user.scopes.flatMap((s) => [
    s.scope_level,
    s.reg_code ?? '',
    s.reg_code ? REGION_NAME.get(s.reg_code) ?? '' : '',
    s.pro_code ?? '',
    s.pro_code ? PROVINCE_NAME.get(s.pro_code) ?? '' : '',
    s.mun_code ?? '',
    s.mun_code ? MUNICIPALITY_NAME.get(s.mun_code) ?? '' : '',
    s.bgy_code ?? '',
  ]);

  return [
    user.full_name,
    user.username,
    user.email,
    user.phone_number,
    user.address,
    user.role,
    user.status,
    ...scopeText,
  ]
    .join(' ')
    .toLowerCase();
}

// Every word you type must appear somewhere in the user's searchable text (AND),
// so "support laguna" finds support users with a Laguna scope.
export function searchUsers(users: User[], query: string): User[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return users;

  return users.filter((user) => {
    const text = buildSearchText(user);
    return tokens.every((token) => text.includes(token));
  });
}
