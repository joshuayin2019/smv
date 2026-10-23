// TEMPORARY: floating mode switcher for the population layer. Delete when the real layer control exists.
import { Paper, SegmentedControl, Stack, Group, ColorSwatch, Text } from "@mantine/core";
import { usePopulationStore, type PopulationMode } from "@/stores/demographic/population_stores";
import { MODES, popBreaks } from "./map_population";

export default function PopulationModeTemp() {
  const mode = usePopulationStore((s) => s.populationMode);
  const setMode = usePopulationStore((s) => s.setPopulationMode);

  return (
    <Paper
      shadow="md"
      p="xs"
      radius="md"
      withBorder
      style={{ position: "fixed", bottom: 80, right: 16, zIndex: 1000, width: 280 }}
    >
      <Stack gap="xs">
        <Text size="xs" fw={600}>
          Population grouping
        </Text>

        <SegmentedControl
          size="xs"
          fullWidth
          value={mode}
          onChange={(v) => setMode(v as PopulationMode)}
          data={MODES.map((m) => ({ value: m.key, label: m.label }))}
        />

        <Stack gap={4}>
          {popBreaks(mode).map((b) => (
            <Group key={b.min} gap="xs" wrap="nowrap">
              <ColorSwatch color={b.color} size={14} />
              <Text size="xs">{b.label}</Text>
            </Group>
          ))}
        </Stack>
      </Stack>
    </Paper>
  );
}