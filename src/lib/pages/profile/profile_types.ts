export interface ProfileUser {
  user_id: number;
  username: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  address: string | null;
  role: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProfileScope {
  scope_id: number;
  scope_level: number;
  reg_code: string | null;
  pro_code: string | null;
  mun_code: string | null;
  bgy_code: string | null;
  poi: boolean;
  smv: boolean;
  psa: boolean;
  parcel: boolean;
}

export interface ProfileData {
  user: ProfileUser;
  scopes: ProfileScope[];
  managedExternally: boolean;
}

export interface ProfileInput {
  full_name: string;
  email: string;
  phone_number: string;
  address: string;
}

export interface PasswordInput {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

export function validatePassword(input: unknown): PasswordInput {
  if (!input || typeof input !== 'object') throw new Error('Please enter your password details.');
  const body = input as Record<string, unknown>;
  const { current_password, new_password, confirm_password } = body;
  if (typeof current_password !== 'string' || !current_password || current_password.length > 1024) {
    throw new Error('Enter your current password.');
  }
  if (typeof new_password !== 'string' || new_password.length < 8) {
    throw new Error('New password must contain at least 8 characters.');
  }
  // bcrypt accepts at most 72 bytes; do not silently truncate long passwords.
  if (new TextEncoder().encode(new_password).length > 72) throw new Error('New password must be at most 72 bytes.');
  if (new_password === current_password) throw new Error('Choose a password different from your current password.');
  if (confirm_password !== new_password) throw new Error('The new passwords do not match.');
  return { current_password, new_password, confirm_password };
}

export function validateProfile(input: unknown): ProfileInput {
  if (!input || typeof input !== 'object') throw new Error('Please provide your profile details.');
  const body = input as Record<string, unknown>;
  const field = (name: string, max: number) => {
    if (typeof body[name] !== 'string') throw new Error(`Invalid ${name.replaceAll('_', ' ')}.`);
    const value = body[name].trim();
    if (value.length > max) throw new Error(`${name.replaceAll('_', ' ')} is too long (maximum ${max} characters).`);
    return value;
  };
  const data = {
    full_name: field('full_name', 150),
    email: field('email', 254),
    phone_number: field('phone_number', 30),
    address: field('address', 500),
  };
  if (!data.full_name) throw new Error('Full name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Enter a valid email address.');
  if (data.phone_number && !/^\+639\d{9}$/.test(data.phone_number)) {
    throw new Error('Phone must be in +639XXXXXXXXX format.');
  }
  return data;
}
