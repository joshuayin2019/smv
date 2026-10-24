import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Badge, Box, Button, CloseButton, FloatingWindow, Group, ScrollArea, Stack, Text } from '@mantine/core';
import { IconFocus2, IconMinus, IconPlus } from '@tabler/icons-react';
import { useParcelStore } from '@/stores/parcel_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { useMapStore } from '@/stores/map_stores';
import { basePath } from '@/lib/config';
import { ACCENT, BORDER, NAVY, NAVY_DEEP } from '@/lib/theme_colors';
import { PARCEL_CLASSES } from '@/lib/pages/parcel/parcel_types';

function Row({ label,value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <Group gap="xs" wrap="nowrap" align="flex-start" justify="space-between">
    <Text fz={12} c="dimmed" style={{ flexShrink: 0 }}>{label}</Text>
    <Text fz={12} fw={500} c={NAVY} ta="right" style={{ wordBreak: 'break-word' }}>{value}</Text>
  </Group>;
}

export default function ParcelDetailsWindow({ onLocate }: { onLocate: () => void }) {
  const selected = useParcelStore(s => s.selected);
  const select = useParcelStore(s => s.select);
  const active = useGlobalStore(s => s.activePage === 'Parcels');
  const map = useMapStore(s => s.map);
  const [minimized,setMinimized] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setMinimized(false); setError(''); setLoading(false);
    return () => { controller.current?.abort(); };
  },[selected?.id,active]);
  if (!active || !selected) return null;
  const color = PARCEL_CLASSES.find(c => c.name.toLowerCase() === selected.classification?.toLowerCase())?.color || 'gray';
  const locate = async () => {
    controller.current?.abort();
    const ctrl = new AbortController(); controller.current = ctrl;
    setLoading(true); setError('');
    try {
      const response = await fetch(`${basePath}/api/pages/parcel?id=${encodeURIComponent(selected.id)}`,{ signal: ctrl.signal });
      if (!response.ok) throw new Error('Unable to locate this parcel.');
      const detail = await response.json();
      const b = detail.bounds;
      if (map && Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)) {
        onLocate();
        map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{ padding: 60,maxZoom: 18,duration: 700 });
      }
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to locate parcel.'); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  };
  return <FloatingWindow initialPosition={{ top: 90,left: 260 }}
    dragHandleSelector=".parcel-details-handle" excludeDragHandleSelector=".parcel-details-close"
    constrainToViewport constrainOffset={4} zIndex={1000}
    dimensions={{ initialWidth: 320,minWidth: 280,maxWidth: 700,initialHeight: 380,minHeight: 280,maxHeight: 700 }}
    withBorder radius="md" shadow="lg" bg="white"
    style={{ overflow: 'hidden',borderTop: `3px solid ${ACCENT}`,display: 'flex',flexDirection: 'column',height: minimized ? 37 : undefined }}>
    <Group className="parcel-details-handle" justify="space-between" wrap="nowrap" px="xs" h={34}
      style={{ background: NAVY_DEEP,cursor: 'move',userSelect: 'none',flexShrink: 0 }}>
      <Text fz={13} fw={700} c="white" truncate>Parcel Details</Text>
      <Group gap={2} className="parcel-details-close">
        <ActionIcon size="sm" c="white" variant="transparent" aria-label={minimized ? 'Expand parcel details' : 'Minimize parcel details'} aria-expanded={!minimized} onClick={() => setMinimized(v => !v)}>
          {minimized ? <IconPlus size={16}/> : <IconMinus size={16}/>}
        </ActionIcon>
        <CloseButton size="sm" c="white" variant="transparent" aria-label="Close parcel details" onClick={() => select(null)}/>
      </Group>
    </Group>
    <Box style={{ flex: 1,minHeight: 0,display: minimized ? 'none' : 'flex',flexDirection: 'column' }}>
      <ScrollArea type="auto" style={{ flex: 1,minHeight: 0 }}><Box p="sm">
        <Text fz={14} fw={700} c={NAVY} mb={4}>{selected.parcel_name || selected.parcel_id}</Text>
        <Badge size="sm" variant="light" color={color} mb="sm">{selected.classification || 'Unspecified'}</Badge>
        <Stack gap={6}>
          <Row label="ID" value={selected.id}/><Row label="Parcel ID" value={selected.parcel_id}/>
          <Row label="Barangay" value={selected.bgy_name}/><Row label="City / Municipality" value={selected.mun_name}/>
          <Row label="Province" value={selected.pro_name}/><Row label="Region" value={selected.reg_name}/>
          <Row label="Address" value={selected.address}/><Row label="Source" value={selected.source}/>
          <Row label="As of" value={selected.as_of?.slice(0,10)}/><Row label="Remarks" value={selected.remarks}/>
        </Stack>
        {selected.source?.startsWith('synthetic-') && <Text fz={11} c="dimmed" mt="sm" pt="sm" style={{ borderTop: `1px solid ${BORDER}` }}>Synthetic sample parcel; not a cadastral or ownership record.</Text>}
        {error && <Alert color="red" mt="sm" p="xs">{error}</Alert>}
        <Button size="xs" variant="light" fullWidth mt="sm" leftSection={<IconFocus2 size={14}/>} disabled={!map} loading={loading} onClick={locate}>Locate on map</Button>
      </Box></ScrollArea>
      <FloatingWindow.ResizeHandle aria-label="Resize parcel details window" style={{ position: 'absolute',right: 0,bottom: 0,width: 20,height: 20,display: 'flex',alignItems: 'center',justifyContent: 'center',cursor: 'nwse-resize' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.5 }} aria-hidden="true"><path d="M11 1 1 11M11 5 5 11M11 9 9 11" stroke={NAVY} strokeWidth="1.5" strokeLinecap="round"/></svg>
      </FloatingWindow.ResizeHandle>
    </Box>
  </FloatingWindow>;
}
