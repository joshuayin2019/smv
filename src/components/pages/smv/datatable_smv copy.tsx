import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Box, Button, Checkbox, Group, Menu, MultiSelect, TextInput } from '@mantine/core';
import { useDebouncedValue, useElementSize, useLocalStorage } from '@mantine/hooks';
import { IconColumns3, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { useSmvStore, emptySmv, type SmvRecord } from '@/stores/smv_stores';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

// Record from the store plus a guaranteed-unique key. Zonal values are forced to numbers
type SmvRow = Omit<SmvRecord, 'r' | 'c' | 'i' | 'a'> & {
  rowKey: string;
  r: number | null; // residential
  c: number | null; // commercial
  i: number | null; // industrial
  a: number | null; // agricultural
  source: SmvRecord; // the original record (same object as in the store), used for row click / selection
};

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
  { accessor: 'street', title: 'Street', width: 260 },
  { accessor: 'bgy_name', title: 'Barangay', width: 170 },
  { accessor: 'mun_name', title: 'City / Municipality', width: 190 },
  { accessor: 'pro_name', title: 'Province', width: 260 },
  { accessor: 'fclass', title: 'Class', width: 120 },
  { accessor: 'smv_year', title: 'SMV Year', width: 100, textAlign: 'right' },
  { accessor: 'r', title: 'Residential', width: 120, textAlign: 'right' },
  { accessor: 'c', title: 'Commercial', width: 120, textAlign: 'right' },
  { accessor: 'i', title: 'Industrial', width: 120, textAlign: 'right' },
  { accessor: 'a', title: 'Agricultural', width: 120, textAlign: 'right' },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);
const ZONAL_KEYS = ['r', 'c', 'i', 'a'];

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

// Fields the global search looks at
const SEARCH_FIELDS: (keyof SmvRow)[] = ['street', 'bgy_name', 'mun_name', 'pro_name', 'fclass'];

const DEFAULT_SORT: DataTableSortStatus<SmvRow> = { columnAccessor: 'street', direction: 'asc' };

// Everything that triggers heavy processing, bundled so it can be deferred as one unit
type Query = {
  smv: typeof emptySmv;
  search: string;
  filters: Filters;
  sortStatus: DataTableSortStatus<SmvRow>;
};

// Used for the very first render, so the loader paints before the heavy work starts
const EMPTY_QUERY: Query = {
  smv: emptySmv,
  search: '',
  filters: EMPTY_FILTERS,
  sortStatus: DEFAULT_SORT,
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

  // ----- UI state (updates instantly) ---------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<SmvRow>>(DEFAULT_SORT);

  const setFilter = (key: FilterKey, values: string[]) =>
    setFilters((cur) => ({ ...cur, [key]: values }));

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'smv-visible-columns-v1',
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
    () => ({ smv, search: debouncedSearch, filters, sortStatus }),
    [smv, debouncedSearch, filters, sortStatus]
  );
  const deferred = useDeferredValue(query, EMPTY_QUERY);
  const processing = deferred !== query || loading; // true while loading or catching up

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

    return rows.filter((r) => {
      for (const [key, values] of active) {
        if (!values.has(String(r[key] ?? ''))) return false;
      }
      if (q && !SEARCH_FIELDS.some((k) => String(r[k] ?? '').toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [rows, deferred.search, deferred.filters]);

  // Share the visible (filtered) rows with anything else that needs them (summary, map, export)
  useEffect(() => {
    setFilteredSmv(filteredRows.map((r) => r.source));
  }, [filteredRows, setFilteredSmv]);

  // When the table goes away, drop the shared state
  useEffect(
    () => () => {
      setFilteredSmv(null);
      setSelectedSmv(null);
    },
    [setFilteredSmv, setSelectedSmv]
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

  // Back to the start whenever the result set changes
  useEffect(() => {
    setOffset(0);
  }, [deferred]);

  const records = useMemo(() => {
    const from = (page - 1) * pageSize;
    return sortedRows.slice(from, from + pageSize);
  }, [sortedRows, page, pageSize]);

  // ----- Columns -------------------------------------------------------------
  const columns: DataTableColumn<SmvRow>[] = useMemo(
    () =>
      COLUMN_DEFS.map((def) => {
        const accessor = def.accessor as string;
        const col: DataTableColumn<SmvRow> = {
          accessor: def.accessor,
          title: def.title,
          width: def.width,
          textAlign: def.textAlign,
          hidden: !visible.includes(accessor),
        };

        // Zonal values: thousands separators, "-" when empty
        if (ZONAL_KEYS.includes(accessor)) {
          col.render = (r) => money(r[def.accessor] as number | null);
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
      }),
    [visible, filters, filterOptions]
  );

  // Total width of the columns that are currently shown
  const totalWidth = useMemo(
    () =>
      COLUMN_DEFS.filter((c) => visible.includes(c.accessor as string)).reduce(
        (sum, c) => sum + c.width,
        0
      ),
    [visible]
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
          placeholder="Search street, barangay, city, province..."
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
            storeColumnsKey="smv-table-columns-v2"
            defaultColumnProps={{
              noWrap: true,
              ellipsis: true, // long text is cut with "..." instead of spilling into the next column
              sortable: true,
              draggable: true,
              resizable: true, // drag the edge of a header to resize
              //minWidth: 60,
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
