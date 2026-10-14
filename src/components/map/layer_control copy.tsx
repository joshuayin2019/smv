"use client";
import { Checkbox, Group, Paper, Slider, Stack, Switch, Text } from "@mantine/core";
import { useMapStore } from "@/stores/map_stores";
import { ZONALS } from "../pages/smv/map_smv";

export default function LayerControl() {
    const smv = useMapStore((s) => s.smv);
    const poiVisible = useMapStore((s) => s.poiVisible);
    const setSmv = useMapStore((s) => s.setSmv);
    const toggleZonal = useMapStore((s) => s.toggleZonal);
    const setPoiVisible = useMapStore((s) => s.setPoiVisible);

  return (
    <Paper
      shadow="sm"
      p="xs"
      radius="sm"
      w={200}
      style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}
    >
      <Stack gap="xs">
        <Text size="xs" fw={600}>Layers</Text>

        <Switch
          size="xs"
          label="Points of Interest"
          checked={poiVisible}
          onChange={(e) => setPoiVisible(e.currentTarget.checked)}
        />

        <Switch
          size="xs"
          label="SMV"
          checked={smv.visible}
          onChange={(e) => setSmv({ visible: e.currentTarget.checked })}
        />

        {smv.visible && (
          <Stack gap={4} pl="md">
            {ZONALS.map((z) => (
              <Checkbox
                key={z.key}
                size="xs"
                color={z.color}
                label={
                  <Group gap={6}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: z.color }} />
                    {z.label}
                  </Group>
                }
                checked={smv.enabled[z.key]}
                onChange={(e) => toggleZonal(z.key, e.currentTarget.checked)}
              />
            ))}
            <Text size="xs" c="dimmed" mt={4}>Opacity</Text>
            <Slider
              size="xs"
              min={0.1}
              max={1}
              step={0.05}
              value={smv.opacity}
              onChange={(v) => setSmv({ opacity: v })}
              label={(v) => `${Math.round(v * 100)}%`}
            />
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}