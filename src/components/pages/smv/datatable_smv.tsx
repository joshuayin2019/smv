import { useTablePageSize } from '@/hooks/use_table_page_size';
import { pageForTableSize } from '@/lib/table_paging';
// FILE: src/components/.../datatable_smv.tsx  (replace your server-side SMV table; keep its current location)
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
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
  useSmvStore,
  emptyRadius,
  MIN_RADIUS_M,
  DEFAULT_RADIUS_M,
  effectiveRadiusM,
  type SmvRecord,
} from '@/stores/smv_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config'; // adjust to wherever your basePath lives
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

// One row from /api/pages/smv/table: the SMV record + distance (only while a radius is active)
type SmvRow = SmvRecord & {
  distance_m: number | null;
};

type TableResponse = {
  total: number; // matching rows, counted up to a cap on the server
  capped: boolean; // true = there are more matches than `total` ("100,000+")
  browsable: number; // rows the pagination can reach (decided by the server)
  rows: SmvRow[];
};

// The response + the row offset of the page it holds
type LoadedPage = TableResponse & { offset: number };

// A radius filter that is fully filled in (center + distance in meters)
type ActiveRadius = { lat: number; lng: number; m: number };


const DISTANCE_COL_WIDTH = 120;

// Background of the selected row
const SELECTED_BG = 'var(--mantine-color-blue-1)';

const TABLE_URL = `${basePath}/api/pages/smv/table`;
const LOCATE_URL = `${basePath}/api/pages/smv/table/locate`;

// Answer of the locate route: where one road sits in the current result
type LocateResponse = {
  found: boolean;
  reachable: boolean;
  page: number | null; // 1-based
};

// All columns the user can show/hide, with a default width in px (the user can resize them)
const COLUMN_DEFS: {
  accessor: keyof SmvRow;
  title: string;
  width: number;
  textAlign?: 'left' | 'right';
}[] = [
  { accessor: 'id', title: 'ID', width: 90, textAlign: 'right' },
  { accessor: 'street', title: 'Street', width: 260 },
  { accessor: 'bgy_name', title: 'Barangay', width: 170 },
  { accessor: 'mun_name', title: 'City / Municipality', width: 190 },
  { accessor: 'pro_name', title: 'Province', width: 260 },
  { accessor: 'fclass', title: 'Class', width: 120 },
  { accessor: 'smv_year', title: 'SMV Year', width: 100, textAlign: 'right' },
  { accessor: 'r', title: 'Residential', width: 150, textAlign: 'right' },
  { accessor: 'c', title: 'Commercial', width: 150, textAlign: 'right' },
  { accessor: 'i', title: 'Industrial', width: 150, textAlign: 'right' },
  { accessor: 'a', title: 'Agricultural', width: 150, textAlign: 'right' },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);
const ZONAL_KEYS = ['r', 'c', 'i', 'a'] as const;
type ZKey = (typeof ZONAL_KEYS)[number];

// Columns that get a text search in the header (the server knows the same keys)
const FILTER_KEYS = ['pro_name', 'mun_name', 'bgy_name', 'fclass', 'smv_year'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string>;

const EMPTY_FILTERS: Filters = {
  pro_name: '',
  mun_name: '',
  bgy_name: '',
  fclass: '',
  smv_year: '',
};

// ----- Numeric filters for the zonal columns --------------------------------
// Conditional: value <op> input.  Range: from <= value <= to (either side can be left empty)
const NUM_OPS = [
  { value: 'eq', label: 'Equal to' },
  { value: 'ne', label: 'Not equal to' },
  { value: 'gt', label: 'Greater than' },
  { value: 'lt', label: 'Less than' },
  { value: 'gte', label: 'Greater than or equal to' },
  { value: 'lte', label: 'Less than or equal to' },
] as const;
type NumOp = (typeof NUM_OPS)[number]['value'];

type NumFilter = {
  mode: 'cond' | 'range';
  op: NumOp;
  value: number | '';
  min: number | '';
  max: number | '';
};
type NumFilters = Record<ZKey, NumFilter>;

const EMPTY_NUM_FILTER: NumFilter = { mode: 'cond', op: 'eq', value: '', min: '', max: '' };
const EMPTY_NUM_FILTERS: NumFilters = {
  r: EMPTY_NUM_FILTER,
  c: EMPTY_NUM_FILTER,
  i: EMPTY_NUM_FILTER,
  a: EMPTY_NUM_FILTER,
};

// A filter only applies once it has something to compare against
const isNumActive = (f: NumFilter) =>
  f.mode === 'cond' ? typeof f.value === 'number' : typeof f.min === 'number' || typeof f.max === 'number';

const DEFAULT_SORT: DataTableSortStatus<SmvRow> = { columnAccessor: 'street', direction: 'asc' };
const DISTANCE_SORT: DataTableSortStatus<SmvRow> = { columnAccessor: 'distance_m', direction: 'asc' };

// The server can hand numbers back as strings; null / 0 / NaN all mean "no value"
const toNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const money = (v: number | null) => (v == null ? '-' : v.toLocaleString());

// Everything that decides WHICH rows the server returns and in what order (no paging).
// The string form is also the key of the request and is shared with the store.
function buildQuery(o: {
  scopeKey: string;
  search: string;
  filters: Filters;
  numFilters: NumFilters;
  sort: DataTableSortStatus<SmvRow>;
  radius: ActiveRadius | null;
}): string {
  const sp = new URLSearchParams();
  sp.set('scope', o.scopeKey);
  if (o.search.trim()) sp.set('search', o.search.trim());

  const activeFilters = Object.fromEntries(
    FILTER_KEYS.filter((k) => o.filters[k].trim() !== '').map((k) => [k, o.filters[k].trim()])
  );
  if (Object.keys(activeFilters).length > 0) sp.set('filters', JSON.stringify(activeFilters));

  const activeNum = Object.fromEntries(
    ZONAL_KEYS.filter((k) => isNumActive(o.numFilters[k])).map((k) => [k, o.numFilters[k]])
  );
  if (Object.keys(activeNum).length > 0) sp.set('num', JSON.stringify(activeNum));

  sp.set('sort', String(o.sort.columnAccessor));
  sp.set('dir', o.sort.direction);

  if (o.radius) {
    sp.set('lat', String(o.radius.lat));
    sp.set('lng', String(o.radius.lng));
    sp.set('m', String(o.radius.m));
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

export default function DataTableSMV() {
  const setSelectedSmv = useSmvStore((s) => s.setSelectedSmv);
  // record highlighted in the table (clicked in the table or on the map)
  const selected = useSmvStore((s) => s.selectedSmv);

  // shared with other panels: which query the table shows and how many rows it matches
  const setSmvTableQuery = useSmvStore((s) => s.setSmvTableQuery);

  // Radius filter state lives in the store so the map can draw the circle / pick the center
  const radius = useSmvStore((s) => s.radius);
  const setRadius = useSmvStore((s) => s.setRadius);
  const pickingCenter = useSmvStore((s) => s.pickingCenter);
  const setPickingCenter = useSmvStore((s) => s.setPickingCenter);

  // user scope, sent to the server in the querystring
  const scopeSmv = useGlobalStore((s) => s.auth?.scope_smv);
  const scopeKey = JSON.stringify(scopeSmv ?? []);

  // ----- UI state (updates instantly) ---------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [numFilters, setNumFilters] = useState<NumFilters>(EMPTY_NUM_FILTERS);
  // typing in a filter would otherwise send a request per keystroke
  const [debouncedFilters] = useDebouncedValue(filters, 300);
  const [debouncedNumFilters] = useDebouncedValue(numFilters, 300);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<SmvRow>>(DEFAULT_SORT);
  const { tableRef, pageSize } = useTablePageSize();

  const setFilter = (key: FilterKey, text: string) =>
    setFilters((cur) => ({ ...cur, [key]: text }));
  const setNumFilter = (key: ZKey, next: NumFilter) =>
    setNumFilters((cur) => ({ ...cur, [key]: next }));

  const hasActiveFilters =
    search.trim() !== '' ||
    FILTER_KEYS.some((k) => filters[k].trim() !== '') ||
    ZONAL_KEYS.some((k) => isNumActive(numFilters[k]));
  const clearAllFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setNumFilters(EMPTY_NUM_FILTERS);
  };

  // The radius filters as soon as the center (lat + lng) is set; an empty / too small radius
  // falls back to the default so the circle and the result are visible right after picking
  const activeRadius = useMemo<ActiveRadius | null>(() => {
    const { lat, lng, m } = radius;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng, m: effectiveRadiusM(m) };
  }, [radius]);
  // typing a coordinate would otherwise send a request per keystroke
  const [debouncedRadius] = useDebouncedValue(activeRadius, 400);

  // Nearest first while a radius is active; back to the default order when it is cleared
  const hasRadius = debouncedRadius !== null;
  useEffect(() => {
    setSortStatus(hasRadius ? DISTANCE_SORT : DEFAULT_SORT);
  }, [hasRadius]);

  const radiusTouched = radius.lat !== '' || radius.lng !== '' || radius.m !== DEFAULT_RADIUS_M;

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'smv-visible-columns-v2',
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
        numFilters: debouncedNumFilters,
        sort: sortStatus,
        radius: debouncedRadius,
      }),
    [scopeKey, debouncedSearch, debouncedFilters, debouncedNumFilters, sortStatus, debouncedRadius]
  );

  // The page belongs to one query and one page size: a new query or a new rows-per-page value
  // starts at page 1 again. Stored together with its key, so there is no request with a stale page.
  const pageKey = `${baseKey}&ps=${pageSize}`;
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const page = pageForTableSize(pageState, baseKey, pageSize);

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
        if (!res.ok) throw new Error(`Failed to load SMV records (${res.status})`);
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
  // 0 ("No SMV records found") while rows are displayed.
  const records = data?.rows ?? [];
  const seen = data ? data.offset + records.length : 0;
  const total = Math.max(data?.total ?? 0, seen);
  // the server says how many rows can be paged to, so the two can never disagree
  const browsable = Math.max(data?.browsable ?? 0, seen);
  const capped = data?.capped ?? false;
  const totalLabel = data ? `${total.toLocaleString()}${capped ? '+' : ''}` : '…';
  const limited = !!data && (capped || total > browsable);

  // ----- A road clicked on the map: jump to the page where it sits in the current result ------
  // The server counts the rows before it (same search / filters / radius / sort / page size).
  // The latest query lives in a ref, so this only runs when the selected road changes.
  const latest = useRef({ baseKey, pageKey, pageSize, rows: records });
  latest.current = { baseKey, pageKey, pageSize, rows: records };
  const selectedId = selected?.id;

  // Ask the server where the road sits and move to that page.
  // A road deeper than the pageable rows (MAX_BROWSABLE) cannot be paged to: in that case
  // the table narrows itself to the road's barangay + municipality (see the effects below).
  const [narrowFor, setNarrowFor] = useState<string | null>(null);
  const relocate = useRef(false); // true = locate again as soon as the narrowed query is active

  const locateRoad = (id: string, signal: AbortSignal) => {
    const cur = latest.current;
    if (cur.rows.some((r) => String(r.id) === id)) return; // already on this page

    const sp = new URLSearchParams(cur.baseKey);
    sp.set('id', id);
    sp.set('pageSize', String(cur.pageSize));

    fetch(`${LOCATE_URL}?${sp}`, { signal })
      .then((res) => (res.ok ? (res.json() as Promise<LocateResponse>) : null))
      .then((loc) => {
        if (!loc?.found) return; // filtered out of the table: nothing to jump to
        if (loc.reachable && loc.page) {
          setPageState({ key: cur.pageKey, page: loc.page });
        } else {
          setNarrowFor(id); // too deep to page to: narrow the result
        }
      })
      .catch(() => {
        // aborted or failed: the table stays where it is
      });
  };

  // A road is selected (map click): jump to its page
  useEffect(() => {
    if (selectedId === undefined || selectedId === null) return;
    const ctrl = new AbortController();
    locateRoad(String(selectedId), ctrl.signal);
    return () => ctrl.abort();
  }, [selectedId]);

  // The road is too deep: filter by its barangay + municipality. The full record (with these
  // names) is loaded by the map after the click, so wait until it has them.
  useEffect(() => {
    if (narrowFor === null) return;
    if (!selected || String(selected.id) !== narrowFor) {
      setNarrowFor(null); // another road was selected meanwhile
      return;
    }
    if (!selected.bgy_name && !selected.mun_name) return; // details still loading

    const bgy = selected.bgy_name ?? '';
    const mun = selected.mun_name ?? '';
    setNarrowFor(null);
    if (filters.bgy_name === bgy && filters.mun_name === mun) return; // already narrowed

    relocate.current = true;
    setFilters((cur) => ({ ...cur, bgy_name: bgy, mun_name: mun }));
  }, [narrowFor, selected]);

  // The narrowed query is active (baseKey changed): locate again, now it is within reach
  useEffect(() => {
    if (!relocate.current || selectedId === undefined || selectedId === null) return;
    relocate.current = false;
    const ctrl = new AbortController();
    locateRoad(String(selectedId), ctrl.signal);
    return () => ctrl.abort();
  }, [baseKey]);

  // Share the query + match count with the rest of the app
  useEffect(() => {
    setSmvTableQuery(baseKey, total);
  }, [baseKey, total, setSmvTableQuery]);

  // When the table goes away: forget the query, drop the selection and the radius
  useEffect(
    () => () => {
      setSmvTableQuery(null, 0);
      setSelectedSmv(null);
      setPickingCenter(false);
      setRadius(emptyRadius);
    },
    [setSmvTableQuery, setSelectedSmv, setPickingCenter, setRadius]
  );

  // ----- Columns -------------------------------------------------------------
  const columns: DataTableColumn<SmvRow>[] = useMemo(() => {
    const cols: DataTableColumn<SmvRow>[] = COLUMN_DEFS.map((def) => {
      const accessor = def.accessor as string;
      const col: DataTableColumn<SmvRow> = {
        accessor: def.accessor,
        title: def.title,
        width: def.width,
        textAlign: def.textAlign,
        hidden: !visible.includes(accessor),
      };

      // Zonal values: thousands separators, "-" when empty
      if ((ZONAL_KEYS as readonly string[]).includes(accessor)) {
        const key = accessor as ZKey;
        col.render = (r) => money(toNum(r[key]));
        col.filtering = isNumActive(numFilters[key]);
        col.filter = (
          <NumberFilterInput
            title={def.title}
            value={numFilters[key]}
            onChange={(next) => setNumFilter(key, next)}
          />
        );
      }

      // Text filters use the instant state so the box responds immediately
      if ((FILTER_KEYS as readonly string[]).includes(accessor)) {
        const key = accessor as FilterKey;
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
        accessor: 'distance_m',
        title: 'Distance (m)',
        width: DISTANCE_COL_WIDTH,
        textAlign: 'right',
        render: (r) =>
          r.distance_m == null ? '' : Math.round(Number(r.distance_m)).toLocaleString(),
      });
    }

    return cols;
  }, [visible, filters, numFilters, debouncedRadius]);

  // Clicking a row marks it as selected (the map reads selectedSmv to zoom to it).
  // Clicking the row that is already selected does nothing, so the full record (with bbox)
  // that the map loaded is not overwritten by this row.
  const handleRowClick = (row: SmvRow) => {
    if (String(useSmvStore.getState().selectedSmv?.id) === String(row.id)) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { distance_m, ...record } = row;
    setSelectedSmv(record as SmvRecord);
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
          placeholder="Search street or ID..."
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
          {hasActiveFilters && (
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconFilterOff size={14} />}
              onClick={clearAllFilters}
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

      {/* Radius filter: center (lat/lng or picked on the map) + distance in meters */}
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
          rightSection="m"
          rightSectionWidth={24}
          min={MIN_RADIUS_M}
          clampBehavior="blur"
          allowNegative={false}
          hideControls
          decimalScale={0}
          thousandSeparator=","
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
      <Box ref={tableRef} pos="relative" style={{ flex: 1, minHeight: 0 }}>
        <Box pos="absolute" inset={0}>
          <DataTable<SmvRow>
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
            // Bumped to v6: the table layout changed from fixed to free column widths
            storeColumnsKey="smv-table-columns-v6"
            defaultColumnProps={{
              noWrap: true,
              ellipsis: true, // long text is cut with "..." instead of spilling into the next column
              sortable: true,
              draggable: true,
              resizable: true, // drag the edge of a header to resize
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

            page={page}
            onPageChange={(p) => setPageState({ key: pageKey, page: p })}
            paginationText={({ from, to }) => `${from} - ${to} of ${totalLabel}`}
            onRowClick={({ record }) => handleRowClick(record)}
            rowStyle={(record) => ({
              cursor: 'pointer',
              // selected row stays highlighted while it is selected
              ...(selected && String(record.id) === String(selected.id)
                ? { backgroundColor: SELECTED_BG }
                : {}),
            })}
            noRecordsText={error ?? 'No SMV records found'}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ----- Header filter for a zonal column: Conditional or Range -----------------
function NumberFilterInput({
  title,
  value,
  onChange,
}: {
  title: string;
  value: NumFilter;
  onChange: (next: NumFilter) => void;
}) {
  const set = (patch: Partial<NumFilter>) => onChange({ ...value, ...patch });
  const num = (v: string | number) => (typeof v === 'number' ? v : '');

  return (
    <Stack gap="xs" w={220}>
      <SegmentedControl
        size="xs"
        fullWidth
        value={value.mode}
        onChange={(m) => set({ mode: m as NumFilter['mode'] })}
        data={[
          { value: 'cond', label: 'Conditional' },
          { value: 'range', label: 'Range' },
        ]}
      />

      {value.mode === 'cond' ? (
        <>
          <Select
            size="xs"
            label={`${title} is`}
            data={NUM_OPS.map(({ value: v, label }) => ({ value: v, label }))}
            value={value.op}
            onChange={(v) => v && set({ op: v as NumOp })}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }}
          />
          <NumberInput
            size="xs"
            label="Value"
            placeholder="Enter a value"
            hideControls
            allowNegative={false}
            thousandSeparator=","
            value={value.value}
            onChange={(v) => set({ value: num(v) })}
          />
        </>
      ) : (
        <Group gap="xs" wrap="nowrap" grow>
          <NumberInput
            size="xs"
            label="From"
            placeholder="Min"
            hideControls
            allowNegative={false}
            thousandSeparator=","
            value={value.min}
            onChange={(v) => set({ min: num(v) })}
          />
          <NumberInput
            size="xs"
            label="To"
            placeholder="Max"
            hideControls
            allowNegative={false}
            thousandSeparator=","
            value={value.max}
            onChange={(v) => set({ max: num(v) })}
          />
        </Group>
      )}

      <Button size="compact-xs" variant="default" onClick={() => onChange(EMPTY_NUM_FILTER)}>
        Clear
      </Button>
    </Stack>
  );
}
