import { useEffect, useMemo, useState } from 'react';
import { Box, Group, LoadingOverlay, Select, Stack, Text } from '@mantine/core';
import { BarChart, DonutChart, PieChart, RadarChart } from '@mantine/charts';
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart as RechartsRadialBarChart,
  ResponsiveContainer,
  Tooltip,
  Treemap as RechartsTreemap,
} from 'recharts';
import { useParcelStore } from '@/stores/parcel_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config'; // adjust to wherever your basePath lives

// ----- Options ---------------------------------------------------------------
const GROUP_FIELDS = [
  { value: 'classification', label: 'Classification' },
  { value: 'region', label: 'Region' },
  { value: 'province', label: 'Province' },
  { value: 'city_municipality', label: 'City / Municipality' },
  { value: 'barangay', label: 'Barangay' },
] as const;
type GroupField = (typeof GROUP_FIELDS)[number]['value'];

// How many groups each chart shows before the rest is merged into "Other ..."
const CHART_TYPES = [
  { value: 'bar', label: 'Bar chart', limit: 10 },
  { value: 'barslist', label: 'Bars list', limit: 15 },
  { value: 'donut', label: 'Donut chart', limit: 8 },
  { value: 'pie', label: 'Pie chart', limit: 8 },
  { value: 'radar', label: 'Radar chart', limit: 8 },
  { value: 'radial', label: 'Radial bar chart', limit: 8 },
  { value: 'treemap', label: 'Treemap', limit: 30 },
] as const;
type ChartType = (typeof CHART_TYPES)[number]['value'];

const PALETTE = [
  'blue.6',
  'teal.6',
  'violet.6',
  'orange.6',
  'grape.6',
  'cyan.6',
  'lime.6',
  'pink.6',
  'indigo.6',
  'yellow.6',
  'red.6',
  'green.6',
];

type Item = { name: string; value: number };

// Response of GET /api/pages/parcel/summary
type SummaryResult = {
  items: Item[]; // top groups, already sorted and limited by the server
  other: number; // sum of everything beyond the limit (the "Other ..." bucket)
  total: number; // Parcels matching the table's current query
};

const EMPTY_RESULT: SummaryResult = { items: [], other: 0, total: 0 };

// 'blue.6' -> Mantine CSS variable, so the SVG shapes use the theme colors
const cssColor = (c: string) => `var(--mantine-color-${c.replace('.', '-')})`;

export default function SummaryParcel() {
  // The querystring the table is currently using (search + filters + radius + scope).
  // The server aggregates it; nothing is counted in the browser.
  const parcelTableQuery = useParcelStore((s) => s.parcelTableQuery);
  const scope = useGlobalStore((s) => s.auth?.scope_parcel);
  const scopeJson = useMemo(() => JSON.stringify(scope ?? []), [scope]);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [groupBy, setGroupBy] = useState<GroupField>('classification');

  const groupLabel = GROUP_FIELDS.find((g) => g.value === groupBy)?.label ?? '';
  const otherLabel = `Other ${groupLabel.toLowerCase()}`;
  const limit = CHART_TYPES.find((c) => c.value === chartType)?.limit ?? 10;

  // ----- Server-side counts ----------------------------------------------------
  const [result, setResult] = useState<SummaryResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);

    // small debounce so quick filter / search changes in the table don't fire a request each
    const timer = setTimeout(async () => {
      try {
        const sp = new URLSearchParams(parcelTableQuery ?? '');
        if (!sp.get('scope')) sp.set('scope', scopeJson); // table query had no scope: use the user's
        sp.set('groupBy', groupBy);
        sp.set('limit', String(limit));

        const res = await fetch(`${basePath}/api/pages/parcel/summary?${sp.toString()}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Summary request failed (${res.status})`);
        setResult((await res.json()) as SummaryResult);
        setError(null);
        setLoading(false);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // a newer request replaced this one
        setError((e as Error).message);
        setLoading(false);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [groupBy, limit, parcelTableQuery, scopeJson]);

  const total = result.total;

  // Top groups + "Other ..." bucket, for the selected chart
  const data: Item[] = useMemo(
    () =>
      result.other > 0 ? [...result.items, { name: otherLabel, value: result.other }] : result.items,
    [result, otherLabel]
  );

  // Same data with a color per slice (donut, pie, radial bar, treemap)
  const colored = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        color: d.name === otherLabel ? 'gray.5' : PALETTE[i % PALETTE.length],
      })),
    [data, otherLabel]
  );

  // Same data keyed as "Parcels" (bar, radar)
  const countData = useMemo(() => data.map((d) => ({ name: d.name, Parcels: d.value })), [data]);

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart
            h="100%"
            data={countData}
            dataKey="name"
            orientation="vertical"
            series={[{ name: 'Parcels', color: 'blue.6' }]}
            yAxisProps={{ width: 120 }}
            gridAxis="x"
            tickLine="x"
            withLegend={false}
          />
        );

      case 'barslist':
        return <RankedBars items={data} />;

      case 'donut':
        return (
          <Stack gap="sm" align="center">
            <DonutChart
              data={colored}
              size={190}
              thickness={28}
              chartLabel={total.toLocaleString()}
              withTooltip
              tooltipDataSource="segment"
            />
            <Legend items={colored} />
          </Stack>
        );

      case 'pie':
        return (
          <Stack gap="sm" align="center">
            <PieChart data={colored} size={190} withTooltip tooltipDataSource="segment" />
            <Legend items={colored} />
          </Stack>
        );

      case 'radar':
        return (
          <RadarChart
            h="100%"
            data={countData}
            dataKey="name"
            series={[{ name: 'Parcels', color: 'blue.6', opacity: 0.25 }]}
            withPolarGrid
            withPolarAngleAxis
            withTooltip
            withDots
          />
        );

      case 'radial': {
        // Recharts draws the first item as the innermost ring, so reverse to put the
        // largest group on the outside. `fill` is the solid color of each ring.
        const radialData = [...colored].reverse().map((d) => ({ ...d, fill: cssColor(d.color) }));
        const maxValue = Math.max(...colored.map((d) => d.value), 1);

        return (
          <Stack gap="sm">
            <Box h={260}>
              <ResponsiveContainer width="100%" height="100%">
                <RechartsRadialBarChart
                  data={radialData}
                  innerRadius="18%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, maxValue]} tick={false} />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={6}
                    isAnimationActive={false}
                    background={{ fill: 'var(--mantine-color-gray-2)' }}
                  />
                  <Tooltip
                    formatter={(value, _name, item) => [
                      Number(value).toLocaleString(),
                      (item.payload as Item).name,
                    ]}
                  />
                </RechartsRadialBarChart>
              </ResponsiveContainer>
            </Box>
            <Legend items={colored} />
          </Stack>
        );
      }

      case 'treemap':
        return (
          <Box h="100%">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsTreemap
                data={colored}
                dataKey="value"
                isAnimationActive={false}
                content={<TreemapCell />}
              >
                <Tooltip formatter={(value) => Number(value).toLocaleString()} />
              </RechartsTreemap>
            </ResponsiveContainer>
          </Box>
        );
    }
  };

  return (
    <Stack gap="xs" p="xs" h="100%" style={{ overflow: 'auto' }}>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <Select
          size="xs"
          label="Chart"
          data={CHART_TYPES.map(({ value, label }) => ({ value, label }))}
          value={chartType}
          onChange={(v) => v && setChartType(v as ChartType)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          style={{ flex: 1 }}
        />
        <Select
          size="xs"
          label="Group by"
          data={GROUP_FIELDS.map(({ value, label }) => ({ value, label }))}
          value={groupBy}
          onChange={(v) => v && setGroupBy(v as GroupField)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
          style={{ flex: 1 }}
        />
      </Group>

      <Box>
        <Text fz="sm" fw={700}>
          Parcels by {groupLabel}
        </Text>
        <Text fz="xs" c="dimmed">
          {total.toLocaleString()} Parcels
        </Text>
        {error && (
          <Text fz="xs" c="red">
            {error}
          </Text>
        )}
      </Box>

      {/* Previous result stays visible under the overlay while a new one loads */}
      <Box pos="relative" style={{ flex: 1, minHeight: 260 }}>
        <LoadingOverlay
          visible={loading}
          zIndex={5}
          overlayProps={{ radius: 'sm', blur: 1 }}
          loaderProps={{ size: 'sm' }}
        />
        {renderChart()}
      </Box>
    </Stack>
  );
}

// ----- Treemap cell: draws the box, and the label only when it fits -----------
const LABEL_FONT_SIZE = 11;
const CHAR_WIDTH = 6.4; // average glyph width at 11px; raise it if labels still get clipped
const LABEL_PADDING = 12; // total horizontal breathing room around the text
const LABEL_MIN_HEIGHT = 18;

type TreemapCellProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  color?: string;
};

function TreemapCell({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  depth = 0,
  name = '',
  color = 'blue.6',
}: TreemapCellProps) {
  if (depth === 0) return null; // skip the invisible root node

  const fits = width >= name.length * CHAR_WIDTH + LABEL_PADDING && height >= LABEL_MIN_HEIGHT;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2}
        fill={cssColor(color)}
        stroke="#fff"
        strokeWidth={1.5}
      />
      {fits && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={LABEL_FONT_SIZE}
          fill="#fff"
          style={{ pointerEvents: 'none' }}
        >
          {name}
        </text>
      )}
    </g>
  );
}

// Ranked horizontal bars: fixed row height, one-line label (ellipsis if too long)
function RankedBars({ items }: { items: Item[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <Stack gap={4}>
      {items.map((i) => (
        <Box key={i.name} pos="relative" h={28} title={`${i.name}: ${i.value.toLocaleString()}`}>
          {/* the bar itself, width relative to the largest value */}
          <Box
            pos="absolute"
            top={0}
            left={0}
            bottom={0}
            bg="blue.1"
            style={{ width: `${Math.max((i.value / max) * 100, 2)}%`, borderRadius: 4 }}
          />

          {/* label + value sit on top of the bar */}
          <Group pos="relative" h="100%" px={8} gap={8} wrap="nowrap" justify="space-between">
            <Text fz="xs" fw={500} truncate style={{ minWidth: 0 }}>
              {i.name}
            </Text>
            <Text fz="xs" fw={700} style={{ flexShrink: 0 }}>
              {i.value.toLocaleString()}
            </Text>
          </Group>
        </Box>
      ))}
    </Stack>
  );
}

// Simple color legend for donut / pie / radial bar
function Legend({ items }: { items: { name: string; value: number; color: string }[] }) {
  return (
    <Stack gap={2} w="100%">
      {items.map((i) => (
        <Group key={i.name} gap={6} wrap="nowrap" justify="space-between">
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <Box w={10} h={10} bg={i.color} style={{ borderRadius: 2, flexShrink: 0 }} />
            <Text fz="xs" truncate>
              {i.name}
            </Text>
          </Group>
          <Text fz="xs" c="dimmed">
            {i.value.toLocaleString()}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}