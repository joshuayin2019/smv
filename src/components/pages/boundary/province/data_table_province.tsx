import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  Menu,
  MultiSelect,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue, useElementSize, useLocalStorage } from '@mantine/hooks';
import { IconColumns3, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { useProvinceStore, type Province } from '@/stores/boundary/province_stores';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

// Measured from the rendered table (fz="xs"); tweak if a little blank space remains
const ROW_HEIGHT = 30.5;
const HEADER_HEIGHT = 31;
const FOOTER_HEIGHT = 42;

const SELECTED_ROW_BG = '#fef3c7';

// All columns the user can show/hide, with a default width in px (the user can resize them)
const COLUMN_DEFS: {
  accessor: keyof Province;
  title: string;
  width: number;
  textAlign?: 'left' | 'right';
}[] = [
  { accessor: 'id', title: 'ID', width: 90, textAlign: 'right' },
  { accessor: 'reg_code', title: 'Region Code', width: 140 },
  { accessor: 'reg_name', title: 'Region Name', width: 320 },
  { accessor: 'pro_code', title: 'Province Code', width: 140 },
  { accessor: 'pro_name', title: 'Province Name', width: 320 },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);

// Fields the global search looks at
const SEARCH_FIELDS: (keyof Province)[] = ['id', 'reg_code', 'reg_name', 'pro_code', 'pro_name'];

// Columns that get a multi-select filter in the header
const FILTER_KEYS = ['reg_code', 'reg_name', 'pro_code', 'pro_name'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string[]>;

const EMPTY_FILTERS: Filters = { reg_code: [], reg_name: [], pro_code: [], pro_name: [] };

function uniqueSorted(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
}

const DEFAULT_SORT: DataTableSortStatus<Province> = { columnAccessor: 'pro_name', direction: 'asc' };

export default function DataTableProvince() {
  const provinces = useProvinceStore((s) => s.province);
  const selectedId = useProvinceStore((s) => s.selectedId);
  const selectAndZoom = useProvinceStore((s) => s.selectAndZoom);
  const zoomRequest = useProvinceStore((s) => s.zoomRequest);

  // ----- UI state ------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Province>>(DEFAULT_SORT);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const setFilter = (key: FilterKey, values: string[]) =>
    setFilters((cur) => ({ ...cur, [key]: values }));

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'province-visible-columns-v1',
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

  // Dropdown options for every filter, rebuilt only when the data changes
  const filterOptions = useMemo(
    () =>
      Object.fromEntries(
        FILTER_KEYS.map((k) => [k, uniqueSorted(provinces.map((r) => r[k] as string | null))])
      ) as Record<FilterKey, string[]>,
    [provinces]
  );

  // ----- Data pipeline: filter -> search -> sort -> page ---------------------
  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    // Only the filters that are actually in use; Sets make the lookup fast
    const active = FILTER_KEYS.filter((k) => filters[k].length > 0).map(
      (k) => [k, new Set(filters[k])] as const
    );

    return provinces.filter((r) => {
      for (const [key, values] of active) {
        if (!values.has(String(r[key] ?? ''))) return false;
      }
      if (q && !SEARCH_FIELDS.some((k) => String(r[k] ?? '').toLowerCase().includes(q))) {
        return false;
      }
      return true;
    });
  }, [provinces, debouncedSearch, filters]);

  const sortedRows = useMemo(() => {
    const key = sortStatus.columnAccessor as keyof Province;
    const dir = sortStatus.direction === 'asc' ? 1 : -1;
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
  }, [filteredRows, sortStatus]);

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

  // pendingReveal: "jump to the page of the selected row" is waiting to be done.
  // Set on every new selection / zoom request (map click or row click).
  const pendingReveal = useRef(false);

  // Back to the start whenever the result set changes (but not while a reveal is pending,
  // otherwise it would undo the jump, e.g. right after the search box was cleared)
  useEffect(() => {
    if (pendingReveal.current) return;
    setOffset(0);
  }, [debouncedSearch, provinces, filters]);

  // ----- Selection: jump to the page that contains the selected row ----------
  // Triggered by selectedId AND by each new zoomRequest, so clicking the same province on the
  // map again (after paging away in the table) also brings the table back to it.
  useEffect(() => {
    if (selectedId !== null) pendingReveal.current = true;
  }, [selectedId, zoomRequest]);

  useEffect(() => {
    if (!pendingReveal.current || selectedId === null || !debouncedHeight) return;
    const idx = sortedRows.findIndex((r) => String(r.id) === String(selectedId));
    if (idx >= 0) {
      pendingReveal.current = false;
      setOffset(Math.floor(idx / pageSize) * pageSize);
      return;
    }

    const hasFilters = FILTER_KEYS.some((k) => filters[k].length > 0);
    if (search || debouncedSearch || hasFilters) {
      // Selected row is hidden by the search or a column filter -> clear them and WAIT: this
      // effect runs again when they are empty and sortedRows is the full list.
      if (search) setSearch('');
      if (hasFilters) setFilters(EMPTY_FILTERS);
    } else {
      pendingReveal.current = false; // not in the data at all
    }
  }, [
    selectedId,
    zoomRequest,
    sortedRows,
    pageSize,
    debouncedHeight,
    search,
    debouncedSearch,
    filters,
  ]);

  const records = useMemo(() => {
    const from = (page - 1) * pageSize;
    return sortedRows.slice(from, from + pageSize);
  }, [sortedRows, page, pageSize]);

  // ----- Row click: select + zoom to extent ----------------------------------
  const handleRowClick = (record: Province) => {
    selectAndZoom(Number(record.id)); // the map layer does the zooming
  };

  // ----- Columns -------------------------------------------------------------
  const columns: DataTableColumn<Province>[] = useMemo(
    () =>
      COLUMN_DEFS.map((def) => {
        const col: DataTableColumn<Province> = {
          accessor: def.accessor,
          title: def.title,
          width: def.width,
          textAlign: def.textAlign,
          hidden: !visible.includes(def.accessor as string),
        };

        if ((FILTER_KEYS as readonly string[]).includes(def.accessor as string)) {
          const key = def.accessor as FilterKey;
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
              limit={100}
              comboboxProps={{ withinPortal: false }}
            />
          );
        }

        return col;
      }),
    [visible, filters, filterOptions]
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
        justify="space-between"
      >
        <TextInput
          size="xs"
          placeholder="Search province or region..."
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
          <DataTable<Province>
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
            storeColumnsKey="province-table-columns-v1"
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
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
            totalRecords={sortedRows.length}
            recordsPerPage={pageSize}
            page={page}
            onPageChange={(p) => setOffset((p - 1) * pageSize)}
            onRowClick={({ record }) => handleRowClick(record)}
            rowStyle={(record) => ({
              cursor: 'pointer',
              backgroundColor:
                selectedId !== null && String(record.id) === String(selectedId)
                  ? SELECTED_ROW_BG
                  : undefined,
            })}
            noRecordsText="No provinces found"
          />
        </Box>
      </Box>
    </Box>
  );
}