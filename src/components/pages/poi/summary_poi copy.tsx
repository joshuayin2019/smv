import { useMemo } from 'react';
import { Box, Stack, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { usePoiStore } from '@/stores/poi_stores';

const TOP_N = 10;
const OTHER_LABEL = 'Other category';

export default function SummaryPOI() {
  const poi = usePoiStore((s) => s.poi);

  // Count POIs per category, keep the top N and group the rest as "Other category"
  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of poi.features) {
      const key = f.properties.category || 'Uncategorized';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = Array.from(counts, ([category, count]) => ({ category, count })).sort(
      (a, b) => b.count - a.count
    );

    const top = sorted.slice(0, TOP_N);
    const rest = sorted.slice(TOP_N).reduce((sum, r) => sum + r.count, 0);
    if (rest > 0) top.push({ category: OTHER_LABEL, count: rest });
    return top;
  }, [poi]);

  return (
    <Stack gap="xs" p="xs" h="100%" style={{ overflow: 'auto' }}>
      <Text fz="sm" fw={700}>
        POIs by Category
      </Text>

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