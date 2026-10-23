import { Box, Group, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { YEAR_BUILT_CATEGORIES } from '@/lib/pages/demographic/year_built/year_built_categories';
import { useYearBuiltStore } from '@/stores/demographic/year_built_stores';

export default function LegendYearBuilt() {
  const hoverEnabled = useYearBuiltStore(s => s.boundaryHoverEnabled);
  const setHoverEnabled = useYearBuiltStore(s => s.setBoundaryHoverEnabled);
  const status = useYearBuiltStore(s => s.chartStatus);
  return (
    <Stack gap="xs" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={700}>Buildings: Year Built</Text>
        <Tooltip label="Show details when hovering over boundaries or pie charts">
          <Switch size="xs" label="Hover details" labelPosition="left" aria-label="Boundary and pie-chart hover details" style={{ flexShrink: 0 }}
            checked={hoverEnabled} onChange={event => setHoverEnabled(event.currentTarget.checked)} />
        </Tooltip>
      </Group>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 16px' }}>
        {[0, 1].map(column => (
          <Stack key={column} gap={6}>
            {YEAR_BUILT_CATEGORIES.slice(column * 4, column * 4 + 4).map(category => (
              <Group key={category.field} gap="xs" wrap="nowrap">
                <Box w={12} h={12} style={{ background: category.color, flexShrink: 0 }} />
                <Text size="xs">{category.label}</Text>
              </Group>
            ))}
          </Stack>
        ))}
      </Box>
      <Text size="xs">Unknown: not reported</Text>
      <Text size="xs" c="dimmed">Slices show shares of reported years.</Text>
      <Text size="xs" c="dimmed">Overlapping charts are hidden. Zoom in to reveal them.</Text>
      {status && <Text size="xs" role="status">{status}</Text>}
    </Stack>
  );
}
