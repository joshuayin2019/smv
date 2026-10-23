import { Box, Group, Stack, Switch, Text, Tooltip } from '@mantine/core';
import { POPULATION_CATEGORIES } from '@/lib/pages/demographic/population/population_categories';
import { usePopulationStore } from '@/stores/demographic/population_stores';
import { MODES, popBreaks } from './map_population';

export default function LegendPopulation() {
  const mode = usePopulationStore(s => s.populationMode);
  const ranges = popBreaks(mode);
  const hoverEnabled = usePopulationStore(s => s.boundaryHoverEnabled);
  const setHoverEnabled = usePopulationStore(s => s.setBoundaryHoverEnabled);
  const status = usePopulationStore(s => s.chartStatus);
  return (
    <Stack gap="xs" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={700}>Population</Text>
        <Tooltip label="Show details when hovering over boundaries or male/female markers">
          <Switch size="xs" label="Hover details" labelPosition="left" checked={hoverEnabled}
            onChange={event => setHoverEnabled(event.currentTarget.checked)} />
        </Tooltip>
      </Group>
      <Group gap="lg">
        {POPULATION_CATEGORIES.map(category => (
          <Group key={category.field} gap={6}><Box w={12} h={12} style={{ background: category.color }} /><Text size="xs">{category.label}</Text></Group>
        ))}
      </Group>
      <Text size="xs" c="dimmed">Ring markers show male/female shares. Hover for counts and percentages; expand table rows for counts.</Text>
      <Text size="xs" c="dimmed">{MODES.find(item => item.key === mode)?.label} · Number of people</Text>
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 16px' }}>
        {[0, 1].map(column => (
          <Stack key={column} gap={6}>
            {ranges.slice(column * 3, column * 3 + 3).map(range => (
              <Group key={range.min} gap="xs" wrap="nowrap">
                <Box w={12} h={12} style={{ background: range.color, border: '1px solid #0002', flexShrink: 0 }} />
                <Text size="xs">{range.label}</Text>
              </Group>
            ))}
          </Stack>
        ))}
      </Box>
      <Text size="xs" c="dimmed">Colors show the population of each area. Ranges change with the geographic mode.</Text>
      <Group gap="xs" wrap="nowrap">
        <Box w={12} h={12} style={{ border: '2px solid #ff2d55', flexShrink: 0 }} />
        <Text size="xs">Selected area</Text>
      </Group>
      {status && <Text size="xs" role="status">{status}</Text>}
    </Stack>
  );
}
