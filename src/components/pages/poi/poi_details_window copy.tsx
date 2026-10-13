// components/map/poi_details_window.tsx  (draggable details window for the POI clicked on the map)
import { Badge, Box, CloseButton, FloatingWindow, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useGlobalStore } from '@/stores/global_stores';
import { usePoiStore } from '@/stores/poi_stores';
import { ACCENT, NAVY, NAVY_DEEP } from '@/lib/theme_colors';

const POI_PAGE = 'Point of Interest'; // activePage value of the POI navbar item

// Default position = top-left of the map area. Adjust these two numbers to match your layout
// (header height / navbar width).
const DEFAULT_TOP = 90;
const DEFAULT_LEFT = 260;

// Size of the window and how far the user can resize it (px)
const DIMENSIONS = {
  initialWidth: 320,
  minWidth: 320,
  maxWidth: 700,
  initialHeight: 380,
  minHeight: 320,
  maxHeight: 700,
};

type Field = { label: string; value: string | number | null | undefined };

function Row({ label, value }: Field) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start" justify="space-between">
      <Text fz={12} c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text fz={12} fw={500} c={NAVY} ta="right" style={{ wordBreak: 'break-word' }}>
        {value}
      </Text>
    </Group>
  );
}

export default function PoiDetailsWindow() {
  const activePage = useGlobalStore((s) => s.activePage);
  const selected = usePoiStore((s) => s.selectedPoi);
  const setSelected = usePoiStore((s) => s.setSelectedPoi);

  // only on the POI page, and only after a POI was clicked
  if (activePage !== POI_PAGE || !selected) return null;

  const p = selected.properties;

  return (
    <FloatingWindow
      initialPosition={{ top: DEFAULT_TOP, left: DEFAULT_LEFT }}
      dragHandleSelector=".poi-details-handle"
      excludeDragHandleSelector=".poi-details-close"
      constrainToViewport
      constrainOffset={4}
      zIndex={1000}
      dimensions={DIMENSIONS}
      withBorder
      radius="md"
      shadow="lg"
      bg="white"
      style={{
        overflow: 'hidden',
        borderTop: `3px solid ${ACCENT}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Title bar = drag handle */}
      <Group
        className="poi-details-handle"
        justify="space-between"
        wrap="nowrap"
        px="xs"
        h={34}
        style={{ background: NAVY_DEEP, cursor: 'move', userSelect: 'none', flexShrink: 0 }}
      >
        <Text fz={13} fw={700} c="#fff" truncate>
          POI Details
        </Text>
        <CloseButton
          className="poi-details-close"
          size="sm"
          c="#fff"
          variant="transparent"
          aria-label="Close details"
          onClick={() => setSelected(null)}
        />
      </Group>

      {/* The body fills whatever height the window has and scrolls when the content is taller */}
      <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }}>
        <Box p="sm">
          <Text fz={14} fw={700} c={NAVY} mb={4}>
            {p.name || 'Unnamed POI'}
          </Text>
          {p.category && (
            <Badge size="sm" variant="light" mb="sm">
              {p.category}
            </Badge>
          )}

          <Stack gap={6}>
            <Row label="Foot traffic" value={p.ft_traffic !== null ? p.ft_traffic?.toLocaleString() : null} />
            <Row label="Road" value={p.rd_name} />
            <Row label="Barangay" value={p.barangay} />
            <Row label="City / Municipality" value={p.city_municipality} />
            <Row label="Province" value={p.province} />
            <Row label="Region" value={p.region} />
            <Row label="As of" value={p.as_of} />
            <Row label="Coordinates" value={`${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}`} />
          </Stack>
        </Box>
      </ScrollArea>

      {/* Resize grip, bottom-right corner (also works with the arrow keys when focused) */}
      <FloatingWindow.ResizeHandle
        aria-label="Resize details window"
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'nwse-resize',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.5 }} aria-hidden="true">
          <path d="M11 1 1 11M11 5 5 11M11 9 9 11" stroke={NAVY} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </FloatingWindow.ResizeHandle>
    </FloatingWindow>
  );
}
