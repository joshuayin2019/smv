import {
  Badge, Box, Flex, Grid, Group, Paper, Progress, RingProgress, SimpleGrid, Stack, Text, Title,
} from '@mantine/core';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
// Adjust this path to wherever theme_colors.ts lives in your project.
import {
  ACCENT, BORDER, HEADER_BG, NAVY_DEEP, PANEL_BG,
} from '@/lib/theme_colors';

const MAP_HEIGHT = 300;

// Leaflet needs the browser, so load the map on the client only.
const PhilippinesMap = dynamic(() => import('./PhilippinesMap'), {
  ssr: false,
  loading: () => <Box h={MAP_HEIGHT} bg={PANEL_BG} style={{ borderRadius: 6 }} />,
});

// ---------- Static sample data (replace with API data later) ----------
const GOOD = '#0b7a12'; // readable green for small text on light backgrounds
const MID_BLUE = '#4f6fd0';
const SOFT_BLUE = '#9db0e8';
const AXIS_TEXT = '#5b6a99';

const STATS = [
  { label: 'Population', value: '115.8M', note: '+0.8% yearly growth' },
  { label: 'Market value', value: '₱18,450', note: '+3.4% per sqm' },
  { label: 'Points of interest', value: '100,482', note: '1,240 added this month' },
  { label: 'Parcels', value: '2.18M', note: '+1.2% this quarter' },
];

const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const POI_ADDED = [320, 410, 380, 520, 610, 560, 690, 740, 680, 820, 780, 900];
const PARCELS_UPDATED = [210, 260, 300, 280, 390, 450, 420, 520, 560, 500, 610, 660];

const CLASSIFICATION = [
  { name: 'Residential', value: 58, color: NAVY_DEEP },
  { name: 'Commercial', value: 24, color: MID_BLUE },
  { name: 'Industrial', value: 12, color: ACCENT },
  { name: 'Agricultural and other', value: 6, color: SOFT_BLUE },
];

// [name, longitude, latitude, points of interest]
const CITIES: [string, number, number, number][] = [
  ['Metro Manila', 121.0, 14.6, 21500],
  ['Cebu City', 123.9, 10.32, 8200],
  ['Davao City', 125.6, 7.07, 6900],
  ['Cagayan de Oro', 124.65, 8.48, 3600],
  ['Iloilo City', 122.56, 10.72, 3100],
  ['Baguio', 120.6, 16.4, 2400],
  ['Bacolod', 122.95, 10.67, 2200],
  ['Zamboanga City', 122.08, 6.91, 1900],
  ['Legazpi', 123.74, 13.14, 1500],
  ['Tacloban', 125.0, 11.24, 1400],
  ['General Santos', 125.17, 6.11, 1300],
  ['Puerto Princesa', 118.74, 9.74, 1200],
  ['Laoag', 120.59, 18.2, 900],
  ['Tuguegarao', 121.73, 17.61, 800],
];

// ---------- Helpers ----------
type Pt = [number, number];
// Smooth curve through points (Catmull-Rom converted to cubic Bezier).
const smooth = (pts: Pt[]) => {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`;
  }
  return d;
};

// ---------- Panel: white card with a themed header band ----------
function Panel({
  title, subtitle, right, children,
}: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" h="100%" style={{ borderColor: BORDER, overflow: 'hidden' }}>
      <Group
        justify="space-between"
        align="center"
        px="md"
        py={8}
        bg={HEADER_BG}
        style={{ borderBottom: `1px solid ${BORDER}`, borderLeft: `3px solid ${NAVY_DEEP}` }}
      >
        <Group gap={8} align="baseline">
          <Title order={5} c={NAVY_DEEP}>{title}</Title>
          {subtitle && <Text size="xs" c={AXIS_TEXT}>{subtitle}</Text>}
        </Group>
        {right}
      </Group>
      <Box p="md">{children}</Box>
    </Paper>
  );
}

// ---------- Area chart ----------
const CW = 640;
const CH = 190;
const PAD = { l: 40, r: 10, t: 8, b: 24 };

function AreaChart() {
  const plotW = CW - PAD.l - PAD.r;
  const plotH = CH - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i * plotW) / (MONTHS.length - 1);
  const y = (v: number) => PAD.t + plotH * (1 - v / 1000);
  const base = PAD.t + plotH;
  const line = (data: number[]) => smooth(data.map((v, i) => [x(i), y(v)] as Pt));
  const area = (data: number[]) => `${line(data)} L${x(data.length - 1)} ${base} L${x(0)} ${base} Z`;

  return (
    <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" role="img" aria-label="Monthly points of interest added and parcels updated">
      {[0, 250, 500, 750, 1000].map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={CW - PAD.r} y1={y(t)} y2={y(t)} stroke={BORDER} />
          <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={AXIS_TEXT}>{t}</text>
        </g>
      ))}
      <path d={area(POI_ADDED)} fill={NAVY_DEEP} fillOpacity={0.22} />
      <path d={line(POI_ADDED)} fill="none" stroke={NAVY_DEEP} strokeWidth="2" />
      <path d={area(PARCELS_UPDATED)} fill={ACCENT} fillOpacity={0.25} />
      <path d={line(PARCELS_UPDATED)} fill="none" stroke={ACCENT} strokeWidth="2" />
      {MONTHS.map((m, i) => (
        <text key={`${m}-${i}`} x={x(i)} y={CH - 6} textAnchor="middle" fontSize="11" fill={AXIS_TEXT}>{m}</text>
      ))}
    </svg>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Box w={8} h={8} bg={color} style={{ borderRadius: 2 }} />
      <Text size="xs" c={NAVY_DEEP}>{label}</Text>
    </Group>
  );
}

// ---------- Page ----------
export default function DashboardMain() {
  const topCities = [...CITIES].sort((a, b) => b[3] - a[3]).slice(0, 6);
  const maxCount = topCities[0][3];

  return (
    <Stack gap="md" p="md">
      <Group justify="space-between" align="center">
        <div>
          <Title order={3} c={NAVY_DEEP} lh={1.2}>Dashboard</Title>
          <Text size="xs" c="dimmed">Schedule of market value overview for the Philippines</Text>
        </div>
        <Badge
          radius="sm"
          size="md"
          styles={{ root: { backgroundColor: HEADER_BG, color: NAVY_DEEP } }}
        >
          Sample data as of Oct 22, 2026
        </Badge>
      </Group>

      {/* Row 1: population, market value, points of interest, parcels */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {STATS.map((s) => (
          <Paper
            key={s.label}
            withBorder
            radius="md"
            px="md"
            py="sm"
            bg={PANEL_BG}
            style={{ borderColor: BORDER, borderLeft: `3px solid ${NAVY_DEEP}` }}
          >
            <Text size="xs" c={NAVY_DEEP} fw={600}>{s.label}</Text>
            <Text fz={22} fw={700} c={NAVY_DEEP} lh={1.25} mt={2}>{s.value}</Text>
            <Text fz={11} mt={2} fw={500} style={{ color: GOOD }}>{s.note}</Text>
          </Paper>
        ))}
      </SimpleGrid>

      {/* Row 2: map (wide) + tall chart on the right */}
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Panel title="Points of interest" subtitle="Larger dots mean more points of interest">
            <Box h={MAP_HEIGHT} style={{ borderRadius: 6, overflow: 'hidden' }}>
              <PhilippinesMap cities={CITIES} />
            </Box>
          </Panel>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Panel title="Top areas" subtitle="By points of interest">
            <Stack gap="sm">
              {topCities.map(([name, , , count], i) => (
                <div key={name}>
                  <Group justify="space-between" mb={3}>
                    <Text size="xs" c={NAVY_DEEP} fw={i === 0 ? 700 : 500}>{name}</Text>
                    <Text size="xs" c={NAVY_DEEP} fw={i === 0 ? 700 : 500}>{count.toLocaleString('en-PH')}</Text>
                  </Group>
                  <Progress
                    value={(count / maxCount) * 100}
                    color={i === 0 ? ACCENT : NAVY_DEEP}
                    size={6}
                    radius="sm"
                    styles={{ root: { backgroundColor: HEADER_BG } }}
                    aria-label={`${name} points of interest`}
                  />
                </div>
              ))}
            </Stack>
          </Panel>
        </Grid.Col>
      </Grid>

      {/* Row 3: two charts side by side */}
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Panel
            title="Monthly activity"
            subtitle="Last 12 months"
            right={(
              <Group gap="sm">
                <LegendDot color={NAVY_DEEP} label="Points of interest added" />
                <LegendDot color={ACCENT} label="Parcels updated" />
              </Group>
            )}
          >
            <AreaChart />
          </Panel>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Panel title="Parcels by classification" subtitle="Share of all parcels">
            <Flex gap="lg" align="center" justify="center" wrap="wrap" mih={190}>
              <RingProgress
                size={150}
                thickness={22}
                sections={CLASSIFICATION.map((c) => ({ value: c.value, color: c.color, tooltip: `${c.name}: ${c.value}%` }))}
                label={<Text ta="center" fw={700} size="sm" c={NAVY_DEEP} lh={1.2}>2.18M<br /><Text span fz={11} c="dimmed" fw={400}>parcels</Text></Text>}
              />
              <Stack gap={6}>
                {CLASSIFICATION.map((c) => (
                  <Group key={c.name} gap={8} wrap="nowrap">
                    <Box w={9} h={9} bg={c.color} style={{ borderRadius: '50%', flex: 'none' }} />
                    <Text size="xs" c={NAVY_DEEP}><b>{c.value}%</b> {c.name}</Text>
                  </Group>
                ))}
              </Stack>
            </Flex>
          </Panel>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
