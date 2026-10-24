// FILE: src/components/.../layer_control.tsx
"use client";
import { useEffect, useState } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  CloseButton,
  Collapse,
  Divider,
  Group,
  Paper,
  Radio,
  ScrollArea,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconStack2Filled } from "@tabler/icons-react";
import { useMapStore, type BoundaryType } from "@/stores/map_stores";
import { useGlobalStore } from "@/stores/global_stores";
import { ACCENT, BORDER, NAVY, NAVY_DEEP } from "@/lib/theme_colors";
import { setBasemap, type Basemap } from "@/lib/basemap";
import { ZONALS, MIN_ZOOM, overviewColor } from "@/components/pages/smv/map_smv"; // adjust path
import { PARCEL_CLASSES } from '@/lib/pages/parcel/parcel_types';

// Zoom from which each boundary is drawn (keep in sync with MIN_ZOOM in its layer file)
const BOUNDARY_MIN_ZOOM: Partial<Record<BoundaryType, number>> = {
  municipality: 10,
  barangay: 14,
};

// Which boundary radio belongs to which page. Tolerant match, so "Region", "City / Municipality",
// "boundary/city" ... all work. Pages that are not a boundary page return null (radio is left alone).
function boundaryTypeFromPage(page: string): BoundaryType | null {
  const p = page.toLowerCase();
  if (p.includes("barangay")) return "barangay";
  if (p.includes("municipal") || p.includes("city")) return "municipality";
  if (p.includes("province")) return "province";
  if (p.includes("region")) return "region";
  return null;
}

const POSITION = { position: "absolute", top: 10, right: 10, zIndex: 5 } as const;

// Max height of the scrollable body: viewport minus title bar (34px), top border (3px),
// top offset (10px), the header above the map, and a bottom margin. Tune to taste.
const BODY_MAX_HEIGHT = "calc(100vh - 120px)";

export default function LayerControl() {
  const [opened, setOpened] = useState(false); // whole panel
  const [smvOpen, setSmvOpen] = useState(false); // SMV section true
  const [parcelOpen, setParcelOpen] = useState(false);
  const [boundaryOpen, setBoundaryOpen] = useState(false); // Boundary section
  const [basemap, setBasemapState] = useState<Basemap>("streets");

  const activePage = useGlobalStore((s) => s.activePage);

  const map = useMapStore((s) => s.map);
  const smv = useMapStore((s) => s.smv);
  const poiVisible = useMapStore((s) => s.poiVisible);
  const setSmv = useMapStore((s) => s.setSmv);
  const toggleZonal = useMapStore((s) => s.toggleZonal);
  const setPoiVisible = useMapStore((s) => s.setPoiVisible);
  const parcel = useMapStore(s => s.parcel);
  const setParcel = useMapStore(s => s.setParcel);
  const toggleParcelClass = useMapStore(s => s.toggleParcelClass);

  const boundary = useMapStore((s) => s.boundary);
  const setBoundary = useMapStore((s) => s.setBoundary);

  // Apply the basemap whenever the choice (or the map instance) changes
  useEffect(() => {
    if (!map) return;
    setBasemap(map, basemap);
  }, [map, basemap]);

  // When a boundary page is opened (Region, Province, City / Municipality, Barangay),
  // select the matching radio. Only runs when the page changes, so the user can still
  // pick another radio by hand afterwards.
  useEffect(() => {
    const type = boundaryTypeFromPage(String(activePage ?? ""));
    if (type) setBoundary({ type });
  }, [activePage, setBoundary]);

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
      {/* Title bar (stays fixed, only the body below scrolls) */}
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

      <ScrollArea.Autosize
        mah={BODY_MAX_HEIGHT}
        type="auto"
        scrollbars="y"
        offsetScrollbars="y"
        scrollbarSize={10}
      >
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
            <Group
              justify="space-between"
              wrap="nowrap"
              onClick={() => setSmvOpen((o) => !o)}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              {/* the switch has its own click: it must not also collapse the section */}
              <Box onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
                <Switch
                  size="xs"
                  color={NAVY}
                  label="SMV"
                  styles={{ label: { color: NAVY, fontWeight: 500 } }}
                  checked={smv.visible}
                  onChange={(e) => setSmv({ visible: e.currentTarget.checked })}
                />
              </Box>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={smvOpen ? "Collapse SMV options" : "Expand SMV options"}
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
                    Colored by classification
                  </Text>
                )}

                <Text fz={11} fw={600} c={NAVY}>
                  {overview ? "Show roads with:" : "SMV Types"}
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

            <Group justify="space-between" wrap="nowrap" onClick={() => setParcelOpen(v => !v)} style={{ cursor: 'pointer', userSelect: 'none' }}>
              <Box onClick={e => e.stopPropagation()} style={{ cursor: 'default' }}>
                <Switch size="xs" color={NAVY} label="Parcels" styles={{ label: { color: NAVY, fontWeight: 500 } }}
                  checked={parcel.visible} onChange={e => setParcel({ visible: e.currentTarget.checked })} />
              </Box>
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label={parcelOpen ? 'Collapse parcel options' : 'Expand parcel options'}>
                <IconChevronDown size={14} style={{ transform: parcelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }} />
              </ActionIcon>
            </Group>
            <Collapse expanded={parcel.visible && parcelOpen}>
              <Stack gap={6} pl="md">
                <Text fz={11} c="dimmed">Shown on the Parcels page from zoom 12. Colored by classification.</Text>
                <Text fz={11} fw={600} c={NAVY}>Parcel Types</Text>
                {[...PARCEL_CLASSES, { name: 'Other / Unspecified', color: '#94a3b8' }].map((c,i) => {
                  const key = i === PARCEL_CLASSES.length ? 'other' : c.name.toLowerCase();
                  return <Checkbox key={key} size="xs" color={c.color} checked={parcel.enabled[key]}
                    onChange={e => toggleParcelClass(key,e.currentTarget.checked)}
                    label={<Group gap={6} wrap="nowrap">
                      <span style={{ width: 10,height: 10,borderRadius: 2,background: c.color,display: 'inline-block' }} />
                      <Text fz={12} c={NAVY}>{c.name}</Text>
                    </Group>} />;
                })}
                <Text fz={11} c="dimmed" mt={4}>Opacity</Text>
                <Slider size="xs" color={NAVY} min={0.1} max={1} step={0.05} value={parcel.opacity}
                  onChange={v => setParcel({ opacity: v })} label={v => `${Math.round(v*100)}%`} />
              </Stack>
            </Collapse>

            {/* Divider between data layers and boundaries */}
            <Divider my={4} color={BORDER} />

            {/* Boundary row: switch (turns every boundary on/off) + collapse arrow */}
            <Group
              justify="space-between"
              wrap="nowrap"
              onClick={() => setBoundaryOpen((o) => !o)}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              {/* the switch has its own click: it must not also collapse the section */}
              <Box onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
                <Switch
                  size="xs"
                  color={NAVY}
                  label="Boundary"
                  styles={{ label: { color: NAVY, fontWeight: 500 } }}
                  checked={boundary.visible}
                  onChange={(e) => setBoundary({ visible: e.currentTarget.checked })}
                />
              </Box>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={
                  boundaryOpen ? "Collapse boundary options" : "Expand boundary options"
                }
              >
                <IconChevronDown
                  size={14}
                  style={{
                    transform: boundaryOpen ? "rotate(180deg)" : "none",
                    transition: "transform 150ms ease",
                  }}
                />
              </ActionIcon>
            </Group>

            <Collapse expanded={boundary.visible && boundaryOpen}>
              <Stack gap={6} pl="md">
                <Radio.Group
                  value={boundary.type}
                  onChange={(v) => setBoundary({ type: v as BoundaryType })}
                >
                  <Stack gap={6}>
                    <Radio
                      size="xs"
                      color={NAVY}
                      value="region"
                      label="Region"
                      styles={{ label: { color: NAVY, fontWeight: 500 } }}
                    />
                    <Radio
                      size="xs"
                      color={NAVY}
                      value="province"
                      label="Province"
                      styles={{ label: { color: NAVY, fontWeight: 500 } }}
                    />
                    <Radio
                      size="xs"
                      color={NAVY}
                      value="municipality"
                      label="Municipality"
                      styles={{ label: { color: NAVY, fontWeight: 500 } }}
                    />
                    <Radio
                      size="xs"
                      color={NAVY}
                      value="barangay"
                      label="Barangay"
                      styles={{ label: { color: NAVY, fontWeight: 500 } }}
                    />
                  </Stack>
                </Radio.Group>

                <Checkbox
                  size="xs"
                  color={NAVY}
                  label="Hoverable"
                  styles={{ label: { color: NAVY, fontWeight: 500 } }}
                  checked={boundary.hoverable}
                  onChange={(e) => setBoundary({ hoverable: e.currentTarget.checked })}
                />

                {BOUNDARY_MIN_ZOOM[boundary.type] !== undefined && (
                  <Text fz={11} c="dimmed">
                    Shown from zoom {BOUNDARY_MIN_ZOOM[boundary.type]}.
                  </Text>
                )}
                {boundary.hoverable && (
                  <Text fz={11} c="dimmed">
                    Hover a boundary to see its name.
                  </Text>
                )}
                <Text fz={11} c="dimmed" mt={4}>
                  Opacity
                </Text>
                <Slider
                  size="xs"
                  color={NAVY}
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={boundary.opacity}
                  onChange={(v) => setBoundary({ opacity: v })}
                  label={(v) => `${Math.round(v * 100)}%`}
                />
              </Stack>
            </Collapse>
          </Stack>
        </Box>
      </ScrollArea.Autosize>
    </Paper>
  );
}
