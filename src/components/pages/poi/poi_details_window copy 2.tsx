// components/map/poi_details_window.tsx  (draggable details window for the POI clicked on the map)
import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CloseButton,
  FloatingWindow,
  Group,
  ScrollArea,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconBike,
  IconCar,
  IconCurrentLocation,
  IconInfoCircle,
  IconMapPin,
  IconRoute,
  IconTargetArrow,
  IconWalk,
} from '@tabler/icons-react';
import { useGlobalStore } from '@/stores/global_stores';
import { usePoiStore } from '@/stores/poi_stores';
import { ACCENT, BORDER, NAVY, NAVY_DEEP, PANEL_BG } from '@/lib/theme_colors';

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

// ----- Directions tab (DESIGN ONLY: nothing is routed yet) ---------------------
type TravelMode = 'driving' | 'walking' | 'cycling';

function modeLabel(icon: React.ReactNode, text: string) {
  return (
    <Group gap={4} wrap="nowrap" justify="center">
      {icon}
      <span>{text}</span>
    </Group>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Box
      flex={1}
      px="xs"
      py={6}
      style={{ border: `1px solid ${BORDER}`, borderRadius: 6, background: PANEL_BG }}
    >
      <Text fz={10} c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text fz={16} fw={700} c={NAVY}>
        {value}
      </Text>
    </Box>
  );
}

function DirectionsPanel({ destination }: { destination: string }) {
  // local UI state only; wire these to the routing logic later
  const [from, setFrom] = useState('');
  const [mode, setMode] = useState<TravelMode>('driving');

  return (
    <Stack gap="sm">
      {/* Start point */}
      <TextInput
        size="xs"
        label="From"
        placeholder="Type a place or pick on the map"
        leftSection={<IconTargetArrow size={14} />}
        value={from}
        onChange={(e) => setFrom(e.currentTarget.value)}
        rightSectionWidth={56}
        rightSection={
          <Group gap={2} wrap="nowrap">
            <ActionIcon
              size="sm"
              variant="subtle"
              color={NAVY}
              title="Use my location"
              aria-label="Use my location"
              onClick={() => {
                /* TODO: fill "From" with the device location */
              }}
            >
              <IconCurrentLocation size={15} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color={NAVY}
              title="Pick on map"
              aria-label="Pick start point on map"
              onClick={() => {
                /* TODO: next map click sets the start point */
              }}
            >
              <IconMapPin size={15} />
            </ActionIcon>
          </Group>
        }
      />

      {/* Destination = the clicked POI (read only) */}
      <TextInput
        size="xs"
        label="To"
        value={destination}
        readOnly
        leftSection={<IconMapPin size={14} color={ACCENT} />}
      />

      {/* Travel mode */}
      <SegmentedControl
        size="xs"
        fullWidth
        value={mode}
        onChange={(v) => setMode(v as TravelMode)}
        data={[
          { value: 'driving', label: modeLabel(<IconCar size={14} />, 'Drive') },
          { value: 'walking', label: modeLabel(<IconWalk size={14} />, 'Walk') },
          { value: 'cycling', label: modeLabel(<IconBike size={14} />, 'Cycle') },
        ]}
      />

      <Button
        size="xs"
        color={NAVY}
        leftSection={<IconRoute size={14} />}
        onClick={() => {
          /* TODO: request the route and draw it on the map */
        }}
      >
        Get directions
      </Button>

      {/* Result summary (placeholders until routing is connected) */}
      <Group gap="xs" wrap="nowrap">
        <SummaryTile label="Distance" value="— km" />
        <SummaryTile label="Duration" value="— min" />
      </Group>

      {/* Turn-by-turn list (empty state) */}
      <Box
        p="sm"
        style={{ border: `1px dashed ${BORDER}`, borderRadius: 6, textAlign: 'center' }}
      >
        <Text fz={12} c="dimmed">
          Turn-by-turn directions will appear here.
        </Text>
      </Box>
    </Stack>
  );
}

export default function PoiDetailsWindow() {
  const activePage = useGlobalStore((s) => s.activePage);
  const selected = usePoiStore((s) => s.selectedPoi);
  const setSelected = usePoiStore((s) => s.setSelectedPoi);
  const [tab, setTab] = useState<string>('details');

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

      {/* Tab switcher */}
      <Tabs value={tab} onChange={(v) => setTab(v ?? 'details')} style={{ flexShrink: 0 }}>
        <Tabs.List grow>
          <Tabs.Tab value="details" fz={12} leftSection={<IconInfoCircle size={14} />}>
            Details
          </Tabs.Tab>
          <Tabs.Tab value="directions" fz={12} leftSection={<IconRoute size={14} />}>
            Directions
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {/* The body fills whatever height the window has and scrolls when the content is taller */}
      <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }}>
        <Box p="sm">
          {tab === 'details' ? (
            <>
              <Text fz={14} fw={700} c={NAVY} mb={4}>
                {p.name || 'Unnamed POI'}
              </Text>
              {p.category && (
                <Badge size="sm" variant="light" mb="sm">
                  {p.category}
                </Badge>
              )}

              <Stack gap={6}>
                <Row
                  label="Foot traffic"
                  value={p.ft_traffic !== null ? p.ft_traffic?.toLocaleString() : null}
                />
                <Row label="Road" value={p.rd_name} />
                <Row label="Barangay" value={p.barangay} />
                <Row label="City / Municipality" value={p.city_municipality} />
                <Row label="Province" value={p.province} />
                <Row label="Region" value={p.region} />
                <Row label="As of" value={p.as_of} />
                <Row
                  label="Coordinates"
                  value={`${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}`}
                />
              </Stack>
            </>
          ) : (
            <DirectionsPanel destination={p.name || 'Selected POI'} />
          )}
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
