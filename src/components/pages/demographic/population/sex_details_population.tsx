import { Box, Group, Stack, Text } from '@mantine/core';
import { populationSexSvg } from '@/lib/pages/demographic/population/population_categories';

export default function PopulationSexDetails({ name, male, female }: { name: string; male: number | string; female: number | string }) {
  return (
    <Group p="sm" gap="lg" wrap="wrap" bg="var(--mantine-color-gray-0)" aria-label={`${name} population by sex`}>
      <svg width={80} height={80} viewBox="0 0 100 100" role="img" aria-label="Male and female population"
        dangerouslySetInnerHTML={{ __html: populationSexSvg(male, female) }} />
      <Stack gap={4}>
        <Text size="xs" fw={700}>{name}</Text>
        <Group gap="lg">
          <Box><Text size="xs" c="#0784ff">Male</Text><Text size="sm" fw={600}>{Number(male ?? 0).toLocaleString()}</Text></Box>
          <Box><Text size="xs" c="#d97800">Female</Text><Text size="sm" fw={600}>{Number(female ?? 0).toLocaleString()}</Text></Box>
        </Group>
      </Stack>
    </Group>
  );
}
