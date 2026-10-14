import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue, useElementSize, useLocalStorage } from '@mantine/hooks';
import { IconColumns3, IconCurrentLocation, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { useSmvStore, emptySmv, emptyRadius, MIN_RADIUS_M, type SmvRecord } from '@/stores/smv_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { smv_url } from '@/lib/config'; // adjust: import smv_url from wherever MapDataManagement gets it
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

// Record from the store plus a guaranteed-unique key. Zonal values are forced to numbers
type SmvRow = Omit<SmvRecord, 'r' | 'c' | 'i' | 'a'> & {
  rowKey: string;
  r: number | null; // residential
  c: number | null; // commercial
  i: number | null; // industrial
  a: number | null; // agricultural
  distance_m: number | null; // shortest distance (meters) from the radius center to the road, only while a radius is active
  source: SmvRecord; // the original record (same object as in the store), used for row click / selection
};

// A radius filter that is fully filled in (center + distance)
type ActiveRadius = { lat: number; lng: number; m: number };
const DISTANCE_COL_WIDTH = 120;

// Measured from the rendered table (fz="xs"); tweak if a little blank space remains
const ROW_HEIGHT = 30.5;
const HEADER_HEIGHT = 31;
const FOOTER_HEIGHT = 42;

// Background of the selected row
const SELECTED_BG = 'var(--mantine-color-blue-1)';

// All columns the user can show/hide, with a fixed width in px
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

// Columns that get a multi-select filter in the header
const FILTER_KEYS = ['pro_name', 'mun_name', 'bgy_name', 'fclass', 'smv_year'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string[]>;

const EMPTY_FILTERS: Filters = {
  pro_name: [],
  mun_name: [],
  bgy_name: [],
  fclass: [],
  smv_year: [],
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

// Roads without a value never match a numeric filter
function matchNum(v: number | null, f: NumFilter): boolean {
  if (v == null) return false;
  if (f.mode === 'range') {
    if (typeof f.min === 'number' && v < f.min) return false;
    if (typeof f.max === 'number' && v > f.max) return false;
    return true;
  }
  const t = f.value as number;
  switch (f.op) {
    case 'eq':
      return v === t;
    case 'ne':
      return v !== t;
    case 'gt':
      return v > t;
    case 'lt':
      return v < t;
    case 'gte':
      return v >= t;
    case 'lte':
      return v <= t;
  }
}

// Fields the global search looks at
const SEARCH_FIELDS: (keyof SmvRow)[] = ['id', 'street', 'bgy_name', 'mun_name', 'pro_name', 'fclass'];

const DEFAULT_SORT: DataTableSortStatus<SmvRow> = { columnAccessor: 'street', direction: 'asc' };
const DISTANCE_SORT: DataTableSortStatus<SmvRow> = { columnAccessor: 'distance_m', direction: 'asc' };

// Everything that triggers heavy processing, bundled so it can be deferred as one unit
type Query = {
  smv: typeof emptySmv;
  search: string;
  filters: Filters;
  numFilters: NumFilters;
  sortStatus: DataTableSortStatus<SmvRow>;
  radius: ActiveRadius | null;
  hits: Map<string, number> | null; // road id -> distance (m), from the server, while a radius is active
};

// Used for the very first render, so the loader paints before the heavy work starts
const EMPTY_QUERY: Query = {
  smv: emptySmv,
  search: '',
  filters: EMPTY_FILTERS,
  numFilters: EMPTY_NUM_FILTERS,
  sortStatus: DEFAULT_SORT,
  radius: null,
  hits: null,
};

function uniqueSorted(values: (string | number | null | undefined)[]) {
  return Array.from(
    new Set(values.filter((v) => v !== null && v !== undefined && v !== '').map(String))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// Tiles and JSON can hand numbers back as strings; null / 0 / NaN all mean "no value"
const toNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const money = (v: number | null) => (v == null ? '-' : v.toLocaleString());

export default function DataTableSMV() {
  const smv = useSmvStore((s) => s.smv);
  const loading = useSmvStore((s) => s.loading);
  const setFilteredSmv = useSmvStore((s) => s.setFilteredSmv);
  const setSelectedSmv = useSmvStore((s) => s.setSelectedSmv);
  // record highlighted in the table; compared by identity
  const selected = useSmvStore((s) => s.selectedSmv);

  // Radius filter state lives in the store so the map can draw the circle / pick the center
  const radius = useSmvStore((s) => s.radius);
  const setRadius = useSmvStore((s) => s.setRadius);
  const pickingCenter = useSmvStore((s) => s.pickingCenter);
  const setPickingCenter = useSmvStore((s) => s.setPickingCenter);

  // ----- UI state (updates instantly) ---------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [numFilters, setNumFilters] = useState<NumFilters>(EMPTY_NUM_FILTERS);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<SmvRow>>(DEFAULT_SORT);

  // The radius filters as soon as the center (lat + lng) is set; the radius falls back to the minimum
  const activeRadius = useMemo<ActiveRadius | null>(() => {
    const { lat, lng, m } = radius;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { lat, lng, m: typeof m === 'number' && m >= MIN_RADIUS_M ? m : MIN_RADIUS_M };
  }, [radius]);

  // Nearest first while a radius is active; back to the default order when it is cleared
  const hasRadius = activeRadius !== null;
  useEffect(() => {
    setSortStatus(hasRadius ? DISTANCE_SORT : DEFAULT_SORT);
  }, [hasRadius]);

  const radiusTouched = radius.lat !== '' || radius.lng !== '' || radius.m !== MIN_RADIUS_M;

  // Roads that touch the circle: the SERVER checks the real line geometry (ST_DWithin) and returns
  // { id, distance_m } pairs, so long roads count even when their midpoint is far from the center
  const scopeSmv = useGlobalStore((s) => s.auth?.scope_smv);
  const [hits, setHits] = useState<Map<string, number> | null>(null);
  const [hitsLoading, setHitsLoading] = useState(false);

  useEffect(() => {
    if (!activeRadius || !scopeSmv) {
      setHits(null);
      setHitsLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setHitsLoading(true);
        const response = await fetch(smv_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: scopeSmv, mode: 'smvradius', ...activeRadius }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) throw new Error(JSON.stringify(data));
        setHits(
          new Map(
            data.map((h: { id: number | string; distance_m: number | string }) => [
              String(h.id),
              Number(h.distance_m),
            ])
          )
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.log(err);
        setHits(new Map());
      } finally {
        if (!controller.signal.aborted) setHitsLoading(false);
      }
    }, 300); // wait while the user is still typing / dragging
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeRadius, scopeSmv]);

  const setNumFilter = (key: ZKey, next: NumFilter) =>
    setNumFilters((cur) => ({ ...cur, [key]: next }));

  const setFilter = (key: FilterKey, values: string[]) =>
    setFilters((cur) => ({ ...cur, [key]: values }));

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

  // ----- Deferred processing -------------------------------------------------
  const query = useMemo<Query>(
    () => ({ smv, search: debouncedSearch, filters, numFilters, sortStatus, radius: activeRadius, hits }),
    [smv, debouncedSearch, filters, numFilters, sortStatus, activeRadius, hits]
  );
  const deferred = useDeferredValue(query, EMPTY_QUERY);
  const processing = deferred !== query || loading || hitsLoading; // true while loading or catching up

  // ----- Data pipeline: rows -> filter -> search -> sort -> page ------------
  const rows: SmvRow[] = useMemo(
    () =>
      deferred.smv.map((rec, i) => ({
        ...rec,
        rowKey: `${rec.id ?? 'smv'}-${i}`, // index keeps it unique even if ids repeat
        r: toNum(rec.r),
        c: toNum(rec.c),
        i: toNum(rec.i),
        a: toNum(rec.a),
        distance_m: null,
        source: rec,
      })),
    [deferred.smv]
  );

  // Dropdown options for every filter, built once per data load
  const filterOptions = useMemo(
    () =>
      Object.fromEntries(
        FILTER_KEYS.map((k) => [k, uniqueSorted(rows.map((r) => r[k] as string | number | null))])
      ) as Record<FilterKey, string[]>,
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = deferred.search.trim().toLowerCase();

    // Only the filters that are actually in use; Sets make the lookup fast
    const active = FILTER_KEYS.filter((k) => deferred.filters[k].length > 0).map(
      (k) => [k, new Set(deferred.filters[k])] as const
    );

    // Zonal columns with a numeric filter that is filled in
    const numActive = ZONAL_KEYS.filter((k) => isNumActive(deferred.numFilters[k])).map(
      (k) => [k, deferred.numFilters[k]] as const
    );

    const rad = deferred.radius;

    const out: SmvRow[] = [];
    for (const r of rows) {
      let ok = true;
      for (const [key, values] of active) {
        if (!values.has(String(r[key] ?? ''))) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      for (const [key, f] of numActive) {
        if (!matchNum(r[key], f)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      if (q && !SEARCH_FIELDS.some((k) => String(r[k] ?? '').toLowerCase().includes(q))) continue;

      if (rad) {
        const d = deferred.hits?.get(String(r.id)); // not in the server's answer -> outside the circle
        if (d === undefined) continue;
        out.push({ ...r, distance_m: d });
      } else {
        out.push(r);
      }
    }
    return out;
  }, [rows, deferred.search, deferred.filters, deferred.numFilters, deferred.radius, deferred.hits]);

  // Share the visible (filtered) rows with anything else that needs them (summary, map, export)
  useEffect(() => {
    setFilteredSmv(filteredRows.map((r) => r.source));
  }, [filteredRows, setFilteredSmv]);

  // When the table goes away, drop the shared state
  useEffect(
    () => () => {
      setFilteredSmv(null);
      setSelectedSmv(null);
      setPickingCenter(false);
      setRadius(emptyRadius);
    },
    [setFilteredSmv, setSelectedSmv, setPickingCenter, setRadius]
  );

  const sortedRows = useMemo(() => {
    const key = deferred.sortStatus.columnAccessor as keyof SmvRow;
    const dir = deferred.sortStatus.direction === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // empty values always last
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return (
        String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir
      );
    });
  }, [filteredRows, deferred.sortStatus]);

  // ----- Page size follows the available height (table area only) -----------
  const { ref, height } = useElementSize();
  const [debouncedHeight] = useDebouncedValue(height, 100);
  const pageSize = Math.max(
    1,
    Math.floor((debouncedHeight - HEADER_HEIGHT - FOOTER_HEIGHT) / ROW_HEIGHT)
  );



  // Track the first visible row so resizing keeps your place in the data
  const [offset, setOffset] = useState(0);
  const page = Math.floor(offset / pageSize) + 1;

  // When a road is selected (from the map or the table), show the page that contains its row
  useEffect(() => {
    if (!selected) return;
    let idx = sortedRows.findIndex((r) => r.source === selected);
    if (idx < 0) idx = sortedRows.findIndex((r) => String(r.id) === String(selected.id));
    if (idx < 0) return; // filtered out of the table
    setOffset(Math.floor(idx / pageSize) * pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Back to the start whenever the result set changes
  useEffect(() => {
    setOffset(0);
  }, [deferred]);

  const records = useMemo(() => {
    const from = (page - 1) * pageSize;
    return sortedRows.slice(from, from + pageSize);
  }, [sortedRows, page, pageSize]);

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
          col.render = (r) => money(r[key]);
          col.filtering = isNumActive(numFilters[key]);
          col.filter = (
            <NumberFilterInput
              title={def.title}
              value={numFilters[key]}
              onChange={(next) => setNumFilter(key, next)}
            />
          );
        }

        // Filter inputs use the instant state so they respond immediately
        if ((FILTER_KEYS as readonly string[]).includes(accessor)) {
          const key = accessor as FilterKey;
          col.filtering = filters[key].length > 0;
          col.filter = (
            <MultiSelect
              label={def.title}
              placeholder={`Pick ${def.title.toLowerCase()}`}
              data={filterOptions[key]}
              value={filters[key]}
              onChange={(values) => setFilter(key, values)}
              searchable
              clearable
              limit={100} // barangay has thousands of options; only render the first matches
              comboboxProps={{ withinPortal: false }}
            />
          );
        }

        return col;
    });

    // Distance column only exists while a radius filter is applied to the data
    if (deferred.radius) {
      cols.push({
        accessor: 'distance_m',
        title: 'Distance (m)',
        width: DISTANCE_COL_WIDTH,
        textAlign: 'right',
        render: (r) => (r.distance_m == null ? '' : Math.round(r.distance_m).toLocaleString()),
      });
    }

    return cols;
  }, [visible, filters, numFilters, filterOptions, deferred.radius]);

  // Total width of the columns that are currently shown
  const totalWidth = useMemo(
    () =>
      COLUMN_DEFS.filter((c) => visible.includes(c.accessor as string)).reduce(
        (sum, c) => sum + c.width,
        0
      ) + (deferred.radius ? DISTANCE_COL_WIDTH : 0),
    [visible, deferred.radius]
  );

  // Clicking a row marks it as selected (the map can read selectedSmv to zoom to it)
  const handleRowClick = (row: SmvRow) => setSelectedSmv(row.source);

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
          placeholder="Search ID, street, barangay, city, province..."
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

      {/* Table area: its height decides how many rows fit */}
      <Box ref={ref} pos="relative" style={{ flex: 1, minHeight: 0 }}>
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
            idAccessor="rowKey"
            storeColumnsKey="smv-table-columns-v5"
            defaultColumnProps={{
              noWrap: true,
              ellipsis: true, // long text is cut with "..." instead of spilling into the next column
              sortable: true,
              draggable: true,
              resizable: true, // drag the edge of a header to resize
            }}
            styles={{
              table: {
                tableLayout: 'fixed',
                minWidth: Math.max(totalWidth, 0), // wider than the panel -> horizontal scrollbar appears
                width: '100%', // narrower than the panel -> stretch, no blank strip
              },
              header: { backgroundColor: HEADER_BG, color: NAVY },
              pagination: { backgroundColor: PANEL_BG },
            }}
            columns={columns}
            records={records}
            fetching={processing}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            totalRecords={sortedRows.length}
            recordsPerPage={pageSize}
            page={page}
            onPageChange={(p) => setOffset((p - 1) * pageSize)}
            onRowClick={({ record }) => handleRowClick(record)}
            rowStyle={(record) => ({
              cursor: 'pointer',
              ...(selected && record.source === selected ? { backgroundColor: SELECTED_BG } : {}),
            })}
            noRecordsText="No SMV records found"
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
