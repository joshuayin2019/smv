import { useMemo, useState } from 'react';
import { Box, Group, Select, Stack, Text } from '@mantine/core';
import { BarChart, DonutChart, LineChart, PieChart, RadarChart } from '@mantine/charts';
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart as RechartsRadialBarChart,
  ResponsiveContainer,
  Tooltip,
  Treemap as RechartsTreemap,
} from 'recharts';
import { useSmvStore, type SmvRecord } from '@/stores/smv_stores';

// ----- Options ---------------------------------------------------------------
const GROUP_FIELDS = [
  { value: 'fclass', label: 'Road class' },
  { value: 'smv_year', label: 'SMV year' },
  { value: 'reg_name', label: 'Region' },
  { value: 'pro_name', label: 'Province' },
  { value: 'mun_name', label: 'City / Municipality' },
] as const;
type GroupField = (typeof GROUP_FIELDS)[number]['value'];

// Same keys and colors as the map layer (r, c, i, a)
const ZONALS = [
  { key: 'r', label: 'Residential', color: 'green.6' },
  { key: 'c', label: 'Commercial', color: 'blue.6' },
  { key: 'i', label: 'Industrial', color: 'orange.6' },
  { key: 'a', label: 'Agricultural', color: 'violet.6' },
] as const;
type ZKey = (typeof ZONALS)[number]['key'];

// What a single-metric chart measures
const METRICS = [
  { value: 'count', label: 'Number of roads' },
  { value: 'r', label: 'Avg residential value' },
  { value: 'c', label: 'Avg commercial value' },
  { value: 'i', label: 'Avg industrial value' },
  { value: 'a', label: 'Avg agricultural value' },
] as const;
type Metric = (typeof METRICS)[number]['value'];

// limit = how many groups each chart shows before the rest is merged into "Other ..."
// metric: 'single' uses the Metric picker, 'zonals' always shows the four zonal averages
const CHART_TYPES = [
  { value: 'bar', label: 'Bar chart', limit: 10, kind: 'single' },
  { value: 'compare', label: 'Zonal comparison (avg)', limit: 8, kind: 'zonals' },
  { value: 'barslist', label: 'Bars list', limit: 15, kind: 'single' },
  { value: 'donut', label: 'Donut chart', limit: 8, kind: 'single' },
  { value: 'pie', label: 'Pie chart', limit: 8, kind: 'single' },
  { value: 'radar', label: 'Radar chart', limit: 8, kind: 'single' },
  { value: 'radial', label: 'Radial bar chart', limit: 8, kind: 'single' },
  { value: 'treemap', label: 'Treemap', limit: 30, kind: 'single' },
  { value: 'trend', label: 'Trend by SMV year', limit: 999, kind: 'trend' },
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

const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

// 'blue.6' -> Mantine CSS variable, so the SVG shapes use the theme colors
const cssColor = (c: string) => `var(--mantine-color-${c.replace('.', '-')})`;

// ----- Aggregation -----------------------------------------------------------
type Agg = { count: number; sum: Record<ZKey, number>; n: Record<ZKey, number> };
type Group_ = { name: string; agg: Agg };
type Item = { name: string; value: number };

const emptyAgg = (): Agg => ({
  count: 0,
  sum: { r: 0, c: 0, i: 0, a: 0 },
  n: { r: 0, c: 0, i: 0, a: 0 },
});

// 0, empty and NaN all mean "no value", same rule as the map filter (> 0)
const positive = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function addRow(agg: Agg, r: SmvRecord) {
  agg.count += 1;
  for (const z of ZONALS) {
    const v = positive(r[z.key]);
    if (v !== null) {
      agg.sum[z.key] += v;
      agg.n[z.key] += 1;
    }
  }
}

function mergeAgg(list: Agg[]): Agg {
  const out = emptyAgg();
  for (const a of list) {
    out.count += a.count;
    for (const z of ZONALS) {
      out.sum[z.key] += a.sum[z.key];
      out.n[z.key] += a.n[z.key];
    }
  }
  return out;
}

// Average of one zonal type over the roads that actually have a value (null when none do)
const avgOf = (agg: Agg, k: ZKey): number | null => (agg.n[k] > 0 ? agg.sum[k] / agg.n[k] : null);

const metricValue = (agg: Agg, m: Metric): number =>
  m === 'count' ? agg.count : avgOf(agg, m) ?? 0;

function groupRows(rows: SmvRecord[], field: GroupField): Group_[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const key = String(r[field] ?? '').trim() || 'Unspecified';
    let agg = map.get(key);
    if (!agg) map.set(key, (agg = emptyAgg()));
    addRow(agg, r);
  }
  return Array.from(map, ([name, agg]) => ({ name, agg }));
}

// Keep the top groups, merge the rest into one "Other ..." group (re-aggregated, so averages stay correct)
function topWithOther(groups: Group_[], limit: number, otherLabel: string): Group_[] {
  const top = groups.slice(0, limit);
  const rest = groups.slice(limit);
  return rest.length > 0 ? [...top, { name: otherLabel, agg: mergeAgg(rest.map((g) => g.agg)) }] : top;
}

export default function SummarySMV() {
  const smv = useSmvStore((s) => s.smv);
  const filteredSmv = useSmvStore((s) => s.filteredSmv);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [groupBy, setGroupBy] = useState<GroupField>('fclass');
  const [metric, setMetric] = useState<Metric>('count');

  // Use what the table is showing; fall back to all roads until the table reports
  const rows: SmvRecord[] = useMemo(() => filteredSmv ?? smv, [filteredSmv, smv]);

  const chart = CHART_TYPES.find((c) => c.value === chartType)!;
  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? '';
  const groupLabel = GROUP_FIELDS.find((g) => g.value === groupBy)?.label ?? '';
  const otherLabel = `Other ${groupLabel.toLowerCase()}`;

  // Overall averages for the header strip
  const overall = useMemo(() => {
    const agg = emptyAgg();
    for (const r of rows) addRow(agg, r);
    return agg;
  }, [rows]);

  // All groups, before any limit
  const groups = useMemo(() => groupRows(rows, groupBy), [rows, groupBy]);

  // Single-metric charts: sorted by the chosen metric, largest first
  const data: Item[] = useMemo(() => {
    const sorted = groups
      .filter((g) => metric === 'count' || g.agg.n[metric] > 0) // avg of nothing is not 0, it is missing
      .sort((a, b) => metricValue(b.agg, metric) - metricValue(a.agg, metric));
    return topWithOther(sorted, chart.limit, otherLabel).map((g) => ({
      name: g.name,
      value: metricValue(g.agg, metric),
    }));
  }, [groups, metric, chart.limit, otherLabel]);

  // Same data with a color per slice (donut, pie, radial bar, treemap)
  const colored = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        color: d.name === otherLabel ? 'gray.5' : PALETTE[i % PALETTE.length],
      })),
    [data, otherLabel]
  );

  // Same data keyed as "Value" (bar, radar)
  const valueData = useMemo(() => data.map((d) => ({ name: d.name, Value: d.value })), [data]);

  // Zonal comparison: biggest groups (by road count) with the four averages side by side
  const compareData = useMemo(() => {
    const sorted = [...groups].sort((a, b) => b.agg.count - a.agg.count);
    return topWithOther(sorted, chart.limit, otherLabel).map((g) => ({
      name: g.name,
      ...Object.fromEntries(ZONALS.map((z) => [z.label, Math.round(avgOf(g.agg, z.key) ?? 0)])),
    }));
  }, [groups, chart.limit, otherLabel]);

  // Trend: average of each zonal type per SMV year (ignores "Group by")
  const trendData = useMemo(
    () =>
      groupRows(rows, 'smv_year')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((g) => ({
          year: g.name,
          ...Object.fromEntries(
            ZONALS.map((z) => {
              const v = avgOf(g.agg, z.key);
              return [z.label, v === null ? null : Math.round(v)];
            })
          ),
        })),
    [rows]
  );

  const zonalSeries = ZONALS.map((z) => ({ name: z.label, color: z.color }));

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart
            h="100%"
            data={valueData}
            dataKey="name"
            orientation="vertical"
            series={[{ name: 'Value', label: metricLabel, color: 'indigo.6' }]}
            yAxisProps={{ width: 120 }}
            valueFormatter={fmt}
            gridAxis="x"
            tickLine="x"
            withLegend={false}
          />
        );

      case 'compare':
        return (
          <BarChart
            h="100%"
            data={compareData}
            dataKey="name"
            orientation="vertical"
            type="default"
            series={zonalSeries}
            yAxisProps={{ width: 120 }}
            valueFormatter={fmt}
            gridAxis="x"
            tickLine="x"
            withLegend
            legendProps={{ verticalAlign: 'bottom', height: 40 }}
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
              chartLabel={metric === 'count' ? rows.length.toLocaleString() : undefined}
              valueFormatter={fmt}
              withTooltip
              tooltipDataSource="segment"
            />
            <Legend items={colored} />
          </Stack>
        );

      case 'pie':
        return (
          <Stack gap="sm" align="center">
            <PieChart
              data={colored}
              size={190}
              valueFormatter={fmt}
              withTooltip
              tooltipDataSource="segment"
            />
            <Legend items={colored} />
          </Stack>
        );

      case 'radar':
        return (
          <RadarChart
            h="100%"
            data={valueData}
            dataKey="name"
            series={[{ name: 'Value', color: 'indigo.6', opacity: 0.25 }]}
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
                    formatter={(value, _name, item) => [fmt(Number(value)), (item.payload as Item).name]}
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
                <Tooltip formatter={(value) => fmt(Number(value))} />
              </RechartsTreemap>
            </ResponsiveContainer>
          </Box>
        );

      case 'trend':
        return (
          <LineChart
            h="100%"
            data={trendData}
            dataKey="year"
            series={zonalSeries}
            curveType="linear"
            connectNulls
            withDots
            withLegend
            valueFormatter={fmt}
            legendProps={{ verticalAlign: 'bottom', height: 40 }}
          />
        );
    }
  };

  // Title under the pickers
  const title =
    chart.kind === 'trend'
      ? 'Average SMV value by SMV year'
      : chart.kind === 'zonals'
        ? `Average SMV value by ${groupLabel}`
        : `${metricLabel} by ${groupLabel}`;

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
          disabled={chart.kind === 'trend'} // the trend is always by year
          comboboxProps={{ withinPortal: true }}
          style={{ flex: 1 }}
        />
      </Group>

      {chart.kind === 'single' && (
        <Select
          size="xs"
          label="Measure"
          data={METRICS.map(({ value, label }) => ({ value, label }))}
          value={metric}
          onChange={(v) => v && setMetric(v as Metric)}
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
      )}

      <Box>
        <Text fz="sm" fw={700}>
          {title}
        </Text>
        <Text fz="xs" c="dimmed">
          {rows.length.toLocaleString()} of {smv.length.toLocaleString()} roads
        </Text>
      </Box>

      {/* Average value per zonal type for what the table is showing */}
      <Group gap="md" wrap="wrap">
        {ZONALS.map((z) => {
          const v = avgOf(overall, z.key);
          return (
            <Group key={z.key} gap={6} wrap="nowrap">
              <Box w={10} h={10} bg={z.color} style={{ borderRadius: 2, flexShrink: 0 }} />
              <Text fz="xs" c="dimmed">
                {z.label}
              </Text>
              <Text fz="xs" fw={700}>
                {v === null ? '-' : fmt(v)}
              </Text>
            </Group>
          );
        })}
      </Group>

      <Box style={{ flex: 1, minHeight: 260 }}>{renderChart()}</Box>
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
        <Box key={i.name} pos="relative" h={28} title={`${i.name}: ${fmt(i.value)}`}>
          {/* the bar itself, width relative to the largest value */}
          <Box
            pos="absolute"
            top={0}
            left={0}
            bottom={0}
            bg="indigo.1"
            style={{ width: `${Math.max((i.value / max) * 100, 2)}%`, borderRadius: 4 }}
          />

          {/* label + value sit on top of the bar */}
          <Group pos="relative" h="100%" px={8} gap={8} wrap="nowrap" justify="space-between">
            <Text fz="xs" fw={500} truncate style={{ minWidth: 0 }}>
              {i.name}
            </Text>
            <Text fz="xs" fw={700} style={{ flexShrink: 0 }}>
              {fmt(i.value)}
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
            {fmt(i.value)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
