import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  MultiSelect,
  TextInput,
  ActionIcon,
} from '@mantine/core';
import { useDebouncedValue, useElementSize, useLocalStorage } from '@mantine/hooks';
import { IconColumns3, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { usePoiStore, emptyPoi, type PoiFeature } from '@/stores/poi_stores';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

// Properties from the feature plus a guaranteed-unique key
type PoiRow = PoiFeature['properties'] & { rowKey: string };

// Measured from the rendered table (fz="xs"); tweak if a little blank space remains
const ROW_HEIGHT = 30.5;
const HEADER_HEIGHT = 31;
const FOOTER_HEIGHT = 42;

// All columns the user can show/hide, with a fixed width in px
const COLUMN_DEFS: {
  accessor: keyof PoiRow;
  title: string;
  width: number;
  textAlign?: 'left' | 'right';
}[] = [
  { accessor: 'name', title: 'Name', width: 240 },
  { accessor: 'category', title: 'Category', width: 160 },
  { accessor: 'barangay', title: 'Barangay', width: 160 },
  { accessor: 'city_municipality', title: 'City / Municipality', width: 190 },
  { accessor: 'province', title: 'Province', width: 260 },
  { accessor: 'district', title: 'District', width: 120 },
  { accessor: 'rd_name', title: 'Road', width: 160 },
  { accessor: 'ft_traffic', title: 'Foot Traffic', width: 120, textAlign: 'right' },
  { accessor: 'as_of', title: 'As Of', width: 100 },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);

// Fields the global search looks at
const SEARCH_FIELDS: (keyof PoiRow)[] = [
  'name',
  'category',
  'barangay',
  'city_municipality',
  'province',
  'district',
  'rd_name',
];

const DEFAULT_SORT: DataTableSortStatus<PoiRow> = { columnAccessor: 'name', direction: 'asc' };

// Everything that triggers heavy processing, bundled so it can be deferred as one unit
type Query = {
  poi: typeof emptyPoi;
  search: string;
  categoryFilter: string[];
  cityFilter: string[];
  sortStatus: DataTableSortStatus<PoiRow>;
};

// Used for the very first render, so the loader paints before the heavy work starts
const EMPTY_QUERY: Query = {
  poi: emptyPoi,
  search: '',
  categoryFilter: [],
  cityFilter: [],
  sortStatus: DEFAULT_SORT,
};

function uniqueSorted(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function DataTablePOI() {
  const poi = usePoiStore((s) => s.poi);

  // ----- UI state (updates instantly) ---------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<PoiRow>>(DEFAULT_SORT);

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'poi-visible-columns',
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
  // `query` is the latest request; `deferred` lags behind while the heavy work runs.
  const query = useMemo<Query>(
    () => ({ poi, search: debouncedSearch, categoryFilter, cityFilter, sortStatus }),
    [poi, debouncedSearch, categoryFilter, cityFilter, sortStatus]
  );
  const deferred = useDeferredValue(query, EMPTY_QUERY);
  const processing = deferred !== query; // true while the table is still catching up

  // ----- Data pipeline: rows -> filter -> search -> sort -> page -------------
  const rows: PoiRow[] = useMemo(
    () =>
      deferred.poi.features.map((f, i) => ({
        ...f.properties,
        rowKey: `${f.id ?? f.properties.fid}-${i}`, // index keeps it unique even if ids repeat
      })),
    [deferred.poi]
  );

  const categoryOptions = useMemo(() => uniqueSorted(rows.map((r) => r.category)), [rows]);
  const cityOptions = useMemo(() => uniqueSorted(rows.map((r) => r.city_municipality)), [rows]);

  const filteredRows = useMemo(() => {
    const q = deferred.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (deferred.categoryFilter.length && !deferred.categoryFilter.includes(r.category)) {
        return false;
      }
      if (
        deferred.cityFilter.length &&
        !deferred.cityFilter.includes(r.city_municipality ?? '')
      ) {
        return false;
      }
      if (!q) return true;
      return SEARCH_FIELDS.some((k) => String(r[k] ?? '').toLowerCase().includes(q));
    });
  }, [rows, deferred.search, deferred.categoryFilter, deferred.cityFilter]);

  const sortedRows = useMemo(() => {
    const key = deferred.sortStatus.columnAccessor as keyof PoiRow;
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
  const columns: DataTableColumn<PoiRow>[] = useMemo(
    () =>
      COLUMN_DEFS.map((def) => {
        const col: DataTableColumn<PoiRow> = {
          accessor: def.accessor,
          title: def.title,
          width: def.width,
          textAlign: def.textAlign,
          hidden: !visible.includes(def.accessor as string),
        };

        // Filter inputs use the instant state so they respond immediately
        if (def.accessor === 'category') {
          col.filtering = categoryFilter.length > 0;
          col.filter = (
            <MultiSelect
              label="Category"
              placeholder="Pick categories"
              data={categoryOptions}
              value={categoryFilter}
              onChange={setCategoryFilter}
              searchable
              clearable
              comboboxProps={{ withinPortal: false }}
            />
          );
        }

        if (def.accessor === 'city_municipality') {
          col.filtering = cityFilter.length > 0;
          col.filter = (
            <MultiSelect
              label="City / Municipality"
              placeholder="Pick cities"
              data={cityOptions}
              value={cityFilter}
              onChange={setCityFilter}
              searchable
              clearable
              comboboxProps={{ withinPortal: false }}
            />
          );
        }

        return col;
      }),
    [visible, categoryFilter, cityFilter, categoryOptions, cityOptions]
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
      >
        <TextInput
          size="xs"
          placeholder="Search name, category, barangay, city..."
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
            idAccessor="rowKey"
            storeColumnsKey="poi-table-columns-v2"
            defaultColumnProps={{
              noWrap: true,
              sortable: true,
              draggable: true,
            }}
            styles={{
              table: {
                tableLayout: 'fixed',
                width: totalWidth, // wider than the panel -> horizontal scrollbar appears
                minWidth: '100%', // narrower than the panel -> stretch, no blank strip
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
            noRecordsText="No points of interest found"
          />
        </Box>
      </Box>
    </Box>
  );
}