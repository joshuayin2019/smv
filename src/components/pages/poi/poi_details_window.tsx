// components/map/poi_details_window.tsx  (draggable details window for the POI clicked on the map)
import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  CloseButton,
  FloatingWindow,
  Group,
  Image,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconArrowsMaximize,
  IconBike,
  IconCar,
  IconCurrentLocation,
  IconInfoCircle,
  IconMapPin,
  IconRoute,
  IconTargetArrow,
  IconView360,
  IconWalk,
} from '@tabler/icons-react';
import type * as maplibregl from 'maplibre-gl';
import { Photosphere, type PhotosphereView } from 'maplibre-gl-photosphere';
import { useGlobalStore } from '@/stores/global_stores';
import { useMapStore } from '@/stores/map_stores';
import { usePoiStore, type PoiProperties, type PoiSelection } from '@/stores/poi_stores';
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

// URL of the POI photo. Adjust this to wherever your images are served from.
// Assumes the `filename` column holds the image file name (see poi_image_route.ts).
const poiImageUrl = (filename: string) => `/api/pages/poi/images/${encodeURIComponent(filename)}`;

// URL of the 360 panorama (equirectangular, 2:1). Adjust to your own route.
// Assumes a `pano_filename` column on the POI (add it to PoiProperties in poi_stores).
const panoUrl = (filename: string) => `/api/pages/poi/panoramas/${encodeURIComponent(filename)}`;

// While you have no separate pano_filename column yet: true = treat the normal POI photo (`filename`)
// as the 360 panorama too, so the "View 360°" button shows for every POI that has a photo.
// Set to false once you have a real pano_filename column.
const PANO_FALLBACK_TO_PHOTO = true;

// URL of the panorama for a POI, or null when it has none
const getPanoUrl = (p: PoiProperties): string | null => {
  if (p.pano_filename) return panoUrl(p.pano_filename);
  if (PANO_FALLBACK_TO_PHOTO && p.filename) return poiImageUrl(p.filename);
  return null;
};

// Photosphere needs to look up/down freely, so these limits are applied only while inside it
const SPHERE_MIN_PITCH = 5;
const SPHERE_MAX_PITCH = 175;

// Some maplibre-gl versions do not have this setter, so it is typed as optional
type MapWithClamp = maplibregl.Map & { setCenterClampedToGround?: (value: boolean) => void };

// Hide the given layers and return the ids that were actually hidden (so only those are restored later).
// A hidden layer stops loading and parsing its tiles, which matters inside the photosphere: the camera
// looks at the horizon, so maplibre would otherwise request a huge number of tiles and run out of memory.
function hideLayers(map: maplibregl.Map, ids: string[]): string[] {
  const hidden: string[] = [];
  for (const id of ids) {
    try {
      if (!map.getLayer(id)) continue;
      if (map.getLayoutProperty(id, 'visibility') === 'none') continue;
      map.setLayoutProperty(id, 'visibility', 'none');
      hidden.push(id);
    } catch {
      // layer removed or style not ready
    }
  }
  return hidden;
}

function showLayers(map: maplibregl.Map, ids: string[]) {
  for (const id of ids) {
    try {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    } catch {
      // layer removed or style not ready
    }
  }
}

// Checks that an image can really be loaded (404, wrong file, etc. -> 'failed').
// The browser caches it, so the sphere opens instantly afterwards.
type ImageStatus = 'idle' | 'loading' | 'ok' | 'failed';

function useImageStatus(url: string | null): ImageStatus {
  const [state, setState] = useState<{ url: string | null; status: ImageStatus }>({ url: null, status: 'idle' });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setState({ url, status: 'ok' });
    };
    img.onerror = () => {
      if (!cancelled) setState({ url, status: 'failed' });
    };
    img.src = url;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  if (!url) return 'idle';
  return state.url === url ? state.status : 'loading'; // a result for an older url does not count
}

type Field = { label: string; value: string | number | null | undefined };

// Photo thumbnail; click it to open the full-screen viewer. Shows a small notice if the file fails to load.
function PoiImage({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  // Visible fallback (instead of silently hiding) so a broken photo is easy to diagnose
  if (failed) {
    return (
      <Box
        mb="sm"
        p="xs"
        style={{ border: `1px dashed ${BORDER}`, borderRadius: 6, textAlign: 'center' }}
      >
        <Text fz={11} c="dimmed" style={{ wordBreak: 'break-all' }}>
          Photo not available: {src}
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Box mb="sm" style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
        <Box pos="relative" style={{ cursor: 'zoom-in' }} onClick={() => setOpen(true)}>
          <Image src={src} alt={alt} h={170} fit="cover" loading="lazy" onError={() => setFailed(true)} />
          <Box
            pos="absolute"
            top={6}
            right={6}
            p={4}
            style={{
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 4,
              display: 'flex',
              pointerEvents: 'none',
            }}
          >
            <IconArrowsMaximize size={14} color="#fff" />
          </Box>
        </Box>
        {caption && (
          <Text fz={10} c="dimmed" ta="right" px="xs" py={2}>
            {caption}
          </Text>
        )}
      </Box>

      {/* Full-screen viewer (zIndex above the floating window) */}
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        fullScreen
        zIndex={2000}
        padding={0}
        title={alt}
        closeButtonProps={{ c: '#fff', 'aria-label': 'Close image' }}
        styles={{
          content: { background: '#000' },
          header: { background: '#000', color: '#fff' },
          title: { fontWeight: 600 },
          body: { height: 'calc(100dvh - 60px)' },
        }}
      >
        <Image src={src} alt={alt} fit="contain" h="100%" w="100%" />
      </Modal>
    </>
  );
}

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
  const map = useMapStore((s) => s.map);
  const selected = usePoiStore((s) => s.selectedPoi);
  const setSelected = usePoiStore((s) => s.setSelectedPoi);
  const [tab, setTab] = useState<string>('details');

  // 360 photosphere state (hooks must stay above the early returns)
  // The plugin is built to be created ONCE and then enter()/exit() many times, so the instance is
  // kept and reused for the same POI instead of creating a new one on every click.
  const sphereRef = useRef<Photosphere | null>(null);
  const sphereKeyRef = useRef<string | null>(null); // which POI the current instance belongs to
  const exitViewRef = useRef<PhotosphereView | null>(null); // camera to return to (updated before every enter)
  const prevLimitsRef = useRef<{ min: number; max: number }>({ min: 0, max: 60 });
  const baseLayersRef = useRef<string[] | null>(null); // layers that existed before the sphere was built
  const hiddenLayersRef = useRef<string[]>([]); // layers hidden while inside, restored on exit
  const insideRef = useRef(false); // mirrors `inside` so cleanups can read it without stale closures
  const [inside, setInside] = useState(false);
  const setSphereActive = usePoiStore((s) => s.setSphereActive);
  const spherePoiIdRef = useRef<number | null>(null); // POI the open sphere belongs to
  const pendingSelectionRef = useRef<PoiSelection | null>(null); // row clicked while inside the sphere

  // the "View 360°" button is only usable when its image really loads
  const panoStatus = useImageStatus(selected ? getPanoUrl(selected.properties) : null);

  // drop the current instance (used when another POI is opened or on unmount).
  // Different plugin versions name the cleanup differently, so every known name is tried safely.
  const disposeSphere = () => {
    const s = sphereRef.current as unknown as {
      remove?: () => void;
      destroy?: () => void;
      dispose?: () => void;
    } | null;
    try {
      s?.remove?.();
      s?.destroy?.();
      s?.dispose?.();
    } catch {
      // nothing to clean up
    }
    sphereRef.current = null;
    sphereKeyRef.current = null;
    exitViewRef.current = null;
    baseLayersRef.current = null;
  };

  const exitSphere = () => {
    if (!insideRef.current) return;

    // Bring the basemap back while the camera is still flying out, so its tiles are already loading
    // when the flight ends (otherwise the map stays white until the exit callback fires).
    if (map) {
      window.setTimeout(() => {
        showLayers(map, hiddenLayersRef.current);
        map.triggerRepaint();
      }, 250);
    }

    try {
      sphereRef.current?.exit();
    } catch (err) {
      console.error('Photosphere exit failed:', err instanceof Error ? err.message : err);
    }
  };

  const enterSphere = () => {
    const url = selected ? getPanoUrl(selected.properties) : null;
    if (!map || !selected || !url || insideRef.current || panoStatus !== 'ok') return;
    spherePoiIdRef.current = selected.properties.id;

    // remember the normal camera + limits so they can be restored on exit
    const c = map.getCenter();
    const view: PhotosphereView = {
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
    };
    prevLimitsRef.current = { min: map.getMinPitch(), max: map.getMaxPitch() };
    const clampMap = map as MapWithClamp;

    // the plugin must look up/down freely and place the "eye" above the ground
    map.setMinPitch(SPHERE_MIN_PITCH);
    map.setMaxPitch(SPHERE_MAX_PITCH);
    clampMap.setCenterClampedToGround?.(false);

    const restore = () => {
      insideRef.current = false;
      setInside(false);
      showLayers(map, hiddenLayersRef.current);
      hiddenLayersRef.current = [];
      setSphereActive(false);

      // make sure the map redraws with its tiles once the camera is back
      map.triggerRepaint();
      window.setTimeout(() => {
        map.resize();
        map.triggerRepaint();
      }, 600);

      // a table row was clicked while inside: select it again now that the map is free, so the map flies to it
      const pending = pendingSelectionRef.current;
      pendingSelectionRef.current = null;
      if (pending) {
        window.setTimeout(() => usePoiStore.getState().setSelectedPoi({ ...pending }), 300);
      }
      map.setMinPitch(prevLimitsRef.current.min);
      map.setMaxPitch(prevLimitsRef.current.max);
      clampMap.setCenterClampedToGround?.(true);
    };

    try {
      const key = `${selected.properties.id}|${url}`;

      if (sphereRef.current && sphereKeyRef.current === key && exitViewRef.current) {
        // same POI again: reuse the instance, just refresh the camera it returns to
        Object.assign(exitViewRef.current, view);
      } else {
        // first time, or another POI: build a fresh instance
        disposeSphere();
        baseLayersRef.current = (map.getStyle()?.layers ?? []).map((l) => l.id);
        exitViewRef.current = view;
        sphereRef.current = new Photosphere(map, {
          lngLat: [selected.lng, selected.lat],
          imageUrl: url,
          exitView: exitViewRef.current,
          onEnter: () => {
            insideRef.current = true;
            setInside(true);
            setSphereActive(true); // tells the map layer not to fly the camera while inside
            // hide the basemap + POI layers so no tiles are loaded while looking around
            hiddenLayersRef.current = hideLayers(map, baseLayersRef.current ?? []);
          },
          onExit: restore,
        });
        sphereKeyRef.current = key;
      }

      sphereRef.current.enter();
    } catch (err) {
      console.error('Photosphere enter failed:', err instanceof Error ? err.message : err);
      restore();
    }
  };

  // leaving the POI page, or unmounting, while inside -> exit cleanly
  useEffect(() => {
    if (activePage !== POI_PAGE) {
      pendingSelectionRef.current = null;
      exitSphere();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  useEffect(() => {
    return () => {
      exitSphere();
      disposeSphere();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // another table row (or nothing) got selected while inside the sphere -> leave the sphere
  useEffect(() => {
    if (!insideRef.current) return;
    if (selected && selected.properties.id === spherePoiIdRef.current) return; // same POI clicked again
    pendingSelectionRef.current = selected ?? null;
    exitSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // only on the POI page, and only after a POI was clicked
  if (activePage !== POI_PAGE || !selected) return null;

  // while inside the photosphere the details window is hidden; only an exit button is shown
  if (inside) {
    return (
      <Button
        pos="fixed"
        top={DEFAULT_TOP}
        right={20}
        style={{ zIndex: 1000 }}
        color={NAVY}
        leftSection={<IconView360 size={16} />}
        onClick={exitSphere}
      >
        Exit 360° view
      </Button>
    );
  }

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
              {p.filename && (
                <PoiImage
                  key={p.filename}
                  src={poiImageUrl(p.filename)}
                  alt={p.name || 'POI photo'}
                  caption={`POI Number: ${p.id}`}
                />
              )}

              {/* Enter the 360 photosphere captured at this POI */}
              {getPanoUrl(p) && (
                <Button
                  size="xs"
                  variant="light"
                  fullWidth
                  mb="sm"
                  leftSection={<IconView360 size={14} />}
                  disabled={panoStatus !== 'ok'}
                  loading={panoStatus === 'loading'}
                  onClick={enterSphere}
                >
                  {panoStatus === 'failed' ? '360° view not available' : 'View 360°'}
                </Button>
              )}

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
