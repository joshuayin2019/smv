import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Alert, Badge, Box, Button, Grid, Group, Loader, Paper, Progress, RingProgress, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { BarChart, DonutChart } from '@mantine/charts';
import {
  IconArrowUpRight, IconBuilding, IconBuildingCommunity, IconBuildingSkyscraper, IconCalendarStats, IconCash, IconChartBar, IconHome2,
  IconMan, IconMapPin, IconMapPinFilled, IconRefresh, IconRoute, IconStairs, IconTrees, IconTrendingDown, IconTrendingUp, IconTrophy,
  IconUsers, IconWoman, IconCategory, IconMap2, IconMapSearch, IconBuildings, IconPlant2, IconBuildingStore, IconBuildingFactory2, IconDatabase, IconLayoutGrid, type Icon,
} from '@tabler/icons-react';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config';
import { BORDER, NAVY, NAVY_DEEP } from '@/lib/theme_colors';
import { SAMPLE_PARCELS, type DashboardData, type DashboardItem } from '@/lib/pages/dashboard/dashboard_types';
import styles from './dashboard_responsive.module.css';

const full = (n: number) => n.toLocaleString('en-PH');
const compact = (n: number) => new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const peso = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n);
const PARCEL_TOTAL = SAMPLE_PARCELS.reduce((sum, item) => sum + item.value, 0);
const DashboardMap = dynamic(() => import('./dashboard_map'), { ssr: false, loading: () => <Skeleton h={425} radius="md" /> });

/* ---------- shared building blocks ---------- */

function Card({ title, eyebrow, icon: HeaderIcon, iconColor = '#2458bd', action, children }: { title: string; eyebrow?: string; icon?: Icon; iconColor?: string; action?: ReactNode; children: ReactNode }) {
  return <Paper withBorder radius="lg" p={{ base: 'sm', md: 'lg' }} h="100%" style={{ minWidth: 0, borderColor: BORDER, background: '#fff', display: 'flex', flexDirection: 'column' }}>
    <Group justify="space-between" align="flex-start" mb="lg" gap="xs">
      <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: 0, flex: '1 1 160px' }}>
        {HeaderIcon && <ThemeIcon size={42} radius="md" variant="gradient" gradient={{ from: iconColor, to: NAVY_DEEP, deg: 135 }}><HeaderIcon size={22} stroke={1.7} /></ThemeIcon>}
        <div style={{ minWidth: 0 }}>{eyebrow && <Text fz={10} fw={700} c="#71809a" tt="uppercase" style={{ letterSpacing: 1.4 }} mb={3}>{eyebrow}</Text>}<Title order={4} fz={17} c={NAVY_DEEP} style={{ overflowWrap: 'anywhere' }}>{title}</Title></div>
      </Group>
      {action}
    </Group>
    <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>{children}</Box>
  </Paper>;
}

function StatTile({ icon: TileIcon, label, value, hint, color }: { icon: Icon; label: string; value: string; hint?: string; color: string }) {
  return <Paper radius="md" p="sm" style={{ background: `${color}12`, border: `1px solid ${color}26` }}>
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <ThemeIcon size={30} radius="md" variant="light" color={color}><TileIcon size={17} /></ThemeIcon>
      <div style={{ minWidth: 0 }}>
        <Text fz={10} fw={600} c="dimmed">{label}</Text>
        <Text fz={15} fw={800} c={NAVY_DEEP} lh={1.25} style={{ overflowWrap: 'anywhere' }}>{value}</Text>
        {hint && <Text fz={10} c="dimmed" lineClamp={1}>{hint}</Text>}
      </div>
    </Group>
  </Paper>;
}

/** Ranked rows with medal on #1, per-row icon, share bar. */
function RankedList({ data, icon: RowIcon, currency = false, share = true, color = '#2458bd', iconFor }: {
  data: DashboardItem[]; icon: Icon; currency?: boolean; share?: boolean; color?: string; iconFor?: (item: DashboardItem) => Icon;
}) {
  if (!data.length) return <Text size="sm" c="dimmed" py="xl">No records in your assigned scope.</Text>;
  const total = data.reduce((s, i) => s + i.value, 0);
  const max = Math.max(...data.map(i => i.value), 1);
  return <Stack gap={8}>{data.map((item, i) => {
    const Ico = i === 0 ? IconTrophy : (iconFor?.(item) ?? RowIcon);
    const pct = share ? (total ? item.value / total * 100 : 0) : item.value / max * 100;
    const top = i === 0;
    return <Paper key={item.name} radius="md" p="xs" px="sm" style={{ border: `1px solid ${top ? color + '40' : '#eef1f7'}`, background: top ? `${color}0d` : '#fff' }}>
      <Group wrap="nowrap" gap="sm">
        <ThemeIcon size={32} radius="md" variant={top ? 'filled' : 'light'} color={top ? '#e0a21b' : color} style={top ? { background: 'linear-gradient(135deg,#f7c948,#e0891b)' } : undefined}><Ico size={17} stroke={1.8} /></ThemeIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text size="xs" fw={600} c="#33415c" truncate>{item.name}</Text>
            <Text size="sm" fw={800} c={NAVY_DEEP} style={{ flexShrink: 0 }}>{currency ? peso(item.value) : full(item.value)}</Text>
          </Group>
          <Group gap="xs" wrap="nowrap" mt={5}>
            <Progress value={item.value / max * 100} color={item.color ?? (top ? color : color + '88')} size={6} radius="xl" style={{ flex: 1 }} />
            {share && <Text fz={10} fw={600} c="dimmed" w={34} ta="right">{pct.toFixed(0)}%</Text>}
          </Group>
        </div>
        <Badge size="xs" variant={top ? 'filled' : 'light'} color={top ? 'yellow.8' : 'gray'} radius="sm" style={{ flexShrink: 0 }}>#{i + 1}</Badge>
      </Group>
    </Paper>;
  })}</Stack>;
}

const parcelIcon = (name: string): Icon => /agri/i.test(name) ? IconPlant2 : /resid/i.test(name) ? IconHome2 : /comm/i.test(name) ? IconBuildingStore : /indus/i.test(name) ? IconBuildingFactory2 : IconLayoutGrid;

function Distribution({ data, totalLabel }: { data: DashboardItem[]; totalLabel: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <Text size="sm" c="dimmed" py="xl">No reported counts in your scope.</Text>;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const lead = sorted[0];
  return <Stack gap="lg" justify="center" style={{ flex: 1 }}>
    <Group justify="center" align="center" gap={40} wrap="wrap">
      <Box pos="relative" w={230} h={230} style={{ flexShrink: 0 }}>
        <DonutChart h={230} w={230} size={230} thickness={32} data={data.filter(item => item.value > 0).map(item => ({ ...item, color: item.color ?? '#2458bd' }))} withTooltip strokeWidth={3} />
        <Stack gap={0} align="center" justify="center" style={{ position: 'absolute', inset: 56, pointerEvents: 'none' }}>
          <Text fz={32} fw={800} c={NAVY_DEEP} lh={1.1}>{compact(total)}</Text><Text fz={11} c="dimmed">{totalLabel}</Text>
        </Stack>
      </Box>
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" style={{ flex: '1 1 240px', minWidth: 0, maxWidth: '100%' }}>
        {data.map(item => {
          const Ico = parcelIcon(item.name); const color = item.color ?? '#2458bd'; const pct = item.value / total * 100;
          return <Paper key={item.name} radius="md" p="sm" style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
            <Group gap="xs" wrap="nowrap" mb={8}><ThemeIcon size={30} radius="md" variant="filled" style={{ background: color }}><Ico size={17} stroke={1.8} /></ThemeIcon>
              <Text size="xs" fw={600} c="#33415c" truncate>{item.name}</Text></Group>
            <Group justify="space-between" align="baseline" wrap="nowrap"><Text fz={20} fw={800} c={NAVY_DEEP} lh={1.1}>{full(item.value)}</Text><Text fz={11} fw={700} c={color}>{pct.toFixed(1)}%</Text></Group>
            <Progress value={pct} size={5} radius="xl" mt={8} styles={{ section: { background: color }, root: { background: `${color}22` } }} />
          </Paper>;
        })}
      </SimpleGrid>
    </Group>
    <div>
      <Group justify="space-between" mb={6}><Text fz={11} fw={700} c={NAVY_DEEP}>Share of inventory</Text>
        <Text fz={10} c="dimmed">{lead.name} leads with {(lead.value / total * 100).toFixed(1)}%</Text></Group>
      <Progress.Root size={16} radius="xl">{sorted.map(item => <Progress.Section key={item.name} value={item.value / total * 100} color={item.color ?? '#2458bd'} />)}</Progress.Root>
    </div>
  </Stack>;
}

const YEAR_COLORS = ['#2458bd', '#0b927c', '#8a53c4', '#ce8515', '#d6456b', '#3d8fd1'];
const classIcon = (item: DashboardItem): Icon => /urban/i.test(item.name) ? IconBuildingSkyscraper : /rural/i.test(item.name) ? IconTrees : IconHome2;

/* ---------- page ---------- */

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
  const buildingRows = demographics ?? [];
  const buildingTotal = buildingRows.reduce((s, i) => s + i.value, 0);
  const buildingTop = [...buildingRows].sort((a, b) => b.value - a.value)[0];
  const viewMeta = { buildings: { label: 'Buildings', icon: IconBuilding, color: '#2458bd' }, years: { label: 'Buildings', icon: IconCalendarStats, color: '#0b927c' }, floors: { label: 'Buildings', icon: IconStairs, color: '#8a53c4' } }[demographicView as 'buildings' | 'years' | 'floors'];
  const marketSorted = [...(data?.market?.averages ?? [])].sort((a, b) => b.value - a.value);
  const yearRows = (data?.market?.years ?? []).slice(0, 6);
  const yearTotal = (data?.market?.years ?? []).reduce((sum, y) => sum + y.value, 0);
  const yearTop = [...yearRows].sort((a, b) => b.value - a.value)[0];
  const marketHigh = marketSorted[0];
  const marketLow = marketSorted[marketSorted.length - 1];

  const link = (page: string) => <Button size="compact-xs" variant="subtle" color={NAVY} rightSection={<IconArrowUpRight size={13} />} onClick={() => setPage(page)}>Explore</Button>;
  const metric = (value: number | undefined, sample = false) => loading && !data && !sample ? <Skeleton h={34} w={110} my={4} /> : <Text fz={32} fw={800} lh={1.4} c={NAVY_DEEP}>{value === undefined ? '—' : full(value)}</Text>;
  const unavailable = <Text size="sm" c="dimmed">Data unavailable. Refresh to retry.</Text>;
  const cards = [
    { title: 'Market value records', value: data?.market?.roads, note: 'Road records in the SMV inventory', icon: IconRoute, color: '#2458bd', page: 'Schedule of Market Value' },
    { title: 'Points of interest', value: data?.poi?.total, note: 'Mapped places in your POI scope', icon: IconMapPin, color: '#0b927c', page: 'Point of Interest' },
    { title: 'Population', value: demographic?.population, note: 'People · PSA 2020', icon: IconUsers, color: '#8a53c4', page: 'Population' },
    { title: 'Parcels', value: PARCEL_TOTAL, note: 'Illustrative inventory · not connected', icon: IconBuildingCommunity, color: '#ce8515', sample: true },
  ];

  return <Box className={styles.viewport} h="100%" style={{ overflowY: 'auto', background: '#f4f6fb', borderRadius: 12 }}>
    <Stack className={styles.content} gap="lg" p={{ base: 'sm', md: 'lg' }} maw={1600} w="100%" mx="auto">
      <Paper radius="lg" p={{ base: 'lg', md: 28 }} style={{ background: `linear-gradient(115deg, ${NAVY_DEEP}, #163c88)`, color: '#fff' }}>
        <Group justify="space-between" align="flex-start" gap="lg">
          <div style={{ minWidth: 0, flex: '1 1 300px' }}><Text fz={10} fw={700} c="#b4caf1" mb={8} style={{ letterSpacing: 2 }}>SMV · AREA OVERVIEW</Text>
            <Title order={2} fz={{ base: 25, md: 31 }} fw={750} mb={8}>Your area, at a glance.</Title>
            <Text size="sm" c="#cedbf1" maw={600}>Market values, places and communities in one view. Database figures follow your assigned geographic scopes.</Text>
          </div>
          <Stack gap={8} align="flex-end"><Button size="xs" variant="white" color={NAVY} leftSection={loading ? <Loader size={13} /> : <IconRefresh size={14} />} disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh overview</Button>
            <Text fz={10} c="#b4caf1">{data ? `Updated ${new Date(data.generatedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} PHT` : 'Loading scoped summaries'}</Text>
          </Stack>
        </Group>
      </Paper>

      {(error || !!data?.errors.length) && <Alert color="orange" title="Some data could not be refreshed">{error || data?.errors.join('. ')}{data && error ? ' Showing your last loaded figures.' : ''}</Alert>}

      <SimpleGrid spacing="md" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
        {cards.map(card => <Paper key={card.title} withBorder radius="lg" p="lg" style={{ borderColor: BORDER }}>
          <Group justify="space-between" mb="xs"><ThemeIcon size={36} radius="md" variant="light" color={card.color}><card.icon size={20} stroke={1.6} /></ThemeIcon>
            {card.sample ? <Badge size="xs" color="orange" variant="light">Sample data</Badge> : <Badge size="xs" color="gray" variant="light">Database</Badge>}</Group>
          <Text size="xs" fw={600} c="#61708c">{card.title}</Text>{metric(card.value, card.sample)}
          <Group justify="space-between" align="center" gap={4}><Text fz={10} c="dimmed">{card.note}</Text>{card.page && <Button size="compact-xs" variant="subtle" px={3} aria-label={`Open ${card.title}`} onClick={() => setPage(card.page!)}><IconArrowUpRight size={16} /></Button>}</Group>
        </Paper>)}
      </SimpleGrid>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card eyebrow="Geographic context" title="Explore your assigned area" icon={IconMap2} iconColor="#2458bd">
            <DashboardMap />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card eyebrow="Places & coverage" title="Top areas by POI" icon={IconMapSearch} iconColor="#0b927c" action={link('Point of Interest')}>
            {data?.poi ? <RankedList data={data.poi.areas} icon={IconMapPinFilled} color="#0b927c" /> : loading ? <Skeleton h={260} /> : unavailable}
            <Paper mt="lg" p="md" radius="md" bg="#f4f6fb"><Text size="xs" fw={700} c={NAVY_DEEP}>Different datasets, different scopes</Text>
              <Text size="xs" c="dimmed" mt={5}>The map uses your demographic scope. This ranking uses your POI scope.</Text></Paper>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
        <Card eyebrow="Valuation" title="Average market values" icon={IconCash} iconColor="#2458bd" action={link('Schedule of Market Value')}>
          {data?.market ? <Stack gap="md">
            {marketHigh && marketLow && marketSorted.length > 1 && <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
              <StatTile icon={IconTrendingUp} color="#0b927c" label="Highest average" value={peso(marketHigh.value)} hint={marketHigh.name} />
              <StatTile icon={IconTrendingDown} color="#ce8515" label="Lowest average" value={peso(marketLow.value)} hint={marketLow.name} />
            </SimpleGrid>}
            <RankedList data={marketSorted} icon={IconRoute} currency share={false} color="#2458bd" />
            <Text fz={10} c="dimmed">Unweighted average per road record, using stored zonal values. Zero values are excluded; units follow the source inventory.</Text>
            <div>
              <Group justify="space-between" mb="sm" wrap="nowrap">
                <Group gap={8} wrap="nowrap"><ThemeIcon size={26} radius="md" variant="light" color="#2458bd"><IconCalendarStats size={15} /></ThemeIcon>
                  <Text size="sm" fw={700} c={NAVY_DEEP}>Records by year</Text></Group>
                <Badge variant="light" color="gray" size="sm" leftSection={<IconDatabase size={11} />}>{full(yearTotal)} total</Badge>
              </Group>
              <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
                {yearRows.map((year, i) => {
                  const pct = yearTotal ? year.value / yearTotal * 100 : 0; const color = YEAR_COLORS[i % YEAR_COLORS.length]; const top = year.name === yearTop?.name;
                  return <Paper key={year.name} radius="md" p="sm" style={{ background: `linear-gradient(135deg, ${color}14, #fff 70%)`, border: `1px solid ${color}33` }}>
                    <Group gap="sm" wrap="nowrap">
                      <RingProgress size={62} thickness={6} roundCaps sections={[{ value: Math.max(pct, 2), color }]} rootColor={`${color}22`}
                        label={<Text ta="center" fz={11} fw={800} c={color}>{pct.toFixed(0)}%</Text>} />
                      <div style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap"><Text fz={20} fw={800} c={NAVY_DEEP} lh={1.1}>{year.name}</Text>
                          {top && <Badge size="xs" variant="filled" radius="sm" style={{ background: color }}>Most</Badge>}</Group>
                        <Text fz={12} fw={700} c="#33415c" mt={2}>{full(year.value)}</Text>
                        <Text fz={10} c="dimmed">records</Text>
                      </div>
                    </Group>
                  </Paper>;
                })}
              </SimpleGrid>
            </div>
          </Stack> : loading ? <Skeleton h={205} /> : unavailable}
        </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
        <Card eyebrow="Places" title="Top points of interest categories" icon={IconCategory} iconColor="#0b927c" action={link('Point of Interest')}>
          {data?.poi ? <><RankedList data={data.poi.categories} icon={IconMapPin} color="#0b927c" /><Text fz={10} c="dimmed" mt="lg">Top six categories by number of mapped places.</Text></> : loading ? <Skeleton h={205} /> : unavailable}
        </Card>
        </Grid.Col>
      </Grid>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 5 }}>
        <Card eyebrow="Communities · PSA 2020" title="Population & barangay class" icon={IconUsers} iconColor="#8a53c4" action={link('Population')}>
          {demographic ? <Stack gap="lg">
            <SimpleGrid cols={2} spacing="sm">
              <StatTile icon={IconBuildings} color="#2458bd" label="Municipalities" value={full(demographic.municipalities)} />
              <StatTile icon={IconHome2} color="#0b927c" label="Barangays" value={full(demographic.barangays)} />
            </SimpleGrid>
            <Paper radius="md" p="md" style={{ border: '1px solid #eef1f7' }}>
              <Group justify="space-between" mb={10} wrap="nowrap">
                <Group gap={8} wrap="nowrap"><ThemeIcon size={30} radius="xl" variant="light" color="#2458bd"><IconMan size={18} /></ThemeIcon>
                  <div><Text fz={10} c="dimmed" lh={1.2}>Male</Text><Text size="sm" fw={800} c="#2458bd" lh={1.2}>{full(demographic.male)}</Text></div></Group>
                <Group gap={8} wrap="nowrap" justify="flex-end"><div style={{ textAlign: 'right' }}><Text fz={10} c="dimmed" lh={1.2}>Female</Text><Text size="sm" fw={800} c="#ce8515" lh={1.2}>{full(demographic.female)}</Text></div>
                  <ThemeIcon size={30} radius="xl" variant="light" color="#ce8515"><IconWoman size={18} /></ThemeIcon></Group>
              </Group>
              <Progress.Root size={12} radius="xl">
                <Progress.Section value={sexTotal ? demographic.male / sexTotal * 100 : 0} color="#2458bd"><Progress.Label>{sexTotal ? (demographic.male / sexTotal * 100).toFixed(0) : 0}%</Progress.Label></Progress.Section>
                <Progress.Section value={sexTotal ? demographic.female / sexTotal * 100 : 0} color="#f59e0b"><Progress.Label>{sexTotal ? (demographic.female / sexTotal * 100).toFixed(0) : 0}%</Progress.Label></Progress.Section>
              </Progress.Root>
              <Text fz={10} c="dimmed" mt={8}>Shares use the reported male and female counts.</Text>
            </Paper>
            <div><Text size="xs" fw={700} c={NAVY_DEEP} mb={8}>Barangay classification</Text>
              <RankedList data={demographic.classes} icon={IconHome2} iconFor={classIcon} color="#8a53c4" /></div>
            <Button size="compact-xs" variant="subtle" color={NAVY} onClick={() => setPage('Barangay Class')}>Explore barangay classifications →</Button>
          </Stack> : loading ? <Skeleton h={250} /> : unavailable}
        </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
        <Card eyebrow="Land inventory" title="Parcels by classification" icon={IconBuildingCommunity} iconColor="#ce8515" action={<Badge color="orange" variant="light" size="sm">Sample data</Badge>}>
          <Distribution data={SAMPLE_PARCELS} totalLabel="sample parcels" />
          <Text fz={11} c="#8c6c2c" mt="lg" pt="md" style={{ borderTop: '1px dashed #e8d9b8' }}>Illustrative figures only. Parcel records are not connected yet; these numbers do not reflect your geographic scope.</Text>
        </Card>
        </Grid.Col>
      </Grid>

      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 8 }}>
        <Card eyebrow="Buildings · PSA 2020" title="Building profile" icon={IconChartBar} iconColor={viewMeta.color} action={link(demographicPage)}>
          <SegmentedControl size="xs" mb="lg" fullWidth value={demographicView} onChange={setDemographicView} data={[
            { value: 'buildings', label: <Group gap={6} justify="center" wrap="nowrap"><IconBuilding size={14} /><span>Building type</span></Group> },
            { value: 'years', label: <Group gap={6} justify="center" wrap="nowrap"><IconCalendarStats size={14} /><span>Year built</span></Group> },
            { value: 'floors', label: <Group gap={6} justify="center" wrap="nowrap"><IconStairs size={14} /><span>Floors</span></Group> },
          ]} />
          {demographic ? (buildingRows.length ? <Stack gap="md">
            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
              <StatTile icon={viewMeta.icon} color={viewMeta.color} label="Total buildings" value={full(buildingTotal)} hint="In listed categories" />
              <StatTile icon={IconTrophy} color="#e0891b" label="Most common" value={buildingTop?.name ?? '—'} hint={buildingTop ? `${full(buildingTop.value)} · ${(buildingTotal ? buildingTop.value / buildingTotal * 100 : 0).toFixed(1)}%` : undefined} />
              <StatTile icon={IconCategory} color="#8a53c4" label="Categories" value={full(buildingRows.length)} hint="Shown in chart" />
            </SimpleGrid>
            <BarChart
              h={Math.max(260, buildingRows.length * 38)}
              data={buildingRows.map(item => ({ name: item.name, Buildings: item.value }))}
              dataKey="name"
              orientation="vertical"
              series={[{ name: 'Buildings', color: viewMeta.color }]}
              valueFormatter={full}
              withLegend={false}
              gridAxis="x"
              tickLine="none"
              yAxisProps={{ width: 150 }}
              xAxisProps={{ tickFormatter: (v: number) => compact(v) }}
              barProps={{ radius: [0, 6, 6, 0] }}
            />
          </Stack> : <Text size="sm" c="dimmed" py="xl">No building records in your assigned scope.</Text>) : loading ? <Skeleton h={250} /> : unavailable}
          <Text fz={10} c="dimmed" mt="lg">Counts from the supplied PSA fields. Year-built categories include only the listed ranges; omitted years are not inferred.</Text>
        </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
        <Card eyebrow="Keep exploring" title="Open a demographic view" icon={IconMapSearch} iconColor="#2458bd">
          <Stack gap="xs">
            {[['Population', IconUsers], ['Barangay Class', IconHome2], ['Type of Buildings', IconBuilding], ['Year Built of Buildings', IconCalendarStats], ['Number of Story of Building', IconStairs]].map(([page, Ico]) => {
              const I = Ico as Icon;
              return <Button key={page as string} variant="light" color={NAVY} justify="space-between" leftSection={<I size={16} />} rightSection={<IconArrowUpRight size={15} />} onClick={() => setPage(page as string)}>{page as string}</Button>;
            })}
            <Text fz={10} c="dimmed" mt="xs">PSA figures use the 2020 census. Parcel figures are sample data.</Text>
          </Stack>
        </Card>
        </Grid.Col>
      </Grid>
      <Text ta="center" fz={10} c="dimmed" pb="sm">Database summaries are cached for up to one minute. Parcel figures are illustrative.</Text>
    </Stack>
  </Box>;
}
