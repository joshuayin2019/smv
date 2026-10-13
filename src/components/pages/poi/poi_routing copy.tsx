// pages/poi/poi_routing.tsx  (Directions tab of the POI details window)
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconArrowsUpDown,
  IconBike,
  IconCar,
  IconCheck,
  IconCurrentLocation,
  IconMapPin,
  IconRoute,
  IconSearch,
  IconTargetArrow,
  IconWalk,
} from '@tabler/icons-react';
import { ACCENT, BORDER, NAVY, PANEL_BG } from '@/lib/theme_colors';
import { usePoiStore } from '@/stores/poi_stores';
import {
  formatClock,
  formatDistance,
  formatDuration,
  getRoutes,
  searchPlaces,
  type Place,
  type RouteResult,
  type TravelMode,
} from '@/lib/openroute';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SearchMode = 'poi' | 'api' | 'all';
type Suggestion = Place & { source: 'poi' | 'api' };
type PickTarget = 'from' | 'to';

const MODE_LABEL: Record<SearchMode, string> = {
  poi: 'POI data',
  api: 'Route service',
  all: 'Both',
};

const MENU_Z_INDEX = 10000;

interface Props {
  /** The clicked POI. Used as the default destination ("To"), which the user can change. */
  destination: { name: string; lat: number; lon: number };
}

function modeLabel(icon: ReactNode, text: string) {
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

/** Turn the POI GeoJSON into a flat, de-duplicated, sorted list of places. */
function buildPoiPlaces(poiData?: { features?: any[] } | null): Suggestion[] {
  const feats = poiData?.features;
  if (!Array.isArray(feats)) return [];
  const seen = new Map<string, Suggestion>();
  for (const f of feats) {
    const c = f?.geometry?.coordinates;
    const p = f?.properties ?? {};
    const name: string | undefined = p.name;
    if (!name || !Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    if (seen.has(name)) continue;
    seen.set(name, {
      name,
      address: [p.rd_name, p.barangay, p.city_municipality, p.region].filter(Boolean).join(', '),
      lon: c[0], // GeoJSON order is [lon, lat]
      lat: c[1],
      source: 'poi',
    });
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Local search: names that start with the text first, then names/addresses that contain it. */
function filterPois(list: Suggestion[], q: string, limit = 8): Suggestion[] {
  const ql = q.toLowerCase();
  const starts: Suggestion[] = [];
  const contains: Suggestion[] = [];
  for (const p of list) {
    const n = p.name.toLowerCase();
    if (n.startsWith(ql)) starts.push(p);
    else if (n.includes(ql) || p.address.toLowerCase().includes(ql)) contains.push(p);
  }
  return [...starts, ...contains].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Suggestion source menu (shown inside the From / To fields)
// ---------------------------------------------------------------------------
function SourceMenu({
  mode,
  onChange,
  hasPoi,
}: {
  mode: SearchMode;
  onChange: (m: SearchMode) => void;
  hasPoi: boolean;
}) {
  const item = (value: SearchMode, text: string, disabled = false) => (
    <Menu.Item
      key={value}
      disabled={disabled}
      color={mode === value ? NAVY : undefined}
      fw={mode === value ? 700 : 400}
      rightSection={mode === value ? <IconCheck size={14} /> : null}
      onClick={() => onChange(value)}
    >
      {text}
    </Menu.Item>
  );

  return (
    <Menu
      position="bottom-end"
      withinPortal
      zIndex={MENU_Z_INDEX}
      shadow="md"
      width={170}
      closeOnItemClick
    >
      <Menu.Target>
        <ActionIcon
          size="sm"
          variant="subtle"
          color={NAVY}
          title={`Suggestions from: ${MODE_LABEL[mode]}`}
          aria-label="Choose where suggestions come from"
        >
          <IconSearch size={15} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Suggestions from</Menu.Label>
        {item('poi', MODE_LABEL.poi, !hasPoi)}
        {item('api', MODE_LABEL.api)}
        {item('all', MODE_LABEL.all, !hasPoi)}
      </Menu.Dropdown>
    </Menu>
  );
}

// ---------------------------------------------------------------------------
// Reusable place search input (used for both "From" and "To")
// ---------------------------------------------------------------------------
interface PlaceInputProps {
  label: string;
  placeholder?: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  /** Bias API search results near this point. */
  near: { lat: number; lon: number };
  searchMode: SearchMode;
  poiPlaces: Suggestion[];
  leftSection: ReactNode;
  /** Extra buttons shown on the right side of the input. */
  actions?: ReactNode;
  actionCount?: number;
  onError: (msg: string | null) => void;
}

function PlaceInput({
  label,
  placeholder,
  value,
  onChange,
  near,
  searchMode,
  poiPlaces,
  leftSection,
  actions,
  actionCount = 0,
  onError,
}: PlaceInputProps) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showList, setShowList] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // keep the text in sync when the parent sets the value (my location, map pick, reset, ...)
  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);

  // place search (local POIs and/or OpenRouteService geocoder, depending on the mode)
  useEffect(() => {
    // don't search when the text is just the already selected place
    if (value && query === value.name) return;
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    const local = searchMode === 'api' ? [] : filterPois(poiPlaces, q);

    // POI only -> instant, no network
    if (searchMode === 'poi') {
      setSuggestions(local);
      setShowList(true);
      return;
    }

    // "Both" -> show POI matches immediately while the API results load
    if (searchMode === 'all') {
      setSuggestions(local);
      setShowList(local.length > 0);
    }

    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      onError(null);
      try {
        const res = await searchPlaces(q, {
          near,
          signal: ctrl.signal,
          countrySet: 'PH', // limit to the Philippines (remove to search worldwide)
        });
        const api: Suggestion[] = res.map((p) => ({ ...p, source: 'api' }));
        const seen = new Set(local.map((p) => p.name.toLowerCase()));
        setSuggestions([...local, ...api.filter((p) => !seen.has(p.name.toLowerCase()))]);
        setShowList(true);
      } catch (e: any) {
        if (e.name !== 'AbortError') onError(e.message);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchMode, poiPlaces]);

  // cancel pending request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const pick = (p: Suggestion) => {
    setQuery(p.name);
    setSuggestions([]);
    setShowList(false);
    onChange(p);
  };

  const rightWidth = actionCount * 26 + (searching ? 22 : 0) + 8;

  return (
    <Box pos="relative">
      <TextInput
        size="xs"
        label={label}
        placeholder={placeholder}
        leftSection={leftSection}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          if (value) onChange(null); // typing invalidates the selected place
        }}
        onFocus={() => suggestions.length > 0 && setShowList(true)}
        onBlur={() => setTimeout(() => setShowList(false), 150)}
        rightSectionWidth={rightWidth}
        rightSection={
          <Group gap={2} wrap="nowrap">
            {searching && <Loader size={12} />}
            {actions}
          </Group>
        }
      />

      {showList && suggestions.length > 0 && (
        <Paper
          withBorder
          shadow="md"
          radius="sm"
          pos="absolute"
          style={{ top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 2 }}
        >
          <ScrollArea.Autosize mah={220}>
            {suggestions.map((p, i) => (
              <UnstyledButton
                key={`${p.source}-${p.lat}-${p.lon}-${i}`}
                w="100%"
                px="xs"
                py={6}
                // onMouseDown so it fires before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                style={{ borderBottom: `1px solid ${BORDER}` }}
              >
                <Group gap="xs" wrap="nowrap" justify="space-between" align="flex-start">
                  <Box style={{ minWidth: 0 }}>
                    <Text fz={12} fw={600} c={NAVY} lineClamp={1}>
                      {p.name}
                    </Text>
                    {p.address && (
                      <Text fz={11} c="dimmed" lineClamp={1}>
                        {p.address}
                      </Text>
                    )}
                  </Box>
                  {searchMode === 'all' && (
                    <Badge size="xs" variant="light" color={p.source === 'poi' ? NAVY : 'gray'}>
                      {p.source === 'poi' ? 'POI' : 'API'}
                    </Badge>
                  )}
                </Group>
              </UnstyledButton>
            ))}
          </ScrollArea.Autosize>
        </Paper>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function PoiRouting({ destination }: Props) {
  const poiPlace: Place = {
    name: destination.name,
    address: '',
    lat: destination.lat,
    lon: destination.lon,
  };

  // shared state (the map layer in map_poi.tsx draws it)
  const poi = usePoiStore((s) => s.poi);
  const from = usePoiStore((s) => s.routeFrom);
  const to = usePoiStore((s) => s.routeTo);
  const routes = usePoiStore((s) => s.routes);
  const selected = usePoiStore((s) => s.selectedRoute);
  const picking = usePoiStore((s) => s.pickingFrom); // true while waiting for a map click (From or To)
  const pickedPoint = usePoiStore((s) => s.pickedPoint);
  const setRouteFrom = usePoiStore((s) => s.setRouteFrom);
  const setRouteTo = usePoiStore((s) => s.setRouteTo);
  const setRoutes = usePoiStore((s) => s.setRoutes);
  const setPickingFrom = usePoiStore((s) => s.setPickingFrom);
  const resetRoute = usePoiStore((s) => s.resetRoute);

  // suggestion source
  const poiPlaces = useMemo(() => buildPoiPlaces(poi), [poi]);
  const hasPoi = poiPlaces.length > 0;
  const [searchMode, setSearchMode] = useState<SearchMode>(hasPoi ? 'all' : 'api');

  // if POI data disappears, fall back to the API
  useEffect(() => {
    if (!hasPoi && searchMode !== 'api') setSearchMode('api');
  }, [hasPoi, searchMode]);

  // routing (local UI state only)
  const [mode, setMode] = useState<TravelMode>('driving');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // which field the next map click belongs to (local UI state)
  const [pickTarget, setPickTarget] = useState<PickTarget>('from');
  // bumped on swap so both inputs remount and re-read their text from the new value
  const [swapKey, setSwapKey] = useState(0);

  const routeAbort = useRef<AbortController | null>(null);

  // ----- helpers -----
  const clearRoutes = () => {
    routeAbort.current?.abort();
    setRoutes([], 0);
    setError(null);
    setLoading(false);
  };

  const chooseFrom = (p: Place | null) => {
    setRouteFrom(p);
    clearRoutes();
  };

  const chooseTo = (p: Place | null) => {
    setRouteTo(p);
    clearRoutes();
  };

  // when a different POI is clicked, reset "To" to that POI
  useEffect(() => {
    setRouteTo({ name: destination.name, address: '', lat: destination.lat, lon: destination.lon });
    clearRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.name, destination.lat, destination.lon]);

  // point picked on the map (map_poi.tsx sets it after the click) -> goes to From or To
  useEffect(() => {
    if (!pickedPoint) return;
    if (pickTarget === 'to') chooseTo(pickedPoint);
    else chooseFrom(pickedPoint);
    setPickingFrom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedPoint]);

  // when the tab closes: cancel pending requests and clear the route + markers from the map
  useEffect(() => {
    return () => {
      routeAbort.current?.abort();
      resetRoute();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- use my location (From or To) -----
  const useMyLocation = (target: PickTarget) => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const place: Place = {
          name: 'My location',
          address: 'Current device location',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        if (target === 'to') chooseTo(place);
        else chooseFrom(place);
      },
      () => setError('Could not get your location. Check browser permissions.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ----- pick on map (From or To) -----
  const togglePick = (target: PickTarget) => {
    if (picking && pickTarget === target) {
      setPickingFrom(false); // clicking the active button cancels
      return;
    }
    setPickTarget(target);
    setPickingFrom(true);
  };

  // ----- swap From and To -----
  const swapPlaces = () => {
    const oldFrom = from;
    const oldTo = to;
    setPickingFrom(false);
    setRouteFrom(oldTo);
    setRouteTo(oldFrom);
    setSwapKey((k) => k + 1);
    clearRoutes();
  };

  // ----- get routes -----
  const requestRoutes = async () => {
    if (!from || !to) return;
    routeAbort.current?.abort();
    const ctrl = new AbortController();
    routeAbort.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const result = await getRoutes(from, to, mode, ctrl.signal);
      if (result.length === 0) {
        setError('No route found between these two points.');
        setRoutes([], 0);
        return;
      }
      setRoutes(result, 0);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || 'Failed to get directions.');
    } finally {
      setLoading(false);
    }
  };

  const selectRoute = (i: number) => setRoutes(routes, i);

  const current = routes[selected];
  const isPoiDestination =
    !!to && to.lat === destination.lat && to.lon === destination.lon && to.name === destination.name;

  const sourceMenu = <SourceMenu mode={searchMode} onChange={setSearchMode} hasPoi={hasPoi} />;

  const myLocationButton = (target: PickTarget) => (
    <ActionIcon
      size="sm"
      variant="subtle"
      color={NAVY}
      title="Use my location"
      aria-label={`Use my location as ${target === 'from' ? 'start point' : 'destination'}`}
      onClick={() => useMyLocation(target)}
    >
      <IconCurrentLocation size={15} />
    </ActionIcon>
  );

  const pickOnMapButton = (target: PickTarget) => {
    const active = picking && pickTarget === target;
    return (
      <ActionIcon
        size="sm"
        variant={active ? 'filled' : 'subtle'}
        color={active ? ACCENT : NAVY}
        title="Pick on map"
        aria-label={`Pick ${target === 'from' ? 'start point' : 'destination'} on map`}
        onClick={() => togglePick(target)}
      >
        <IconMapPin size={15} />
      </ActionIcon>
    );
  };

  return (
    <Stack gap="sm">
      {/* From / To with swap button on the right */}
      <Group gap="xs" wrap="nowrap" align="center">
        <Stack gap="sm" flex={1} style={{ minWidth: 0 }}>
          {/* Start point with search */}
          <PlaceInput
            key={`from-${swapKey}`}
            label="From"
            placeholder="Search a place or pick on the map"
            value={from}
            onChange={chooseFrom}
            near={{ lat: destination.lat, lon: destination.lon }}
            searchMode={searchMode}
            poiPlaces={poiPlaces}
            leftSection={<IconTargetArrow size={14} />}
            onError={setError}
            actionCount={3}
            actions={
              <>
                {sourceMenu}
                {myLocationButton('from')}
                {pickOnMapButton('from')}
              </>
            }
          />

          {/* Destination: defaults to the clicked POI but can be changed */}
          <PlaceInput
            key={`to-${swapKey}`}
            label="To"
            placeholder="Search a destination or pick on the map"
            value={to}
            onChange={chooseTo}
            near={{ lat: destination.lat, lon: destination.lon }}
            searchMode={searchMode}
            poiPlaces={poiPlaces}
            leftSection={<IconMapPin size={14} color={ACCENT} />}
            onError={setError}
            actionCount={isPoiDestination ? 3 : 4}
            actions={
              <>
                {sourceMenu}
                {myLocationButton('to')}
                {pickOnMapButton('to')}
                {!isPoiDestination && (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={NAVY}
                    title="Reset to selected POI"
                    aria-label="Reset destination to selected POI"
                    onClick={() => chooseTo(poiPlace)}
                  >
                    <IconTargetArrow size={15} />
                  </ActionIcon>
                )}
              </>
            }
          />
        </Stack>

        <ActionIcon
          variant="light"
          color={NAVY}
          size="md"
          mt={18}
          disabled={!from && !to}
          title="Swap From and To"
          aria-label="Swap start point and destination"
          onClick={swapPlaces}
        >
          <IconArrowsUpDown size={16} />
        </ActionIcon>
      </Group>

      {picking && (
        <Text fz={11} c={ACCENT} fw={600} mt={-6}>
          Click anywhere on the map to set the {pickTarget === 'from' ? 'start point' : 'destination'}…
        </Text>
      )}

      {/* Travel mode: appears once a start point is chosen */}
      {from && (
        <SegmentedControl
          size="xs"
          fullWidth
          value={mode}
          onChange={(v) => {
            setMode(v as TravelMode);
            clearRoutes();
          }}
          data={[
            { value: 'driving', label: modeLabel(<IconCar size={14} />, 'Drive') },
            { value: 'walking', label: modeLabel(<IconWalk size={14} />, 'Walk') },
            { value: 'cycling', label: modeLabel(<IconBike size={14} />, 'Cycle') },
          ]}
        />
      )}

      <Button
        size="xs"
        color={NAVY}
        disabled={!from || !to}
        loading={loading}
        leftSection={<IconRoute size={14} />}
        onClick={requestRoutes}
      >
        Get directions
      </Button>

      {error && (
        <Alert color="red" p="xs" icon={<IconAlertCircle size={14} />}>
          <Text fz={12}>{error}</Text>
        </Alert>
      )}

      {/* Route chooser (1 - 3 routes) */}
      {routes.length > 1 && (
        <SegmentedControl
          size="xs"
          fullWidth
          value={String(selected)}
          onChange={(v) => selectRoute(Number(v))}
          data={routes.map((r, i) => ({
            value: String(i),
            label: (
              <Stack gap={0} align="center">
                <Text fz={11} fw={700}>
                  Route {i + 1}
                </Text>
                <Text fz={10} c="dimmed">
                  {formatDuration(r.durationS)}
                </Text>
              </Stack>
            ),
          }))}
        />
      )}

      {/* Summary */}
      <Group gap="xs" wrap="nowrap">
        <SummaryTile label="Distance" value={current ? formatDistance(current.distanceM) : '— km'} />
        <SummaryTile label="Duration" value={current ? formatDuration(current.durationS) : '— min'} />
      </Group>

      {current && (
        <Group gap="xs" wrap="nowrap">
          <SummaryTile label="Arrive" value={formatClock(current.arrivalTime)} />
        </Group>
      )}

      {/* Turn-by-turn */}
      {current && current.steps.length > 0 ? (
        <ScrollArea.Autosize mah={220}>
          <Stack gap={0}>
            {current.steps.map((s, i) => (
              <Group
                key={i}
                gap="xs"
                wrap="nowrap"
                align="flex-start"
                py={6}
                style={{ borderBottom: `1px solid ${BORDER}` }}
              >
                <Text fz={11} c="dimmed" w={22} ta="right">
                  {i + 1}.
                </Text>
                <Box flex={1}>
                  <Text fz={12}>{s.message}</Text>
                  <Text fz={10} c="dimmed">
                    {formatDistance(s.distanceFromStart)} from start
                  </Text>
                </Box>
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      ) : (
        <Box p="sm" style={{ border: `1px dashed ${BORDER}`, borderRadius: 6, textAlign: 'center' }}>
          <Text fz={12} c="dimmed">
            {loading ? 'Finding routes…' : 'Turn-by-turn directions will appear here.'}
          </Text>
        </Box>
      )}
    </Stack>
  );
}