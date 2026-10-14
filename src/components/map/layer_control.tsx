"use client";
import { useState } from "react";
import {
  ActionIcon,
  Box,
  Checkbox,
  CloseButton,
  Group,
  Paper,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconStack2Filled } from "@tabler/icons-react";
import { useMapStore } from "@/stores/map_stores";
import { ACCENT, BORDER, NAVY, NAVY_DEEP } from "@/lib/theme_colors";
import { ZONALS } from "@/components/pages/smv/map_smv"; // adjust to where map_smv.tsx lives

const POSITION = { position: "absolute", top: 10, right: 10, zIndex: 3 } as const;

export default function LayerControl() {
  const [opened, setOpened] = useState(false); // collapsed by default; use true to start expanded

  const smv = useMapStore((s) => s.smv);
  const poiVisible = useMapStore((s) => s.poiVisible);
  const setSmv = useMapStore((s) => s.setSmv);
  const toggleZonal = useMapStore((s) => s.toggleZonal);
  const setPoiVisible = useMapStore((s) => s.setPoiVisible);

  // Collapsed: just the icon button, in the same navy as the title bar
  if (!opened) {
    return (
      <Tooltip label="Layers" position="left" withArrow>
        <ActionIcon
          size="lg"
          radius="md"
          aria-label="Show layers"
          onClick={() => setOpened(true)}
          style={{
            ...POSITION,
            background: NAVY_DEEP,
            color: "#fff",
            borderTop: `3px solid ${ACCENT}`,
            boxShadow: "var(--mantine-shadow-lg)",
          }}
        >
          <IconStack2Filled size={20} />
        </ActionIcon>
      </Tooltip>
    );
  }

  // Expanded: same look as the POI Details window
  return (
    <Paper
      withBorder
      radius="md"
      shadow="lg"
      bg="white"
      w={220}
      style={{
        ...POSITION,
        overflow: "hidden",
        borderColor: BORDER,
        borderTop: `3px solid ${ACCENT}`,
      }}
    >
      {/* Title bar */}
      <Group
        justify="space-between"
        wrap="nowrap"
        px="xs"
        h={34}
        style={{ background: NAVY_DEEP, userSelect: "none" }}
      >
        <Group gap={6} wrap="nowrap">
          <IconStack2Filled size={16} color="#fff" />
          <Text fz={13} fw={700} c="#fff">
            Layers
          </Text>
        </Group>
        <CloseButton
          size="sm"
          c="#fff"
          variant="transparent"
          aria-label="Hide layers"
          onClick={() => setOpened(false)}
        />
      </Group>

      {/* Body */}
      <Box p="sm">
        <Stack gap="xs">
          <Switch
            size="xs"
            color={NAVY}
            label="Points of Interest"
            styles={{ label: { color: NAVY, fontWeight: 500 } }}
            checked={poiVisible}
            onChange={(e) => setPoiVisible(e.currentTarget.checked)}
          />

          <Switch
            size="xs"
            color={NAVY}
            label="SMV"
            styles={{ label: { color: NAVY, fontWeight: 500 } }}
            checked={smv.visible}
            onChange={(e) => setSmv({ visible: e.currentTarget.checked })}
          />

          {smv.visible && (
            <Stack gap={6} pl="md">
              {ZONALS.map((z) => (
                <Checkbox
                  key={z.key}
                  size="xs"
                  color={z.color}
                  label={
                    <Group gap={6} wrap="nowrap">
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: z.color,
                          display: "inline-block",
                        }}
                      />
                      <Text fz={12} c={NAVY}>
                        {z.label}
                      </Text>
                    </Group>
                  }
                  checked={smv.enabled[z.key]}
                  onChange={(e) => toggleZonal(z.key, e.currentTarget.checked)}
                />
              ))}

              <Text fz={11} c="dimmed" mt={4}>
                Opacity
              </Text>
              <Slider
                size="xs"
                color={NAVY}
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
      </Box>
    </Paper>
  );
}