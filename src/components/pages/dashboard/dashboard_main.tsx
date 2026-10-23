import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Paper, Progress, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { DonutChart } from '@mantine/charts';
import { IconArrowUpRight, IconBuildingCommunity, IconMapPin, IconRefresh, IconRoute, IconUsers } from '@tabler/icons-react';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config';
import { BORDER, NAVY, NAVY_DEEP } from '@/lib/theme_colors';
import { SAMPLE_PARCELS, type DashboardData, type DashboardItem } from '@/lib/pages/dashboard/dashboard_types';

const full = (n: number) => n.toLocaleString('en-PH');
const compact = (n: number) => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const peso = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n);
const PARCEL_TOTAL = SAMPLE_PARCELS.reduce((sum, item) => sum + item.value, 0);

function Card({ title, eyebrow, action, children }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode }) {
  return <Paper withBorder radius="lg" p="lg" h="100%" style={{ borderColor: BORDER, background: '#fff' }}>
    <Group justify="space-between" align="flex-start" mb="lg" wrap="nowrap">
      <div>{eyebrow && <Text fz={10} fw={700} c="#71809a" tt="uppercase" style={{ letterSpacing: 1.4 }} mb={5}>{eyebrow}</Text>}<Title order={4} fz={17} c={NAVY_DEEP}>{title}</Title></div>
      {action}
    </Group>{children}
  </Paper>;
}

function Ranking({ data, currency = false }: { data: DashboardItem[]; currency?: boolean }) {
  const max = Math.max(...data.map(item => item.value), 1);
  if (!data.length) return <Text size="sm" c="dimmed" py="xl">No records in your assigned scope.</Text>;
  return <Stack gap="md">{data.map((item, index) => <div key={item.name}>
    <Group justify="space-between" gap="xs" mb={6} wrap="nowrap"><Text size="xs" c="#45536e" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.name}</Text>
      <Text size="sm" fw={700} c={NAVY_DEEP} style={{ flexShrink: 0 }}>{currency ? peso(item.value) : full(item.value)}</Text></Group>
    <Progress value={item.value / max * 100} color={item.color ?? (index === 0 ? '#2458bd' : '#9aade0')} size={7} radius="xl" />
  </div>)}</Stack>;
}

function Distribution({ data, totalLabel }: { data: DashboardItem[]; totalLabel: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <Text size="sm" c="dimmed" py="xl">No reported counts in your scope.</Text>;
  return <Group justify="center" align="center" gap="xl" wrap="wrap">
    <Box pos="relative" w={175} h={175}>
      <DonutChart h={175} w={175} size={175} thickness={25} data={data.filter(item => item.value > 0).map(item => ({ ...item, color: item.color ?? '#2458bd' }))} withTooltip strokeWidth={3} />
      <Stack gap={0} align="center" justify="center" style={{ position: 'absolute', inset: 42, pointerEvents: 'none' }}>
        <Text fz={25} fw={800} c={NAVY_DEEP}>{compact(total)}</Text><Text fz={10} c="dimmed">{totalLabel}</Text>
      </Stack>
    </Box>
    <Stack gap={10} style={{ flex: 1, minWidth: 180 }}>{data.map(item => <Group key={item.name} justify="space-between" wrap="nowrap" gap="xs">
      <Group gap={7} wrap="nowrap"><Box w={8} h={8} style={{ background: item.color ?? '#2458bd', borderRadius: 2, flexShrink: 0 }} /><Text size="xs">{item.name}</Text></Group>
      <Text size="xs" fw={700} style={{ flexShrink: 0 }}>{full(item.value)} <Text span fw={400} c="dimmed">· {(item.value / total * 100).toFixed(1)}%</Text></Text>
    </Group>)}</Stack>
  </Group>;
}

export default function DashboardMain() {
  const auth = useGlobalStore(s => s.auth);
  const setPage = useGlobalStore(s => s.setActivePage);
  const scopes = JSON.stringify({ smv: auth?.scope_smv ?? [], poi: auth?.scope_poi ?? [], psa: auth?.scope_psa ?? [] });
  const [response, setResponse] = useState<{ key: string; data: DashboardData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [demographicView, setDemographicView] = useState('buildings');
  const data = response?.key === scopes ? response.data : undefined;
  useEffect(() => {
    if (!auth) return;
    const ctrl = new AbortController();
    setLoading(true); setError('');
    fetch(`${basePath}/api/pages/dashboard?${new URLSearchParams({ scopes })}`, { signal: ctrl.signal })
      .then(async result => { if (!result.ok) throw new Error('Dashboard data could not be loaded. Please retry.'); return result.json() as Promise<DashboardData>; })
      .then(result => { if (!ctrl.signal.aborted) { setResponse({ key: scopes, data: result }); setLoading(false); } })
      .catch(e => { if (!ctrl.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => ctrl.abort();
  }, [scopes, refresh, !!auth]);
  const demographic = data?.demographic;
  const demographics = demographicView === 'years' ? demographic?.years : demographicView === 'floors' ? demographic?.floors : demographic?.buildings;
  const demographicPage = demographicView === 'years' ? 'Year Built of Buildings' : demographicView === 'floors' ? 'Number of Story of Building' : 'Type of Buildings';
  const sexTotal = (demographic?.male ?? 0) + (demographic?.female ?? 0);
  const link = (page: string) => <Button size="compact-xs" variant="subtle" color={NAVY} rightSection={<IconArrowUpRight size={13} />} onClick={() => setPage(page)}>Explore</Button>;
  const metric = (value: number | undefined, sample = false) => loading && !data && !sample ? <Skeleton h={34} w={110} my={4} /> : <Text fz={32} fw={800} lh={1.4} c={NAVY_DEEP}>{value === undefined ? '—' : full(value)}</Text>;
  const unavailable = <Text size="sm" c="dimmed">Data unavailable. Refresh to retry.</Text>;
  const cards = [
    { title: 'Market value records', value: data?.market?.roads, note: 'Road records in the SMV inventory', icon: IconRoute, color: '#2458bd', page: 'Schedule of Market Value' },
    { title: 'Points of interest', value: data?.poi?.total, note: 'Mapped places in your POI scope', icon: IconMapPin, color: '#0b927c', page: 'Point of Interest' },
    { title: 'Population', value: demographic?.population, note: 'People · PSA 2020', icon: IconUsers, color: '#8a53c4', page: 'Population' },
    { title: 'Parcels', value: PARCEL_TOTAL, note: 'Illustrative inventory · not connected', icon: IconBuildingCommunity, color: '#ce8515', sample: true },
  ];
  return <Box h="calc(100dvh - 74px)" style={{ overflowY: 'auto', background: '#f4f6fb', borderRadius: 12 }}>
    <Stack gap="lg" p={{ base: 'sm', md: 'lg' }} maw={1600} mx="auto">
      <Paper radius="lg" p={{ base: 'lg', md: 28 }} style={{ background: `linear-gradient(115deg, ${NAVY_DEEP}, #163c88)`, color: '#fff' }}>
        <Group justify="space-between" align="flex-start" gap="lg">
          <div><Text fz={10} fw={700} c="#b4caf1" mb={8} style={{ letterSpacing: 2 }}>SMV · AREA OVERVIEW</Text>
            <Title order={2} fz={{ base: 25, md: 31 }} fw={750} mb={8}>Your area, at a glance.</Title>
            <Text size="sm" c="#cedbf1" maw={600}>Market values, places and communities in one view. Database figures follow your assigned geographic scopes.</Text>
          </div>
          <Stack gap={8} align="flex-end"><Button size="xs" variant="white" color={NAVY} leftSection={loading ? <Loader size={13} /> : <IconRefresh size={14} />} disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh overview</Button>
            <Text fz={10} c="#b4caf1">{data ? `Updated ${new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PHT` : 'Loading scoped summaries'}</Text>
          </Stack>
        </Group>
      </Paper>

      {(error || !!data?.errors.length) && <Alert color="orange" title="Some data could not be refreshed">{error || data?.errors.join('. ')}{data && error ? ' Showing your last loaded figures.' : ''}</Alert>}

      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="md">
        {cards.map(card => <Paper key={card.title} withBorder radius="lg" p="lg" style={{ borderColor: BORDER }}>
          <Group justify="space-between" mb="xs"><ThemeIcon size={36} radius="md" variant="light" color={card.color}><card.icon size={20} stroke={1.6} /></ThemeIcon>
            {card.sample ? <Badge size="xs" color="orange" variant="light">Sample data</Badge> : <Badge size="xs" color="gray" variant="light">Database</Badge>}</Group>
          <Text size="xs" fw={600} c="#61708c">{card.title}</Text>{metric(card.value, card.sample)}
          <Group justify="space-between" align="center" gap={4}><Text fz={10} c="dimmed">{card.note}</Text>{card.page && <Button size="compact-xs" variant="subtle" px={3} aria-label={`Open ${card.title}`} onClick={() => setPage(card.page!)}><IconArrowUpRight size={16} /></Button>}</Group>
        </Paper>)}
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Card eyebrow="Valuation" title="Average market values" action={link('Schedule of Market Value')}>
          {data?.market ? <><Ranking data={data.market.averages} currency /><Text fz={10} c="dimmed" mt="lg">Unweighted average per road record, using stored zonal values. Zero values are excluded; units follow the source inventory.</Text>
            <Group gap={6} mt="sm">{data.market.years.slice(0, 5).map(year => <Badge key={year.name} variant="light" color="gray" size="sm">{year.name} · {full(year.value)} records</Badge>)}</Group></> : loading ? <Skeleton h={205} /> : unavailable}
        </Card>
        <Card eyebrow="Places" title="Top points of interest categories" action={link('Point of Interest')}>
          {data?.poi ? <><Ranking data={data.poi.categories} /><Text fz={10} c="dimmed" mt="lg">Top six categories by number of mapped places.</Text></> : loading ? <Skeleton h={205} /> : unavailable}
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Card eyebrow="Communities · PSA 2020" title="Population & barangay class" action={link('Population')}>
          {demographic ? <Stack gap="lg">
            <Group justify="space-between"><Text size="xs" c="dimmed">{full(demographic.municipalities)} municipalities</Text><Text size="xs" c="dimmed">{full(demographic.barangays)} barangays</Text></Group>
            <div><Group justify="space-between" mb={8}><Text size="xs" fw={600} c="#2458bd">Male · {full(demographic.male)}</Text><Text size="xs" fw={600} c="#ce8515">Female · {full(demographic.female)}</Text></Group>
              <Progress.Root size={10} radius="xl"><Progress.Section value={sexTotal ? demographic.male / sexTotal * 100 : 0} color="#2458bd" /><Progress.Section value={sexTotal ? demographic.female / sexTotal * 100 : 0} color="#f59e0b" /></Progress.Root>
              <Text fz={10} c="dimmed" mt={6}>Shares use the reported male and female counts.</Text>
            </div>
            <Ranking data={demographic.classes} /><Button size="compact-xs" variant="subtle" color={NAVY} onClick={() => setPage('Barangay Class')}>Explore barangay classifications →</Button>
          </Stack> : loading ? <Skeleton h={250} /> : unavailable}
        </Card>
        <Card eyebrow="Land inventory" title="Parcels by classification" action={<Badge color="orange" variant="light" size="sm">Sample data</Badge>}>
          <Distribution data={SAMPLE_PARCELS} totalLabel="sample parcels" />
          <Text fz={11} c="#8c6c2c" mt="lg">Illustrative figures only. Parcel records are not connected yet; these numbers do not reflect your geographic scope.</Text>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Card eyebrow="Buildings · PSA 2020" title="Building profile" action={link(demographicPage)}>
          <SegmentedControl size="xs" mb="lg" value={demographicView} onChange={setDemographicView} data={[{ value: 'buildings', label: 'Building type' }, { value: 'years', label: 'Year built' }, { value: 'floors', label: 'Floors' }]} />
          {demographic ? <Ranking data={demographics ?? []} /> : loading ? <Skeleton h={250} /> : unavailable}
          <Text fz={10} c="dimmed" mt="lg">Counts from the supplied PSA fields. Year-built categories include only the listed ranges; omitted years are not inferred.</Text>
        </Card>
        <Card eyebrow="Geographic coverage" title="Top areas by points of interest" action={link('Point of Interest')}>
          {data?.poi ? <Ranking data={data.poi.areas} /> : loading ? <Skeleton h={250} /> : unavailable}
          <Paper mt="xl" p="md" radius="md" bg="#f4f6fb"><Text size="xs" fw={700} c={NAVY_DEEP}>Read the data in context</Text>
            <Text size="xs" c="dimmed" mt={5}>SMV, POI and demographic scopes can differ. Building and population figures are based on PSA 2020, while market-value coverage follows the recorded SMV years.</Text></Paper>
        </Card>
      </SimpleGrid>
      <Text ta="center" fz={10} c="dimmed" pb="sm">Database summaries are cached for up to one minute. Parcel figures are illustrative.</Text>
    </Stack>
  </Box>;
}
