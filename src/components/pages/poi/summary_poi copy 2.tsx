import { useMemo } from 'react';
import { Box, Stack, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { usePoiStore } from '@/stores/poi_stores';

const TOP_N = 10;
const OTHER_LABEL = 'Other category';

export default function SummaryPOI() {
  const poi = usePoiStore((s) => s.poi);
  const filteredPoi = usePoiStore((s) => s.filteredPoi);

  // Use what the table is showing; fall back to all POIs until the table reports
  const rows = useMemo(
    () => filteredPoi ?? poi.features.map((f) => f.properties),
    [filteredPoi, poi]
  );

  // Count POIs per category, keep the top N and group the rest as "Other category"
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = r.category || 'Uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = Array.from(counts, ([category, count]) => ({ category, count })).sort(
      (a, b) => b.count - a.count
    );

    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N).reduce((sum, r) => sum + r.count, 0);
    if (rest > 0) top.push({ category: OTHER_LABEL, count: rest });
    return top;
  }, [rows]);

  return (
    <Stack gap="xs" p="xs" h="100%" style={{ overflow: 'auto' }}>
      <Box>
        <Text fz="sm" fw={700}>
          POIs by Category
        </Text>
        <Text fz="xs" c="dimmed">
          {rows.length.toLocaleString()} of {poi.features.length.toLocaleString()} POIs
        </Text>
      </Box>

      <Box style={{ flex: 1, minHeight: 240 }}>
        <BarChart
          h="100%"
          data={data}
          dataKey="category"
          orientation="vertical"
          series={[{ name: 'count', label: 'POIs', color: 'blue.6' }]}
          yAxisProps={{ width: 120 }}
          gridAxis="x"
          tickLine="x"
          withLegend={false}
        />
      </Box>
    </Stack>
  );
}