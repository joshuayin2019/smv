// FILE: src/components/.../data_table_municipality.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Box, Button, Checkbox, Group, Menu, TextInput } from '@mantine/core';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { IconColumns3, IconFilterOff, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import {
  useMunicipalityStore,
  type Municipality,
} from '@/stores/boundary/municipality_stores';
import { basePath } from '@/lib/config';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

type TableResponse = {
  total: number; // rows matching the search / filters
  rows: Municipality[]; // the current page only
};

// The response + the row offset of the page it holds
type LoadedPage = TableResponse & { offset: number };

// Answer of the locate route: on which page the municipality sits in the current result
type LocateResponse = {
  found: boolean;
  page: number | null; // 1-based
};

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Background of the selected row
const SELECTED_ROW_BG = '#fef3c7';

const tableUrl = () => `${basePath}/api/pages/boundary/city/table`;
const locateUrl = () => `${basePath}/api/pages/boundary/city/table/locate`;

// All columns the user can show/hide, with a default width in px (the user can resize them)
const COLUMN_DEFS: {
  accessor: keyof Municipality;
  title: string;
  width: number;
  textAlign?: 'left' | 'right';
}[] = [
  { accessor: 'id', title: 'ID', width: 90, textAlign: 'right' },
  { accessor: 'reg_code', title: 'Region Code', width: 140 },
  { accessor: 'reg_name', title: 'Region Name', width: 320 },
  { accessor: 'pro_code', title: 'Province Code', width: 140 },
  { accessor: 'pro_name', title: 'Province Name', width: 260 },
  { accessor: 'mun_code', title: 'Municipality Code', width: 160 },
  { accessor: 'mun_name', title: 'Municipality Name', width: 280 },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);

// Columns that get a text search in the header (the server knows the same keys)
const FILTER_KEYS = ['reg_code', 'reg_name', 'pro_code', 'pro_name', 'mun_code', 'mun_name'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string>;

const EMPTY_FILTERS: Filters = {
  reg_code: '',
  reg_name: '',
  pro_code: '',
  pro_name: '',
  mun_code: '',
  mun_name: '',
};

const DEFAULT_SORT: DataTableSortStatus<Municipality> = {
  columnAccessor: 'mun_name',
  direction: 'asc',
};

// Everything that decides WHICH rows the server returns and in what order (no paging).
// The string form is also the key of the request.
function buildQuery(o: {
  search: string;
  filters: Filters;
  sort: DataTableSortStatus<Municipality>;
}): string {
  const sp = new URLSearchParams();
  if (o.search.trim()) sp.set('search', o.search.trim());

  const active = Object.fromEntries(
    FILTER_KEYS.filter((k) => o.filters[k].trim() !== '').map((k) => [k, o.filters[k].trim()])
  );
  if (Object.keys(active).length > 0) sp.set('filters', JSON.stringify(active));

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

export default function DataTableMunicipality() {
  const selectedId = useMunicipalityStore((s) => s.selectedId);
  const selectAndZoom = useMunicipalityStore((s) => s.selectAndZoom);
  const zoomRequest = useMunicipalityStore((s) => s.zoomRequest);

  // ----- UI state (updates instantly) ---------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  // typing in a column filter would otherwise send a request per keystroke
  const [debouncedFilters] = useDebouncedValue(filters, 300);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Municipality>>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const setFilter = (key: FilterKey, text: string) =>
    setFilters((cur) => ({ ...cur, [key]: text }));

  const hasTextFilters = search.trim() !== '' || FILTER_KEYS.some((k) => filters[k].trim() !== '');
  const clearTextFilters = () => {
    setSearch('');
    setFilters(EMPTY_FILTERS);
  };

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'municipality-visible-columns-v2',
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
    () => buildQuery({ search: debouncedSearch, filters: debouncedFilters, sort: sortStatus }),
    [debouncedSearch, debouncedFilters, sortStatus]
  );

  // The page belongs to one query and one page size: a new query (search, filter, sort)
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

    fetch(`${tableUrl()}?${sp}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load municipalities (${res.status})`);
        return res.json() as Promise<TableResponse>;
      })
      .then((d) => {
        setData({ total: d.total ?? 0, rows: Array.isArray(d.rows) ? d.rows : [], offset });
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
  // 0 ("No municipalities found") while rows are displayed.
  const records = data?.rows ?? [];
  const seen = data ? data.offset + records.length : 0;
  const total = Math.max(data?.total ?? 0, seen);
  const totalLabel = data ? total.toLocaleString() : '…';

  // ----- A municipality selected (map click or row click): jump to its page ---
  // pendingReveal: "jump to the page of the selected row" is waiting to be done. Set on every new
  // selection / zoom request, so clicking the same municipality on the map again (after paging
  // away in the table) also brings the table back to it.
  // The latest query lives in a ref, so a new page of data does not restart the jump.
  const pendingReveal = useRef(false);
  const latest = useRef({ baseKey, pageKey, pageSize, rows: records, hasTextFilters });
  latest.current = { baseKey, pageKey, pageSize, rows: records, hasTextFilters };

  useEffect(() => {
    if (selectedId !== null) pendingReveal.current = true;
  }, [selectedId, zoomRequest]);

  // Runs on a new selection / zoom request and again when the query changes while a jump is pending
  // (for example right after the filters were cleared because they hid the selected row)
  useEffect(() => {
    if (!pendingReveal.current || selectedId === null) return;
    const cur = latest.current;

    // already on this page (e.g. clicked in the table)
    if (cur.rows.some((r) => String(r.id) === String(selectedId))) {
      pendingReveal.current = false;
      return;
    }

    const sp = new URLSearchParams(cur.baseKey);
    sp.set('id', String(selectedId));
    sp.set('pageSize', String(cur.pageSize));

    const ctrl = new AbortController();
    fetch(`${locateUrl()}?${sp}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<LocateResponse>) : null))
      .then((loc) => {
        if (!loc) {
          pendingReveal.current = false;
          return;
        }
        if (loc.found && loc.page) {
          pendingReveal.current = false;
          // the query changed while waiting: this answer is stale, the effect runs again
          if (latest.current.pageKey === cur.pageKey) {
            setPageState({ key: cur.pageKey, page: loc.page });
          }
          return;
        }
        if (latest.current.hasTextFilters) {
          // Hidden by the search or a column filter -> clear them and WAIT: this effect runs
          // again when the query changes and the selected row is part of the full list.
          clearTextFilters();
        } else {
          pendingReveal.current = false; // not in the data at all
        }
      })
      .catch(() => {
        // aborted or failed: the table stays where it is
      });

    return () => ctrl.abort();
  }, [selectedId, zoomRequest, baseKey, pageSize]);

  // ----- Row click: select + zoom to extent ----------------------------------
  const handleRowClick = (record: Municipality) => {
    selectAndZoom(Number(record.id)); // the map layer does the zooming
  };

  // ----- Columns -------------------------------------------------------------
  const columns: DataTableColumn<Municipality>[] = useMemo(
    () =>
      COLUMN_DEFS.map((def) => {
        const col: DataTableColumn<Municipality> = {
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
      }),
    [visible, filters]
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
          placeholder="Search municipality, province or region..."
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

      {/* Table area */}
      <Box pos="relative" style={{ flex: 1, minHeight: 0 }}>
        <Box pos="absolute" inset={0}>
          <DataTable<Municipality>
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
            storeColumnsKey="municipality-table-columns-v2"
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
              backgroundColor:
                selectedId !== null && String(record.id) === String(selectedId)
                  ? SELECTED_ROW_BG
                  : undefined,
            })}
            noRecordsText={error ?? 'No municipalities found'}
          />
        </Box>
      </Box>
    </Box>
  );
}