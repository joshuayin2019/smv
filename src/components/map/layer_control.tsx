"use client";
import { useEffect, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Collapse,
  Group,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconStack2Filled } from "@tabler/icons-react";
import { useMapStore } from "@/stores/map_stores";
import { ACCENT, BORDER, NAVY, NAVY_DEEP } from "@/lib/theme_colors";
import { setBasemap, type Basemap } from "@/lib/basemap";
import { ZONALS, MIN_ZOOM, overviewColor } from "@/components/pages/smv/map_smv"; // adjust path

const POSITION = { position: "absolute", top: 10, right: 10, zIndex: 3 } as const;

export default function LayerControl() {
  const [opened, setOpened] = useState(false); // whole panel
  const [smvOpen, setSmvOpen] = useState(true); // SMV section
  const [basemap, setBasemapState] = useState<Basemap>("streets");

  const map = useMapStore((s) => s.map);
  const smv = useMapStore((s) => s.smv);
  const poiVisible = useMapStore((s) => s.poiVisible);
  const setSmv = useMapStore((s) => s.setSmv);
  const toggleZonal = useMapStore((s) => s.toggleZonal);
  const setPoiVisible = useMapStore((s) => s.setPoiVisible);

  // Apply the basemap whenever the choice (or the map instance) changes
  useEffect(() => {
    if (!map) return;
    setBasemap(map, basemap);
  }, [map, basemap]);

  // true while the map shows the single-color SMV overview (zoom < MIN_ZOOM).
  // Storing a boolean means React only re-renders when the mode actually flips.
  const [overview, setOverview] = useState(true);
  useEffect(() => {
    if (!map) return;
    const update = () => setOverview(map.getZoom() < MIN_ZOOM);
    update();
    map.on("zoom", update);
    return () => {
      map.off("zoom", update);
    };
  }, [map]);

  const overviewSwatch = overviewColor(smv.enabled);

  // Collapsed: just the icon button
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

  return (
    <Paper
      withBorder
      radius="md"
      shadow="lg"
      bg="white"
      w={230}
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

      <Box p="sm">
        <Stack gap="xs">
          {/* Basemap */}
          <Text fz={11} fw={600} c={NAVY}>
            Basemap
          </Text>
          <SegmentedControl
            size="xs"
            fullWidth
            color={NAVY}
            value={basemap}
            onChange={(v) => setBasemapState(v as Basemap)}
            data={[
              { label: "OpenFreeMap", value: "streets" },
              { label: "Satellite", value: "satellite" },
            ]}
          />

          <Switch
            size="xs"
            color={NAVY}
            label="Points of Interest"
            styles={{ label: { color: NAVY, fontWeight: 500 } }}
            checked={poiVisible}
            onChange={(e) => setPoiVisible(e.currentTarget.checked)}
          />

          {/* SMV row: switch + collapse arrow */}
          <Group justify="space-between" wrap="nowrap">
            <Switch
              size="xs"
              color={NAVY}
              label="SMV"
              styles={{ label: { color: NAVY, fontWeight: 500 } }}
              checked={smv.visible}
              onChange={(e) => setSmv({ visible: e.currentTarget.checked })}
            />
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={smvOpen ? "Collapse SMV options" : "Expand SMV options"}
              onClick={() => setSmvOpen((o) => !o)}
            >
              <IconChevronDown
                size={14}
                style={{
                  transform: smvOpen ? "rotate(180deg)" : "none",
                  transition: "transform 150ms ease",
                }}
              />
            </ActionIcon>
          </Group>

          <Collapse expanded={smv.visible && smvOpen}>
            <Stack gap={6} pl="md">
              {/* Mode note: explains why the map color may differ from the swatches */}
              {overview ? (
                <Box p={6} style={{ background: "#f1f3f5", borderRadius: 4 }}>
                  <Group gap={6} wrap="nowrap" align="flex-start">
                    <span
                      style={{
                        width: 12,
                        height: 3,
                        marginTop: 6,
                        flexShrink: 0,
                        borderRadius: 2,
                        background: overviewSwatch,
                      }}
                    />
                    <Text fz={11} c={NAVY} lh={1.35}>
                      Overview: one color for every road that has a value in a checked type.
                    </Text>
                  </Group>
                  <Button
                    mt={4}
                    size="compact-xs"
                    variant="light"
                    fullWidth
                    onClick={() => map?.easeTo({ zoom: MIN_ZOOM, duration: 600 })}
                  >
                    Zoom in to see type colors
                  </Button>
                </Box>
              ) : (
                <Text fz={11} c="dimmed">
                  Colored by zonal type
                </Text>
              )}

              <Text fz={11} fw={600} c={NAVY}>
                {overview ? "Show roads with:" : "Zonal types"}
              </Text>

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
                          // dimmed in overview: these colors are not what the map shows yet
                          opacity: overview ? 0.35 : 1,
                          transition: "opacity 150ms ease",
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
          </Collapse>
        </Stack>
      </Box>
    </Paper>
  );
}
