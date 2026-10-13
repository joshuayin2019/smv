// components/map/poi_routing.tsx  (Directions tab of the POI details window)
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Loader,
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
  IconBike,
  IconCar,
  IconCurrentLocation,
  IconMapPin,
  IconRoute,
  IconTargetArrow,
  IconWalk,
} from '@tabler/icons-react';
import { ACCENT, BORDER, NAVY, PANEL_BG } from '@/lib/theme_colors';
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

interface Props {
  /** The clicked POI. Used as the default destination ("To"), which the user can change. */
  destination: { name: string; lat: number; lon: number };
  /** Called whenever the route list or selected route changes -> draw it on the map. */
  onRoutesChange?: (routes: RouteResult[], selectedIndex: number) => void;
  /** Called when the start point changes (e.g. to drop a marker). */
  onFromChange?: (place: Place | null) => void;
  /** Called when the destination changes from the clicked POI to another place (or back). */
  onToChange?: (place: Place | null) => void;
  /** Called when the user clicks the "pick on map" button; next map click should set `pickedPoint`. */
  onPickOnMap?: () => void;
  /** Set this from the parent after the user clicked the map in pick mode (sets the start point). */
  pickedPoint?: Place | null;
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

// ---------------------------------------------------------------------------
// Reusable place search input (used for both "From" and "To")
// ---------------------------------------------------------------------------
interface PlaceInputProps {
  label: string;
  placeholder?: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  /** Bias search results near this point. */
  near: { lat: number; lon: number };
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
  leftSection,
  actions,
  actionCount = 0,
  onError,
}: PlaceInputProps) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [showList, setShowList] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // keep the text in sync when the parent sets the value (my location, map pick, reset, ...)
  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);

  // debounced place search
  useEffect(() => {
    // don't search when the text is just the already selected place
    if (value && query === value.name) return;
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSearching(true);
      onError(null);
      try {
        const res = await searchPlaces(query, {
          near,
          signal: ctrl.signal,
          countrySet: 'PH', // limit to the Philippines (remove to search worldwide)
        });
        setSuggestions(res);
        setShowList(true);
      } catch (e: any) {
        if (e.name !== 'AbortError') onError(e.message);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // cancel pending request on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const pick = (p: Place) => {
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
          <ScrollArea.Autosize mah={200}>
            {suggestions.map((p, i) => (
              <UnstyledButton
                key={`${p.lat}-${p.lon}-${i}`}
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
                <Text fz={12} fw={600} c={NAVY} lineClamp={1}>
                  {p.name}
                </Text>
                {p.address && (
                  <Text fz={11} c="dimmed" lineClamp={1}>
                    {p.address}
                  </Text>
                )}
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
export default function PoiRouting({
  destination,
  onRoutesChange,
  onFromChange,
  onToChange,
  onPickOnMap,
  pickedPoint,
}: Props) {
  const poiPlace: Place = {
    name: destination.name,
    address: '',
    lat: destination.lat,
    lon: destination.lon,
  };

  // start / end points
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(poiPlace);

  // routing
  const [mode, setMode] = useState<TravelMode>('driving');
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routeAbort = useRef<AbortController | null>(null);

  // ----- helpers -----
  const clearRoutes = () => {
    routeAbort.current?.abort();
    setRoutes([]);
    setSelected(0);
    setError(null);
    setLoading(false);
    onRoutesChange?.([], 0);
  };

  const chooseFrom = (p: Place | null) => {
    setFrom(p);
    clearRoutes();
    onFromChange?.(p);
  };

  const chooseTo = (p: Place | null) => {
    setTo(p);
    clearRoutes();
    onToChange?.(p);
  };

  // when a different POI is clicked, reset "To" to that POI
  useEffect(() => {
    setTo({ name: destination.name, address: '', lat: destination.lat, lon: destination.lon });
    clearRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination.name, destination.lat, destination.lon]);

  // point picked on the map by the parent
  useEffect(() => {
    if (pickedPoint) chooseFrom(pickedPoint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedPoint]);

  // cancel pending route request when the panel closes
  useEffect(() => {
    return () => routeAbort.current?.abort();
  }, []);

  // ----- use my location -----
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        chooseFrom({
          name: 'My location',
          address: 'Current device location',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      () => setError('Could not get your location. Check browser permissions.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
        setRoutes([]);
        onRoutesChange?.([], 0);
        return;
      }
      setRoutes(result);
      setSelected(0);
      onRoutesChange?.(result, 0);
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || 'Failed to get directions.');
    } finally {
      setLoading(false);
    }
  };

  const selectRoute = (i: number) => {
    setSelected(i);
    onRoutesChange?.(routes, i);
  };

  const current = routes[selected];
  const isPoiDestination =
    !!to && to.lat === destination.lat && to.lon === destination.lon && to.name === destination.name;

  return (
    <Stack gap="sm">
      {/* Start point with search */}
      <PlaceInput
        label="From"
        placeholder="Search a place or pick on the map"
        value={from}
        onChange={chooseFrom}
        near={{ lat: destination.lat, lon: destination.lon }}
        leftSection={<IconTargetArrow size={14} />}
        onError={setError}
        actionCount={2}
        actions={
          <>
            <ActionIcon
              size="sm"
              variant="subtle"
              color={NAVY}
              title="Use my location"
              aria-label="Use my location"
              onClick={useMyLocation}
            >
              <IconCurrentLocation size={15} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color={NAVY}
              title="Pick on map"
              aria-label="Pick start point on map"
              onClick={() => onPickOnMap?.()}
            >
              <IconMapPin size={15} />
            </ActionIcon>
          </>
        }
      />

      {/* Destination: defaults to the clicked POI but can be changed */}
      <PlaceInput
        label="To"
        placeholder="Search a destination"
        value={to}
        onChange={chooseTo}
        near={{ lat: destination.lat, lon: destination.lon }}
        leftSection={<IconMapPin size={14} color={ACCENT} />}
        onError={setError}
        actionCount={isPoiDestination ? 0 : 1}
        actions={
          !isPoiDestination ? (
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
          ) : null
        }
      />

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
            {loading ? 'Finding routes…' : 'Turn-by-turn directions will appear here.'}My locatio
          </Text>
        </Box>
      )}
    </Stack>
  );
}



