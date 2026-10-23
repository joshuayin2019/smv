'use client';

import { useState } from 'react';
import { Alert, Button, Group, Paper, PasswordInput, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { basePath } from '@/lib/config';
import { BORDER, NAVY } from '@/lib/theme_colors';
import { validatePassword } from '@/lib/pages/profile/profile_types';
import { resetAllStores } from '@/stores/reset_stores';

export default function ProfilePassword() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const update = (key: keyof typeof form, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value })); setError('');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    let input;
    try { input = validatePassword(form); }
    catch (err) { setError(err instanceof Error ? err.message : 'Check your passwords.'); return; }
    setSaving(true);
    try {
      const response = await fetch(`${basePath}/api/pages/profile/password`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to change your password.');
      setForm({ current_password: '', new_password: '', confirm_password: '' }); setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to change your password.'); }
    finally { setSaving(false); }
  };
  return (
    <Paper withBorder radius="lg" p="lg" style={{ borderColor: BORDER }}>
      <Group gap="sm" mb="md"><ThemeIcon variant="light" radius="md" size="lg"><IconLock size={20} /></ThemeIcon><Title order={4} c={NAVY}>Change password</Title></Group>
      {success ? <Alert color="teal" role="status">
        Your password has been updated and your sessions have been signed out.
        <Button mt="sm" fullWidth color={NAVY} onClick={resetAllStores}>Sign in again</Button>
      </Alert> : <form onSubmit={submit}>
        <Stack gap="md">
          <Text size="xs" c="dimmed">Use at least 8 characters. Changing your password signs out all sessions.</Text>
          <PasswordInput label="Current password" autoComplete="current-password" required value={form.current_password} onChange={(event) => update('current_password', event.currentTarget.value)} disabled={saving} maxLength={1024} />
          <PasswordInput label="New password" autoComplete="new-password" required minLength={8} maxLength={72} value={form.new_password} onChange={(event) => update('new_password', event.currentTarget.value)} disabled={saving} />
          <PasswordInput label="Confirm new password" autoComplete="new-password" required minLength={8} maxLength={72} value={form.confirm_password} onChange={(event) => update('confirm_password', event.currentTarget.value)} disabled={saving} />
          {error && <Alert color="red" role="alert">{error}</Alert>}
          <Button color={NAVY} type="submit" loading={saving}>Update password</Button>
        </Stack>
      </form>}
    </Paper>
  );
}
