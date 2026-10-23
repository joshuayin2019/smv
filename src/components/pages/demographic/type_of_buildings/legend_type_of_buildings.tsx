import { Box, Group, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { BUILDING_TYPE_CATEGORIES } from '@/lib/pages/demographic/type_of_buildings/type_of_buildings_categories';
import { useBuildingTypeStore } from '@/stores/demographic/type_of_buildings_stores';

export default function LegendBuildingType() {
  const hoverEnabled = useBuildingTypeStore(s => s.boundaryHoverEnabled);
  const setHoverEnabled = useBuildingTypeStore(s => s.setBoundaryHoverEnabled);
  const status = useBuildingTypeStore(s => s.chartStatus);
  return (
    <Stack gap="xs" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={700}>Buildings: Type</Text>
        <Tooltip label="Show details when hovering over boundaries or pie charts">
          <Switch size="xs" label="Hover details" labelPosition="left" aria-label="Boundary and pie-chart hover details" style={{ flexShrink: 0 }}
            checked={hoverEnabled} onChange={event => setHoverEnabled(event.currentTarget.checked)} />
        </Tooltip>
      </Group>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 16px' }}>
        {[0, 1].map(column => (
          <Stack key={column} gap={6}>
            {BUILDING_TYPE_CATEGORIES.slice(column * 4, column * 4 + 4).map(category => (
              <Group key={category.field} gap="xs" wrap="nowrap">
                <Box w={12} h={12} style={{ background: category.color, flexShrink: 0 }} />
                <Text size="xs">{category.label}</Text>
              </Group>
            ))}
          </Stack>
        ))}
      </Box>
      <Text size="xs" c="dimmed">Slices show shares of reported types.</Text>
      <Text size="xs" c="dimmed">Overlapping charts are hidden. Zoom in to reveal them.</Text>
      {status && <Text size="xs" role="status">{status}</Text>}
    </Stack>
  );
}
