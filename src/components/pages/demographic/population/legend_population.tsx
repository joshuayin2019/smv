import { Box, Group, Stack, Text } from '@mantine/core';
import { usePopulationStore } from '@/stores/demographic/population_stores';
import { MODES, popBreaks } from './map_population';

export default function LegendPopulation() {
  const mode = usePopulationStore(s => s.populationMode);
  const ranges = popBreaks(mode);
  return (
    <Stack gap="xs" p="sm">
      <Text size="sm" fw={700}>Population</Text>
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
    </Stack>
  );
}
