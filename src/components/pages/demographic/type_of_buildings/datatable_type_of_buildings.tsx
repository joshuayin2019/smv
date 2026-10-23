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
  TextInput,
} from '@mantine/core';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { IconColumns3, IconFilterOff, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { useBuildingTypeStore, type BuildingTypeMode } from '@/stores/demographic/type_of_buildings_stores';
import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from '@/lib/config';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';
import { MODES } from './map_type_of_buildings';

// One row from /api/pages/type_of_buildings/table (the columns that do not apply to a mode are null)
type BuildingTypeRow = {
  level: BuildingTypeMode;
  code: string;
  name: string;
  mun_name: string | null;
  pro_name: string | null;
  reg_name: string | null;
  type_of_buildings: number | string;
  building_type_single_house: number | string;
  building_type_duplex: number | string;
  building_type_apartment_accessoria_rowhouse: number | string;
  building_type_condominium_condotel: number | string;
  building_type_other_multi_unit_residential: number | string;
  building_type_commercial_industrial_agricultural: number | string;
  building_type_institutional_living_quarter: number | string;
  building_type_other_types_of_building: number | string;
};

type TableResponse = {
  total: number;
  rows: BuildingTypeRow[];
};

type LocateResponse = {
  found: boolean;
  page: number | null; // 1-based
};

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Background of the selected row
const SELECTED_BG = 'var(--mantine-color-blue-1)';

const TABLE_URL = `${basePath}/api/pages/demographic/type_of_buildings/table`;
const LOCATE_URL = `${basePath}/api/pages/demographic/type_of_buildings/table/locate`;

const ALL_MODES: BuildingTypeMode[] = ['region', 'province', 'municipality', 'barangay'];

// What the "name" column is called in each mode
const NAME_TITLE: Record<BuildingTypeMode, string> = {
  region: 'Region',
  province: 'Province',
  municipality: 'City / Municipality',
  barangay: 'Barangay',
};

// All columns the user can show/hide, with the modes they exist in and a default width in px
const COLUMN_DEFS: {
  accessor: keyof BuildingTypeRow;
  title: string;
  width: number;
  textAlign?: 'left' | 'right';
  modes: BuildingTypeMode[];
}[] = [
  { accessor: 'code', title: 'Code', width: 140, modes: ALL_MODES },
  { accessor: 'name', title: 'Name', width: 260, modes: ALL_MODES },
  { accessor: 'mun_name', title: 'City / Municipality', width: 220, modes: ['barangay'] },
  { accessor: 'pro_name', title: 'Province', width: 240, modes: ['municipality', 'barangay'] },
  {
    accessor: 'reg_name',
    title: 'Region',
    width: 260,
    modes: ['province', 'municipality', 'barangay'],
  },
  { accessor: 'type_of_buildings', title: 'Buildings (listed types)', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_single_house', title: 'Single house', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_duplex', title: 'Duplex', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_apartment_accessoria_rowhouse', title: 'Apartment / accessoria / rowhouse', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_condominium_condotel', title: 'Condominium / condotel', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_other_multi_unit_residential', title: 'Other multi-unit residential', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_commercial_industrial_agricultural', title: 'Commercial / industrial / agricultural', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_institutional_living_quarter', title: 'Institutional living quarter', width: 150, textAlign: 'right', modes: ALL_MODES },
  { accessor: 'building_type_other_types_of_building', title: 'Other', width: 150, textAlign: 'right', modes: ALL_MODES },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);

// Columns that get a text search in the header (the server knows the same keys)
const FILTER_KEYS = ['reg_name', 'pro_name', 'mun_name'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string>;
const EMPTY_FILTERS: Filters = { reg_name: '', pro_name: '', mun_name: '' };

// ----- Numeric filter for the type_of_buildings column -----------------------------
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
const EMPTY_NUM_FILTER: NumFilter = { mode: 'cond', op: 'eq', value: '', min: '', max: '' };

const isNumActive = (f: NumFilter) =>
  f.mode === 'cond' ? typeof f.value === 'number' : typeof f.min === 'number' || typeof f.max === 'number';

const DEFAULT_SORT: DataTableSortStatus<BuildingTypeRow> = { columnAccessor: 'name', direction: 'asc' };

const fmt = (v: unknown) => (v == null || v === '' ? '-' : Number(v).toLocaleString());

// Everything that decides WHICH rows the server returns and in what order (no paging).
// The string form is also the key of the request.
function buildQuery(o: {
  scopeKey: string;
  level: BuildingTypeMode;
  search: string;
  filters: Filters;
  numFilter: NumFilter;
  sort: DataTableSortStatus<BuildingTypeRow>;
}): string {
  const sp = new URLSearchParams();
  sp.set('scope', o.scopeKey);
  sp.set('level', o.level);
  if (o.search.trim()) sp.set('search', o.search.trim());

  const activeFilters = Object.fromEntries(
    FILTER_KEYS.filter((k) => o.filters[k].trim() !== '').map((k) => [k, o.filters[k].trim()])
  );
  if (Object.keys(activeFilters).length > 0) sp.set('filters', JSON.stringify(activeFilters));

  if (isNumActive(o.numFilter)) sp.set('pop', JSON.stringify(o.numFilter));

  sp.set('sort', String(o.sort.columnAccessor));
  sp.set('dir', o.sort.direction);
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

export default function DataTableBuildingType() {
  // the mode is shared with the map layer: changing it here regroups the map too
  const mode = useBuildingTypeStore((s) => s.type_of_buildingsMode);
  const setMode = useBuildingTypeStore((s) => s.setBuildingTypeMode);

  // record highlighted in the table (clicked in the table or on the map)
  const selected = useBuildingTypeStore((s) => s.selectedBuildingType);
  const setSelectedBuildingType = useBuildingTypeStore((s) => s.setSelectedBuildingType);

  // the query of this table is shared with the summary panel
  const setBuildingTypeTableQuery = useBuildingTypeStore((s) => s.setBuildingTypeTableQuery);

  // user scope, sent to the server in the querystring
  const scopePsa = useGlobalStore((s) => s.auth?.scope_psa);
  const scopeKey = JSON.stringify(scopePsa ?? []);

  // ----- UI state (updates instantly) ---------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [numFilter, setNumFilter] = useState<NumFilter>(EMPTY_NUM_FILTER);
  // typing in a filter would otherwise send a request per keystroke
  const [debouncedFilters] = useDebouncedValue(filters, 300);
  const [debouncedNumFilter] = useDebouncedValue(numFilter, 300);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<BuildingTypeRow>>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const setFilter = (key: FilterKey, text: string) =>
    setFilters((cur) => ({ ...cur, [key]: text }));

  const hasActiveFilters =
    search.trim() !== '' || FILTER_KEYS.some((k) => filters[k].trim() !== '') || isNumActive(numFilter);
  const clearAllFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setNumFilter(EMPTY_NUM_FILTER);
  };

  // A new mode has other columns: start again with the default order and without column filters
  useEffect(() => {
    setSortStatus(DEFAULT_SORT);
    setFilters(EMPTY_FILTERS);
    setNumFilter(EMPTY_NUM_FILTER);
  }, [mode]);

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'type_of_buildings-visible-columns-v1',
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
        level: mode,
        search: debouncedSearch,
        filters: debouncedFilters,
        numFilter: debouncedNumFilter,
        sort: sortStatus,
      }),
    [scopeKey, mode, debouncedSearch, debouncedFilters, debouncedNumFilter, sortStatus]
  );

  // Share the query with the summary panel (it drops sort/dir itself)
  useEffect(() => {
    setBuildingTypeTableQuery(baseKey);
  }, [baseKey, setBuildingTypeTableQuery]);

  // The page belongs to one query and one page size: a new query (or a new mode) or a new
  // rows-per-page value starts at page 1 again. Stored together with its key, so there is no
  // request with a stale page.
  const pageKey = `${baseKey}&ps=${pageSize}`;
  const [pageState, setPageState] = useState({ key: '', page: 1 });
  const page = pageState.key === pageKey ? pageState.page : 1;

  // ----- Fetch the current page ----------------------------------------------
  const [data, setData] = useState<TableResponse | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(baseKey);
    sp.set('page', String(page));
    sp.set('pageSize', String(pageSize));

    const ctrl = new AbortController();
    setFetching(true);
    setError(null);

    fetch(`${TABLE_URL}?${sp}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load type_of_buildings (${res.status})`);
        return res.json() as Promise<TableResponse>;
      })
      .then((d) => {
        setData({ total: d.total ?? 0, rows: Array.isArray(d.rows) ? d.rows : [] });
        setFetching(false);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return; // a newer request replaced this one
        setError(e.message);
        setFetching(false);
      });

    return () => ctrl.abort();
  }, [baseKey, page, pageSize]);

  const records = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalLabel = data ? total.toLocaleString() : '…';

  // ----- An area selected on the map: jump to the page where it sits in the current result ------
  // The latest query lives in a ref, so this only runs when the selected area changes.
  const latest = useRef({ baseKey, pageKey, pageSize, rows: records });
  latest.current = { baseKey, pageKey, pageSize, rows: records };
  const selectedCode = selected?.code;

  useEffect(() => {
    if (!selectedCode) return;
    const cur = latest.current;
    if (cur.rows.some((r) => r.code === selectedCode)) return; // already on this page

    const sp = new URLSearchParams(cur.baseKey);
    sp.set('id', selectedCode);
    sp.set('pageSize', String(cur.pageSize));

    const ctrl = new AbortController();
    fetch(`${LOCATE_URL}?${sp}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<LocateResponse>) : null))
      .then((loc) => {
        if (!loc?.found || !loc.page) return; // filtered out of the table: nothing to jump to
        setPageState({ key: cur.pageKey, page: loc.page });
      })
      .catch(() => {
        // aborted or failed: the table stays where it is
      });

    return () => ctrl.abort();
  }, [selectedCode]);

  // When the table goes away: drop the selection and the shared query
  useEffect(
    () => () => {
      setSelectedBuildingType(null);
      setBuildingTypeTableQuery(null);
    },
    [setSelectedBuildingType, setBuildingTypeTableQuery]
  );

  // ----- Columns (only the ones that exist in the current mode) ---------------
  const columns: DataTableColumn<BuildingTypeRow>[] = useMemo(() => {
    return COLUMN_DEFS.filter((def) => def.modes.includes(mode)).map((def) => {
      const accessor = def.accessor as string;
      const title = accessor === 'name' ? NAME_TITLE[mode] : def.title;

      const col: DataTableColumn<BuildingTypeRow> = {
        accessor: def.accessor,
        title,
        width: def.width,
        textAlign: def.textAlign,
        hidden: !visible.includes(accessor),
      };

      if (["building_type_single_house","building_type_duplex","building_type_apartment_accessoria_rowhouse","building_type_condominium_condotel","building_type_other_multi_unit_residential","building_type_commercial_industrial_agricultural","building_type_institutional_living_quarter","building_type_other_types_of_building"].includes(accessor)) col.render = (r) => fmt(r[accessor as keyof BuildingTypeRow]);

      if (accessor === 'type_of_buildings') {
        col.render = (r) => fmt(r.type_of_buildings);
        col.filtering = isNumActive(numFilter);
        col.filter = (
          <NumberFilterInput title={title} value={numFilter} onChange={(next) => setNumFilter(next)} />
        );
      }

      // Text filters use the instant state so the box responds immediately
      if ((FILTER_KEYS as readonly string[]).includes(accessor)) {
        const key = accessor as FilterKey;
        col.filtering = filters[key].trim() !== '';
        col.filter = (
          <ColumnFilter label={title} value={filters[key]} onChange={(text) => setFilter(key, text)} />
        );
      }

      return col;
    });
  }, [mode, visible, filters, numFilter]);

  // Clicking a row marks it as selected (the map highlights it)
  const handleRowClick = (row: BuildingTypeRow) => {
    if (useBuildingTypeStore.getState().selectedBuildingType?.code === row.code) return;
    setSelectedBuildingType({
      level: mode,
      code: row.code,
      name: row.name,
      type_of_buildings: Number(row.type_of_buildings),
    });
  };

  return (
    <Box h="100%" w="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar: mode + search + column picker */}
      <Group
        gap="xs"
        px="xs"
        py={6}
        wrap="nowrap"
        bg={PANEL_BG}
        style={{ flexShrink: 0, borderBottom: `1px solid ${BORDER}` }}
        justify="space-between"
      >
        <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
          <SegmentedControl
            size="xs"
            value={mode}
            onChange={(v) => setMode(v as BuildingTypeMode)}
            data={MODES.map((m) => ({ value: m.key, label: m.label }))}
          />
          <TextInput
            size="xs"
            placeholder={`Search ${NAME_TITLE[mode].toLowerCase()} or code...`}
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
        </Group>

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
              {COLUMN_DEFS.filter((c) => c.modes.includes(mode)).map((c) => {
                const checked = visible.includes(c.accessor as string);
                return (
                  <Box key={c.accessor} px="sm" py={4}>
                    <Checkbox
                      size="xs"
                      label={c.accessor === 'name' ? NAME_TITLE[mode] : c.title}
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

      {/* Table area */}
      <Box pos="relative" style={{ flex: 1, minHeight: 0 }}>
        <Box pos="absolute" inset={0}>
          <DataTable<BuildingTypeRow>
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
            idAccessor="code"
            // each mode has its own set of columns, so each one remembers its own widths / order
            storeColumnsKey={`type_of_buildings-table-columns-${mode}-v1`}
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
            totalRecords={total}
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
              // selected row stays highlighted while it is selected
              ...(selected && record.code === selected.code ? { backgroundColor: SELECTED_BG } : {}),
            })}
            noRecordsText={error ?? 'No type_of_buildings records found'}
          />
        </Box>
      </Box>
    </Box>
  );
}

// ----- Header filter for the type_of_buildings column: Conditional or Range ----------
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