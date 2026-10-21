import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Box, Button, Checkbox, Group, Menu, TextInput } from '@mantine/core';
import { useDebouncedValue, useElementSize, useLocalStorage } from '@mantine/hooks';
import { IconColumns3, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { useRegionStore, type Region } from '@/stores/boundary/region_stores';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

// Measured from the rendered table (fz="xs"); tweak if a little blank space remains
const ROW_HEIGHT = 30.5;
const HEADER_HEIGHT = 31;
const FOOTER_HEIGHT = 42;

const SELECTED_ROW_BG = '#fef3c7';

// All columns the user can show/hide, with a default width in px (the user can resize them)
const COLUMN_DEFS: {
  accessor: keyof Region;
  title: string;
  width: number;
  textAlign?: 'left' | 'right';
}[] = [
  { accessor: 'id', title: 'ID', width: 90, textAlign: 'right' },
  { accessor: 'reg_code', title: 'Region Code', width: 140 },
  { accessor: 'reg_name', title: 'Region Name', width: 320 },
];
const ALL_ACCESSORS = COLUMN_DEFS.map((c) => c.accessor as string);

// Fields the global search looks at
const SEARCH_FIELDS: (keyof Region)[] = ['id', 'reg_code', 'reg_name'];

const DEFAULT_SORT: DataTableSortStatus<Region> = { columnAccessor: 'reg_name', direction: 'asc' };

export default function DataTableRegion() {
  const regions = useRegionStore((s) => s.regions);
  const selectedId = useRegionStore((s) => s.selectedId);
  const selectAndZoom = useRegionStore((s) => s.selectAndZoom);
  const zoomRequest = useRegionStore((s) => s.zoomRequest);

  // ----- UI state ------------------------------------------------------------
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Region>>(DEFAULT_SORT);

  // Which columns are displayed (remembered between visits)
  const [visible, setVisible] = useLocalStorage<string[]>({
    key: 'region-visible-columns-v1',
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

  // ----- Data pipeline: search -> sort -> page -------------------------------
  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter((r) =>
      SEARCH_FIELDS.some((k) => String(r[k] ?? '').toLowerCase().includes(q))
    );
  }, [regions, debouncedSearch]);

  const sortedRows = useMemo(() => {
    const key = sortStatus.columnAccessor as keyof Region;
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
  // Set on every new selection / zoom request (map click or row click), and on mount.
  const pendingReveal = useRef(false);

  // Back to the start whenever the result set changes (but not while a reveal is pending,
  // otherwise it would undo the jump, e.g. right after the search box was cleared)
  useEffect(() => {
    if (pendingReveal.current) return;
    setOffset(0);
  }, [debouncedSearch, regions]);

  // ----- Selection: jump to the page that contains the selected row ----------
  // Triggered by selectedId AND by each new zoomRequest, so clicking the same region on the
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
    } else if (search || debouncedSearch) {
      // Selected row is hidden by the search filter -> clear it and WAIT: this effect runs
      // again when debouncedSearch becomes '' and sortedRows is the full list.
      if (search) setSearch('');
    } else {
      pendingReveal.current = false; // not in the data at all
    }
  }, [selectedId, zoomRequest, sortedRows, pageSize, debouncedHeight, search, debouncedSearch]);

  const records = useMemo(() => {
    const from = (page - 1) * pageSize;
    return sortedRows.slice(from, from + pageSize);
  }, [sortedRows, page, pageSize]);

  // ----- Row click: select + zoom to extent ----------------------------------
  const handleRowClick = (record: Region) => {
    console.log('[DataTableRegion] row click', record);
    selectAndZoom(record.id); // the map layer does the zooming
  };

  // ----- Columns -------------------------------------------------------------
  const columns: DataTableColumn<Region>[] = useMemo(
    () =>
      COLUMN_DEFS.map((def) => ({
        accessor: def.accessor,
        title: def.title,
        width: def.width,
        textAlign: def.textAlign,
        hidden: !visible.includes(def.accessor as string),
      })),
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
        justify="space-between"
      >
        <TextInput
          size="xs"
          placeholder="Search region code or name..."
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
          <DataTable<Region>
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
            storeColumnsKey="region-table-columns-v1"
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
            noRecordsText="No regions found"
          />
        </Box>
      </Box>
    </Box>
  );
}