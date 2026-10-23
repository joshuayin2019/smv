'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Avatar, Badge, Box, Button, Divider, Grid, Group, Loader, Paper,
  ScrollArea, SimpleGrid, Stack, Text, Textarea, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { IconCheck, IconMail, IconMapPin, IconRefresh, IconShieldCheck, IconUser } from '@tabler/icons-react';
import { basePath } from '@/lib/config';
import { BORDER, NAVY, NAVY_DEEP, PANEL_BG } from '@/lib/theme_colors';
import { validateProfile, type ProfileData, type ProfileInput, type ProfileScope, type ProfileUser } from '@/lib/pages/profile/profile_types';
import { useGlobalStore } from '@/stores/global_stores';
import { cleanPhone, toLocalDigits } from '@/components/pages/user_management/form_utils';
import ProfilePassword from './profile_password';

const ENDPOINT = `${basePath}/api/pages/profile`;
const LEVELS: Record<number, string> = { 1: 'National', 2: 'Region', 3: 'Province', 4: 'City / Municipality', 5: 'Barangay' };
const fields = (user: ProfileUser): ProfileInput => ({
  full_name: user.full_name ?? '', email: user.email ?? '',
  phone_number: user.phone_number ?? '', address: user.address ?? '',
});
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-PH', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila',
}) : 'Not available';

function ScopeCard({ scope }: { scope: ProfileScope }) {
  return (
    <Paper withBorder radius="md" p="md" style={{ borderColor: BORDER }}>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Text fw={600} size="sm" c={NAVY}>{LEVELS[scope.scope_level] ?? `Scope level ${scope.scope_level}`}</Text>
        <Group gap={5}>
          {scope.smv && <Badge size="xs" variant="light" color="blue">Market value</Badge>}
          {scope.poi && <Badge size="xs" variant="light" color="teal">POI</Badge>}
          {scope.psa && <Badge size="xs" variant="light" color="violet">Demographics</Badge>}
          {!scope.smv && !scope.poi && !scope.psa && <Badge size="xs" color="gray">No modules</Badge>}
        </Group>
      </Group>
      {scope.scope_level === 1 ? <Text size="sm" c="dimmed">Nationwide coverage</Text> : (
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
          {([
            ['Region code', scope.reg_code], ['Province code', scope.pro_code],
            ['City / Municipality code', scope.mun_code], ['Barangay code', scope.bgy_code],
          ] as const).filter(([, value]) => value).map(([label, value]) => (
            <Box key={label}>
              <Text size="xs" c="dimmed">{label}</Text>
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{value}</Text>
            </Box>
          ))}
        </SimpleGrid>
      )}
    </Paper>
  );
}

function ProfileContent({ data, onSaved }: { data: ProfileData; onSaved: (user: ProfileUser) => void }) {
  const [form, setForm] = useState(() => fields(data.user));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const original = fields(data.user);
  const dirty = (Object.keys(form) as (keyof ProfileInput)[]).some((key) => form[key] !== original[key]);
  const update = (key: keyof ProfileInput, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
    setError('');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setSaved(false);
    let input: ProfileInput;
    try { input = validateProfile(form); }
    catch (err) { setError(err instanceof Error ? err.message : 'Check your details.'); return; }
    setSaving(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Unable to save your profile.');
      const user = result.user as ProfileUser;
      setForm(fields(user)); onSaved(user); setSaved(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save your profile.'); }
    finally { setSaving(false); }
  };
  const initials = (data.user.full_name || data.user.username).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <Stack gap="lg">
      <Paper radius="lg" p="xl" style={{ background: `linear-gradient(120deg, ${NAVY_DEEP}, #214c92)`, color: 'white' }}>
        <Group gap="lg" wrap="wrap">
          <Avatar size={76} radius="xl" color="blue" variant="light" style={{ background: '#e5f0ff', color: NAVY }}>{initials}</Avatar>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Text size="xs" tt="uppercase" fw={600} c="#b8d5ff" mb={5}>My account</Text>
            <Title order={2} style={{ overflowWrap: 'anywhere' }}>{data.user.full_name || data.user.username}</Title>
            <Text size="sm" c="#d6e3ff" mt={4} style={{ overflowWrap: 'anywhere' }}>@{data.user.username} · {data.user.email}</Text>
          </Box>
          <Group gap="xs">
            <Badge variant="white" color="blue">{data.user.role}</Badge>
            <Badge color={data.user.status === 'active' ? 'teal' : 'gray'}>{data.user.status}</Badge>
          </Group>
        </Group>
      </Paper>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 7 }} style={{ minWidth: 0 }}>
          <Paper withBorder radius="lg" p="lg" style={{ borderColor: BORDER }}>
            <Group mb="lg" gap="sm">
              <ThemeIcon variant="light" size="lg" radius="md"><IconUser size={20} /></ThemeIcon>
              <Box><Title order={4} c={NAVY}>Personal information</Title><Text size="xs" c="dimmed">Keep your contact details up to date.</Text></Box>
            </Group>
            {data.managedExternally && <Alert color="blue" mb="md">This administrator account is managed through server configuration.</Alert>}
            <form onSubmit={submit}>
              <Stack gap="md">
                <TextInput label="Username" value={data.user.username} readOnly description="Your sign-in username" />
                <TextInput label="Full name" required maxLength={150} value={form.full_name} onChange={(event) => update('full_name', event.currentTarget.value)} disabled={saving || data.managedExternally} leftSection={<IconUser size={16} />} autoComplete="name" />
                <TextInput label="Email address" type="email" required maxLength={254} value={form.email} onChange={(event) => update('email', event.currentTarget.value)} disabled={saving || data.managedExternally} leftSection={<IconMail size={16} />} autoComplete="email" />
                <TextInput
                  label="Phone number" type="tel" inputMode="numeric" pattern="[0-9]{9}"
                  placeholder="171234567" description="Enter 9 digits after +639. Letters and symbols are removed."
                  value={toLocalDigits(form.phone_number)}
                  onChange={(event) => {
                    const digits = cleanPhone(event.currentTarget.value);
                    update('phone_number', digits ? `+639${digits}` : '');
                  }}
                  disabled={saving || data.managedExternally}
                  leftSection={<Text size="sm">+639</Text>} leftSectionWidth={58} autoComplete="tel-national"
                />
                <Textarea label="Address" autosize minRows={3} maxLength={500} value={form.address} onChange={(event) => update('address', event.currentTarget.value)} disabled={saving || data.managedExternally} autoComplete="street-address" />
                {error && <Alert color="red" role="alert">{error}</Alert>}
                {saved && <Alert color="teal" icon={<IconCheck size={18} />} role="status">Your profile has been updated.</Alert>}
                {!data.managedExternally && <Group justify="flex-end">
                  <Button variant="default" disabled={!dirty || saving} onClick={() => { setForm(fields(data.user)); setError(''); setSaved(false); }}>Reset</Button>
                  <Button type="submit" color={NAVY} loading={saving} disabled={!dirty}>Save changes</Button>
                </Group>}
              </Stack>
            </form>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }} style={{ minWidth: 0 }}>
          <Stack gap="lg">
            {!data.managedExternally && <ProfilePassword />}
            <Paper withBorder radius="lg" p="lg" style={{ borderColor: BORDER }}>
              <Group gap="sm" mb="md"><ThemeIcon color="teal" variant="light" radius="md" size="lg"><IconShieldCheck size={20} /></ThemeIcon><Title order={4} c={NAVY}>Account details</Title></Group>
              <Stack gap="sm">
                <Group justify="space-between"><Text size="sm" c="dimmed">Role</Text><Text size="sm" fw={600}>{data.user.role}</Text></Group>
                <Divider />
                <Group justify="space-between"><Text size="sm" c="dimmed">Member since</Text><Text size="sm">{date(data.user.created_at)}</Text></Group>
                <Group justify="space-between"><Text size="sm" c="dimmed">Last updated</Text><Text size="sm">{date(data.user.updated_at)}</Text></Group>
              </Stack>
            </Paper>
            <Paper withBorder radius="lg" p="lg" style={{ borderColor: BORDER }}>
              <Group gap="sm" mb="xs"><ThemeIcon variant="light" radius="md" size="lg"><IconMapPin size={20} /></ThemeIcon><Title order={4} c={NAVY}>Assigned scopes</Title><Badge variant="light">{data.scopes.length}</Badge></Group>
              <Text size="xs" c="dimmed" mb="md">Geographic coverage and enabled modules assigned by your administrator.</Text>
              <Stack gap="sm">
                {data.scopes.map((scope) => <ScopeCard key={scope.scope_id} scope={scope} />)}
                {!data.scopes.length && <Text size="sm" c="dimmed">No scopes assigned. Contact your administrator for access.</Text>}
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

export default function ProfileMain() {
  const userId = useGlobalStore((state) => state.auth?.user_id);
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    fetch(ENDPOINT, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Unable to load your profile.');
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message ?? 'Unable to load your profile.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, reload]);

  const onSaved = (user: ProfileUser) => {
    setData((previous) => previous ? { ...previous, user } : previous);
    const auth = useGlobalStore.getState().auth;
    if (auth?.user_id === user.user_id) useGlobalStore.getState().setAuth({ ...auth, fullname: user.full_name, email: user.email });
  };
  return (
    <ScrollArea h="100%" type="auto" style={{ background: PANEL_BG, borderRadius: 12 }}>
      <Box p={{ base: 'sm', sm: 'xl' }} maw={1250} mx="auto" style={{ minWidth: 0 }}>
        {loading ? <Group justify="center" py="xl"><Loader size="sm" /><Text size="sm">Loading your profile…</Text></Group> : error ? (
          <Alert color="red" title="Could not load profile"><Text size="sm">{error}</Text><Button mt="sm" size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={() => setReload((value) => value + 1)}>Try again</Button></Alert>
        ) : data && <ProfileContent key={data.user.user_id} data={data} onSaved={onSaved} />}
      </Box>
    </ScrollArea>
  );
}
