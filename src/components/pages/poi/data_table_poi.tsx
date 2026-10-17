import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  NumberInput,
  Text,
  TextInput,
  ActionIcon,
} from '@mantine/core';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import {
  IconColumns3,
  IconCurrentLocation,
  IconFilterOff,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import {
  usePoiStore,
  emptyRadius,
  MIN_RADIUS_M,
  type PoiProperties,
} from '@/stores/poi_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

// One row from /api/pages/poi/table: the POI record + its position + distance (only with a radius)
type PoiRow = PoiProperties & {
  lng: number | null;
  lat: number | null;
  distance_km: number | null;
};

type TableResponse = {
  total: number; // matching rows, counted up to a cap on the server
  capped: boolean; // true = there are more matches than `total` ("100,000+")
  browsable: number; // rows the pagination can reach (the server does not allow deep paging)
  rows: PoiRow[];
};

// The response + the row offset of the page it holds
type LoadedPage = TableResponse & { offset: number };

// A radius filter that is fully filled in (center + distance)
type ActiveRadius = { lat: number; lng: number; km: number };

// The server returns exactly one page of this size. The page count is computed from the total.
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Same value as MAX_BROWSABLE in poi_table_sql.ts: the server does not page deeper than this.
// The page count is computed here from the total, so it does not depend on the server's `browsable`.
const MAX_BROWSABLE = 10_000;

const DISTANCE_COL_WIDTH = 120;

// Background of the selected row
const SELECTED_BG = 'var(--mantine-color-blue-1)';

const TABLE_URL = '/api/pages/poi/table';
const LOCATE_URL = '/api/pages/poi/table/locate';

// Answer of the locate route: where one POI sits in the current result
type LocateResponse = {
  found: boolean; // the POI is part of the current result
  reachable: boolean; // its page is within the pages the table can open
  page: number | null; // 1-based page of the POI
};

// All columns the user can show/hide, with a default width in px (the user can resize them)
const COLUMN_DEFS: {
  accessor: keyof PoiRow;
  title: string;
  width: number;
  textAlign?: 'left' | 'right';
}[] = [
  { accessor: 'id', title: 'ID', width: 90, textAlign: 'right' },
  { accessor: 'name', title: 'Name', width: 240 },
  { accessor: 'category', title: 'Category', width: 160 },
  { accessor: 'barangay', title: 'Barangay', width: 160 },
  { accessor: 'city_municipality', title: 'City / Municipality', width: 190 },
  { accessor: 'province', title: 'Province', width: 260 },
  { accessor: 'region', title: 'Region', width: 200 },
  { accessor: 'district', title: 'District', width: 120 },
  { accessor: 'rd_name', title: 'Road', width: 160 },
  { accessor: 'ft_traffic', title: 'Foot Traffic', width: 120, textAlign: 'right' },
  { accessor: 'as_of', title: 'As Of', width: 100 },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);

// Columns that get a text search in the header (the server knows the same keys)
const FILTER_KEYS = ['category', 'region', 'province', 'city_municipality', 'barangay'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string>;

const EMPTY_FILTERS: Filters = {
  category: '',
  region: '',
  province: '',
  city_municipality: '',
  barangay: '',
};

const DEFAULT_SORT: DataTableSortStatus<PoiRow> = { columnAccessor: 'name', direction: 'asc' };
const DISTANCE_SORT: DataTableSortStatus<PoiRow> = { columnAccessor: 'distance_km', direction: 'asc' };

// Everything that decides WHICH rows the server returns and in what order (no paging).
// The string form is also the key of the request and is shared with the summary chart.
function buildQuery(o: {
  scopeKey: string;
  search: string;
  filters: Filters;
  sort: DataTableSortStatus<PoiRow>;
  radius: ActiveRadius | null;
}): string {
  const sp = new URLSearchParams();
  sp.set('scope', o.scopeKey);
  if (o.search.trim()) sp.set('search', o.search.trim());

  const active = Object.fromEntries(
    FILTER_KEYS.filter((k) => o.filters[k].trim() !== '').map((k) => [k, o.filters[k].trim()])
  );
  if (Object.keys(active).length > 0) sp.set('filters', JSON.stringify(active));

  sp.set('sort', String(o.sort.columnAccessor));
  sp.set('dir', o.sort.direction);

  if (o.radius) {
    sp.set('lat', String(o.radius.lat));
    sp.set('lng', String(o.radius.lng));
    sp.set('km', String(o.radius.km));
  }
  return sp.toString();
}

// ---------------------------------------------------------------------------
// Header filter: a plain text box. The server matches the text against the column (contains, any case).
// ---------------------------------------------------------------------------
function ColumnFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
}) {
  return (
    <TextInput
      size="xs"
      label={label}
      placeholder={`Search ${label.toLowerCase()}`}
      leftSection={<IconSearch size={14} />}
      rightSection={
        value ? (
          <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => onChange('')}>
            <IconX size={12} />
          </ActionIcon>
        ) : null
      }
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

export default function DataTablePOI() {
  const setSelectedPoi = usePoiStore((s) => s.setSelectedPoi);
  // record shown in the details window (clicked in the table or on the map)
  const selectedPoi = usePoiStore((s) => s.selectedPoi);
  const selectedProps = selectedPoi?.properties;

  // shared with the summary chart: which query the table shows and how many rows it matches
  const setPoiTableQuery = usePoiStore((s) => s.setPoiTableQuery);

  // Radius filter state lives in the store so the map can draw the circle / pick the center
  const radius = usePoiStore((s) => s.radius);
  const setRadius = usePoiStore((s) => s.setRadius);
  const pickingCenter = usePoiStore((s) => s.pickingCenter);
  const setPickingCenter = usePoiStore((s) => s.setPickingCenter);

  // user scope, sent to the server the same way the tile url does
  const scopePoi = useGlobalStore((s) => s.auth?.scope_poi);
  const scopeKey = JSON.stringify(scopePoi ?? []);

  // ----- UI state (updates instantly) ---------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // typing in a column filter would otherwise send a request per keystroke
  const [debouncedFilters] = useDebouncedValue(filters, 300);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<PoiRow>>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const setFilter = (key: FilterKey, text: string) =>
    setFilters((cur) => ({ ...cur, [key]: text }));

  const hasTextFilters = search.trim() !== '' || FILTER_KEYS.some((k) => filters[k].trim() !== '');
  const clearTextFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
  };

  // The radius filters as soon as the center (lat + lng) is set; km falls back to the minimum
  const activeRadius = useMemo<ActiveRadius | null>(() => {
    const { lat, lng, m } = radius;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng, km: typeof m === 'number' && m >= MIN_RADIUS_M ? m : MIN_RADIUS_M };
  }, [radius]);
  // typing a coordinate would otherwise send a request per keystroke
  const [debouncedRadius] = useDebouncedValue(activeRadius, 400);

  // Nearest first while a radius is active; back to the default order when it is cleared
  const hasRadius = debouncedRadius !== null;
  useEffect(() => {
    setSortStatus(hasRadius ? DISTANCE_SORT : DEFAULT_SORT);
  }, [hasRadius]);

  const radiusTouched = radius.lat !== '' || radius.lng !== '' || radius.m !== MIN_RADIUS_M;

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'poi-visible-columns-v3',
    defaultValue: ALL_ACCESSORS,
  });

  const toggleColumn = (accessor: string) =>
    setVisible((cur) =>
      cur.includes(accessor)
        ? cur.length > 1
          ? cur.filter((a) => a !== accessor) // keep at least one column
          : cur
        : [...cur, accessor]
    );

  // ----- Query = everything except the paging --------------------------------
  const baseKey = useMemo(
    () =>
      buildQuery({
        scopeKey,
        search: debouncedSearch,
        filters: debouncedFilters,
        sort: sortStatus,
        radius: debouncedRadius,
      }),
    [scopeKey, debouncedSearch, debouncedFilters, sortStatus, debouncedRadius]
  );

  // The page belongs to one query and one page size: a new query (search, filter, sort, radius)
  // or a new rows-per-page value starts at page 1 again.
  // Stored together with its key, so there is no extra request with a stale page.
  const pageKey = `${baseKey}&ps=${pageSize}`;
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const page = pageState.key === pageKey ? pageState.page : 1;

  // ----- Fetch the current page ----------------------------------------------
  const [data, setData] = useState<LoadedPage | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(baseKey);
    sp.set('page', String(page));
    sp.set('pageSize', String(pageSize));
    const offset = (page - 1) * pageSize;

    const ctrl = new AbortController();
    setFetching(true);
    setError(null);

    fetch(`${TABLE_URL}?${sp}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load POIs (${res.status})`);
        return res.json() as Promise<TableResponse>;
      })
      .then((d) => {
        setData({ ...d, rows: Array.isArray(d.rows) ? d.rows : [], offset });
        setFetching(false);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return; // a newer request replaced this one
        setError(e.message);
        setFetching(false);
      });

    return () => ctrl.abort();
  }, [baseKey, page, pageSize]);

  // The rows on screen prove that at least `seen` matches exist, so the footer count can never be
  // 0 ("No points of interest found") while rows are displayed.
  const records = data?.rows ?? [];
  const seen = data ? data.offset + records.length : 0;
  const total = Math.max(data?.total ?? 0, seen);
  const browsable = Math.min(total, MAX_BROWSABLE);
  const capped = data?.capped ?? false;
  const totalLabel = data ? `${total.toLocaleString()}${capped ? '+' : ''}` : '…';
  const limited = !!data && (capped || total > browsable);

  // ----- A POI clicked on the map: jump to the page where it sits in the current result ------
  // The server counts the rows before it (same search / filters / radius / sort / page size).
  // The latest query lives in a ref, so this only runs when the selected POI changes.
  const latest = useRef({ baseKey, pageKey, pageSize, rows: records });
  latest.current = { baseKey, pageKey, pageSize, rows: records };
  const selectedId = selectedProps?.id;

  useEffect(() => {
    if (selectedId === undefined || selectedId === null) return;
    const cur = latest.current;
    if (cur.rows.some((r) => r.id === selectedId)) return; // already on this page (e.g. clicked in the table)

    const sp = new URLSearchParams(cur.baseKey);
    sp.set('id', String(selectedId));
    sp.set('pageSize', String(cur.pageSize));

    const ctrl = new AbortController();
    fetch(`${LOCATE_URL}?${sp}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<LocateResponse>) : null))
      .then((loc) => {
        // not found = the POI is filtered out of the table; not reachable = deeper than the table pages
        if (loc?.found && loc.reachable && loc.page) {
          setPageState({ key: cur.pageKey, page: loc.page });
        }
      })
      .catch(() => {
        // aborted or failed: the table stays where it is
      });

    return () => ctrl.abort();
  }, [selectedId]);

  // Share the query + match count with the summary chart (it asks the server for its own aggregates)
  useEffect(() => {
    setPoiTableQuery(baseKey, total);
  }, [baseKey, total, setPoiTableQuery]);

  // When the table goes away: forget the query, drop the radius
  useEffect(
    () => () => {
      setPoiTableQuery(null, 0);
      setPickingCenter(false);
      setRadius(emptyRadius);
    },
    [setPoiTableQuery, setPickingCenter, setRadius]
  );

  // ----- Columns -------------------------------------------------------------
  const columns: DataTableColumn<PoiRow>[] = useMemo(() => {
    const cols = COLUMN_DEFS.map((def) => {
      const col: DataTableColumn<PoiRow> = {
        accessor: def.accessor,
        title: def.title,
        width: def.width,
        textAlign: def.textAlign,
        hidden: !visible.includes(def.accessor as string),
      };

      if ((FILTER_KEYS as readonly string[]).includes(def.accessor as string)) {
        const key = def.accessor as FilterKey;
        col.filtering = filters[key].trim() !== '';
        col.filter = (
          <ColumnFilter
            label={def.title}
            value={filters[key]}
            onChange={(text) => setFilter(key, text)}
          />
        );
      }

      return col;
    });

    // Distance column only exists while a radius filter is applied to the data
    if (debouncedRadius) {
      cols.push({
        accessor: 'distance_km',
        title: 'Distance (km)',
        width: DISTANCE_COL_WIDTH,
        textAlign: 'right',
        render: (r) => (r.distance_km == null ? '' : Number(r.distance_km).toFixed(2)),
      });
    }

    return cols;
  }, [visible, filters, debouncedRadius]);

  // Clicking a row opens the floating details window (same one the map uses)
  const handleRowClick = (row: PoiRow) => {
    if (row.lng == null || row.lat == null) return; // no point geometry -> nothing to show
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { lng, lat, distance_km, ...properties } = row;
    setSelectedPoi({ properties, lng, lat });
  };

  return (
    <Box h="100%" w="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar: search + column picker */}
      <Group
        gap="xs"
        px="xs"
        py={6}
        wrap="nowrap"
        bg={PANEL_BG}
        style={{ flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}
        justify="space-between"
      >
        <TextInput
          size="xs"
          placeholder="Search name or ID..."
          leftSection={<IconSearch size={14} />}
          rightSection={
            search ? (
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}>
                <IconX size={12} />
              </ActionIcon>
            ) : null
          }
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, maxWidth: 360 }}
        />

        <Group gap="xs" wrap="nowrap">
          {hasTextFilters && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconFilterOff size={14} />}
              onClick={clearTextFilters}
            >
              Clear filters
            </Button>
          )}

          <Menu shadow="md" position="bottom-end" closeOnItemClick={false}>
            <Menu.Target>
              <Button size="xs" variant="default" c={NAVY} leftSection={<IconColumns3 size={14} />}>
                Columns
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Show columns</Menu.Label>
              {COLUMN_DEFS.map((c) => {
                const checked = visible.includes(c.accessor as string);
                return (
                  <Box key={c.accessor} px="sm" py={4}>
                    <Checkbox
                      size="xs"
                      label={c.title}
                      checked={checked}
                      disabled={checked && visible.length === 1}
                      onChange={() => toggleColumn(c.accessor as string)}
                    />
                  </Box>
                );
              })}
              <Menu.Divider />
              <Menu.Item onClick={() => setVisible(ALL_ACCESSORS)}>Show all</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {/* Radius filter: center (lat/lng or picked on the map) + distance in km */}
      <Group
        gap="xs"
        px="xs"
        py={6}
        wrap="nowrap"
        bg={PANEL_BG}
        style={{ flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}
      >
        <NumberInput
          size="xs"
          w={110}
          placeholder="Latitude"
          hideControls
          decimalScale={6}
          value={radius.lat}
          onChange={(v) => setRadius({ lat: typeof v === 'number' ? v : '' })}
        />
        <NumberInput
          size="xs"
          w={110}
          placeholder="Longitude"
          hideControls
          decimalScale={6}
          value={radius.lng}
          onChange={(v) => setRadius({ lng: typeof v === 'number' ? v : '' })}
        />
        <NumberInput
          size="xs"
          w={100}
          placeholder="Radius"
          rightSection="km"
          rightSectionWidth={28}
          min={MIN_RADIUS_M}
          clampBehavior="blur"
          allowNegative={false}
          hideControls
          decimalScale={2}
          value={radius.m}
          onChange={(v) => setRadius({ m: typeof v === 'number' ? v : '' })}
        />
        <Button
          size="xs"
          variant={pickingCenter ? 'filled' : 'default'}
          c={pickingCenter ? undefined : NAVY}
          leftSection={<IconCurrentLocation size={14} />}
          onClick={() => setPickingCenter(!pickingCenter)}
        >
          {pickingCenter ? 'Click the map…' : 'Pick on map'}
        </Button>
        {radiusTouched && (
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            aria-label="Clear radius"
            onClick={() => {
              setRadius(emptyRadius);
              setPickingCenter(false);
            }}
          >
            <IconX size={14} />
          </ActionIcon>
        )}
      </Group>

      {/* Shown when the result is bigger than what can be paged */}
      {limited && (
        <Text fz={11} c="dimmed" px="xs" py={4} bg={PANEL_BG} style={{ flexShrink: 0 }}>
          {totalLabel} matches. Only the first {browsable.toLocaleString()} can be paged: use the search,
          filters or radius to narrow the result.
        </Text>
      )}

      {/* Table area */}
      <Box pos="relative" style={{ flex: 1, minHeight: 0 }}>
        <Box pos="absolute" inset={0}>
          <DataTable<PoiRow>
            height="100%"
            withTableBorder
            withColumnBorders
            striped
            stripedColor={PANEL_BG}
            highlightOnHover
            highlightOnHoverColor={HOVER_BG}
            borderColor={BORDER}
            rowBorderColor={BORDER}
            paginationActiveBackgroundColor={NAVY}
            paginationActiveTextColor="#fff"
            fz="xs"
            verticalAlign="top"
            idAccessor="id"
            storeColumnsKey="poi-table-columns-v6"
            defaultColumnProps={{
              noWrap: true,
              ellipsis: true, // long values are cut with "…" instead of widening the column
              sortable: true,
              draggable: true,
              resizable: true, // drag the right edge of a header to resize
            }}
            styles={{
              table: { minWidth: '100%' },
              header: { backgroundColor: HEADER_BG, color: NAVY },
              pagination: { backgroundColor: PANEL_BG },
            }}
            columns={columns}
            records={records}
            fetching={fetching}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            totalRecords={browsable}
            recordsPerPage={pageSize}
            recordsPerPageOptions={PAGE_SIZE_OPTIONS}
            onRecordsPerPageChange={setPageSize}
            recordsPerPageLabel="Rows per page"
            page={page}
            onPageChange={(p) => setPageState({ key: pageKey, page: p })}
            paginationText={({ from, to }) => `${from} - ${to} of ${totalLabel}`}
            onRowClick={({ record }) => handleRowClick(record)}
            rowStyle={(record) => ({
              cursor: 'pointer',
              // selected row stays highlighted while its details window is open
              ...(selectedProps && record.id === selectedProps.id
                ? { backgroundColor: SELECTED_BG }
                : {}),
            })}
            noRecordsText={error ?? 'No points of interest found'}
          />
        </Box>
      </Box>
    </Box>
  );
}
