// components/map/smv_details_window.tsx  (draggable details window for the SMV road selected on the map or in the table)
import { Badge, Box, CloseButton, FloatingWindow, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { useSmvStore } from '@/stores/smv_stores';
import { ACCENT, BORDER, NAVY, NAVY_DEEP } from '@/lib/theme_colors';

// Default position = top-left of the map area. Adjust these two numbers to match your layout
// (header height / navbar width).
const DEFAULT_TOP = 55;
const DEFAULT_LEFT = 260;

// Size of the window and how far the user can resize it (px)
const DIMENSIONS = {
  initialWidth: 320,
  minWidth: 280,
  maxWidth: 600,
  initialHeight: 360,
  minHeight: 260,
  maxHeight: 700,
};

type Zonal = { key: string; label: string; color: string };

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

type Props = {
  zonals: Zonal[]; // passed in from SmvLayer (ZONALS), which avoids a circular import
};

export default function SmvDetailsWindow({ zonals }: Props) {
  const selected = useSmvStore((s) => s.selectedSmv);
  const setSelected = useSmvStore((s) => s.setSelectedSmv);

  // only after a road was selected (map click or table row)
  if (!selected) return null;

  // the record comes from the store (or from the tile properties), so read it loosely
  const p = selected as unknown as Record<string, any>;
  const values = zonals
    .map((z) => ({ ...z, value: Number(p[z.key]) }))
    .filter((z) => Number.isFinite(z.value) && z.value > 0);

  return (
    <FloatingWindow
      // the key resets the window position/size state only when you want it to; leaving it out keeps
      // the window where the user dragged it between selections
      initialPosition={{ top: DEFAULT_TOP, left: DEFAULT_LEFT }}
      dragHandleSelector=".smv-details-handle"
      excludeDragHandleSelector=".smv-details-close"
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
        className="smv-details-handle"
        justify="space-between"
        wrap="nowrap"
        px="xs"
        h={34}
        style={{ background: NAVY_DEEP, cursor: 'move', userSelect: 'none', flexShrink: 0 }}
      >
        <Text fz={13} fw={700} c="#fff" truncate>
          SMV Details
        </Text>
        <CloseButton
          className="smv-details-close"
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
            {p.street || '(no street name)'}
          </Text>
          {p.fclass && (
            <Badge size="sm" variant="light" mb="sm">
              {p.fclass}
            </Badge>
          )}

          <Stack gap={6}>
            <Row label="Road ID" value={p.id} />
            <Row label="Barangay" value={p.bgy_name} />
            <Row label="City / Municipality" value={p.mun_name} />
            <Row label="Province" value={p.pro_name} />
            <Row label="Region" value={p.reg_name ?? p.region} />
            <Row label="SMV year" value={p.smv_year} />
          </Stack>

          {/* Zonal values, with the same colors as the map lines */}
          <Box mt="sm" pt="sm" style={{ borderTop: `1px solid ${BORDER}` }}>
            <Text fz={11} fw={700} c="dimmed" tt="uppercase" mb={6}>
              Zonal values
            </Text>
            {values.length === 0 ? (
              <Text fz={12} c="dimmed">
                No zonal values
              </Text>
            ) : (
              <Stack gap={6}>
                {values.map((z) => (
                  <Group key={z.key} gap="xs" wrap="nowrap" justify="space-between">
                    <Group gap={6} wrap="nowrap">
                      <Box
                        w={12}
                        h={12}
                        style={{ background: z.color, borderRadius: 3, flexShrink: 0 }}
                      />
                      <Text fz={12} c="dimmed">
                        {z.label}
                      </Text>
                    </Group>
                    <Text fz={12} fw={600} c={NAVY}>
                      {z.value.toLocaleString()}
                    </Text>
                  </Group>
                ))}
              </Stack>
            )}
          </Box>
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
