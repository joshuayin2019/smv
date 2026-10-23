import { useTablePageSize } from '@/hooks/use_table_page_size';
import { pageForTableSize } from '@/lib/table_paging';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Box, Button, Checkbox, Group, Menu, Select, TextInput } from '@mantine/core';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { IconColumns3, IconSearch } from '@tabler/icons-react';
import { useGlobalStore } from '@/stores/global_stores';
import { useBarangayClassStore } from '@/stores/demographic/barangay_class_stores';
import { BARANGAY_CLASSES, classLabel, type BarangayClassRow } from '@/lib/pages/demographic/barangay_class/barangay_class_config';
import { basePath } from '@/lib/config';
import { BORDER, HEADER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';

const URL = `${basePath}/api/pages/demographic/barangay_class/table`;
const DEFINITIONS = [
  { accessor: 'code', title: 'Code', width: 150 },
  { accessor: 'name', title: 'Barangay', width: 220 },
  { accessor: 'urban_rural', title: 'Class', width: 130 },
  { accessor: 'mun_name', title: 'City / Municipality', width: 240 },
  { accessor: 'pro_name', title: 'Province', width: 230 },
  { accessor: 'reg_name', title: 'Region', width: 250 },
] as const;
const FILTERS = ['reg_name', 'pro_name', 'mun_name'] as const;
const EMPTY = { reg_name: '', pro_name: '', mun_name: '' };

export default function DataTableBarangayClass() {
  const scope = useGlobalStore(s => s.auth?.scope_psa);
  const selected = useBarangayClassStore(s => s.selectedBarangayClass);
  const setSelected = useBarangayClassStore(s => s.setSelectedBarangayClass);
  const setQuery = useBarangayClassStore(s => s.setBarangayClassTableQuery);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY);
  const inputs = useMemo(() => ({ search, filters }), [search, filters]);
  const [debounced] = useDebouncedValue(inputs, 300);
  const [classification, setClassification] = useState<string | null>(null);
  const [sort, setSort] = useState<DataTableSortStatus<BarangayClassRow>>({ columnAccessor: 'name', direction: 'asc' });
  const { tableRef, pageSize } = useTablePageSize();
  const [visible, setVisible] = useLocalStorage<string[]>({ key: 'barangay-class-columns-v1', defaultValue: DEFINITIONS.map(c => c.accessor) });
  const base = new URLSearchParams({ scope: JSON.stringify(scope ?? []), level: 'barangay', search: debounced.search.trim(),
    filters: JSON.stringify(debounced.filters), classification: classification ?? '', sort: String(sort.columnAccessor), dir: sort.direction }).toString();
  const pageKey = `${base}&ps=${pageSize}`;
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const page = pageForTableSize(paging, base, pageSize);
  const [data, setData] = useState<{ rows: BarangayClassRow[]; total: number }>({ rows: [], total: 0 });
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setQuery(base); }, [base, setQuery]);
  useEffect(() => {
    const ctrl = new AbortController();
    setFetching(true); setError('');
    fetch(`${URL}?${base}&page=${page}&pageSize=${pageSize}`, { signal: ctrl.signal })
      .then(async response => { if (!response.ok) throw new Error('Could not load barangay classes'); return response.json(); })
      .then(result => { if (!ctrl.signal.aborted) { setData(result); setFetching(false); } })
      .catch(e => { if (!ctrl.signal.aborted) { setError(e.message); setFetching(false); } });
    return () => ctrl.abort();
  }, [base, page, pageSize]);
  const latest = useRef({ base, pageSize, pageKey, rows: data.rows });
  latest.current = { base, pageSize, pageKey, rows: data.rows };
  useEffect(() => {
    if (!selected?.code) return;
    const current = latest.current;
    if (current.rows.some(row => row.code === selected.code)) return;
    const ctrl = new AbortController();
    const sp = new URLSearchParams(current.base);
    sp.set('id', selected.code); sp.set('pageSize', String(current.pageSize));
    fetch(`${URL}/locate?${sp}`, { signal: ctrl.signal }).then(async response => response.ok ? response.json() : null)
      .then(result => { if (!ctrl.signal.aborted && result?.found && result.page) setPaging({ key: current.pageKey, page: result.page }); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [selected?.code]);
  useEffect(() => () => { setQuery(null); setSelected(null); }, [setQuery, setSelected]);

  const columns: DataTableColumn<BarangayClassRow>[] = useMemo(() => DEFINITIONS.map(def => ({
    ...def, hidden: !visible.includes(def.accessor),
    ...(def.accessor === 'urban_rural' ? { render: (row: BarangayClassRow) => <Badge size="sm" color={BARANGAY_CLASSES.find(c => c.value === row.urban_rural)?.color}>{classLabel(row.urban_rural)}</Badge> } : {}),
    ...(FILTERS.includes(def.accessor as typeof FILTERS[number]) ? {
      filtering: !!filters[def.accessor as keyof typeof filters],
      filter: <TextInput size="xs" label={def.title} value={filters[def.accessor as keyof typeof filters]} onChange={event => {
        const value = event.currentTarget.value; setFilters(current => ({ ...current, [def.accessor]: value }));
      }} />,
    } : {}),
  })), [visible, filters]);
  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group p="xs" gap="xs" wrap="nowrap" bg={PANEL_BG} style={{ borderBottom: `1px solid ${BORDER}` }}>
        <TextInput size="xs" placeholder="Search barangay or code…" leftSection={<IconSearch size={14} />} value={search}
          onChange={e => setSearch(e.currentTarget.value)} style={{ flex: 1, minWidth: 120 }} />
        <Select size="xs" placeholder="All classes" clearable value={classification} onChange={setClassification}
          data={BARANGAY_CLASSES.map(c => ({ value: c.value, label: c.label }))} w={135} />
        <Button size="xs" variant="subtle" onClick={() => { setSearch(''); setFilters(EMPTY); setClassification(null); }}>Clear filters</Button>
        <Menu closeOnItemClick={false}><Menu.Target><Button size="xs" variant="default" leftSection={<IconColumns3 size={14} />}>Columns</Button></Menu.Target>
          <Menu.Dropdown>{DEFINITIONS.map(def => <Box key={def.accessor} p={6}><Checkbox size="xs" label={def.title}
            checked={visible.includes(def.accessor)} disabled={visible.length === 1 && visible.includes(def.accessor)}
            onChange={() => setVisible(current => current.includes(def.accessor) ? current.filter(key => key !== def.accessor) : [...current, def.accessor])} /></Box>)}</Menu.Dropdown>
        </Menu>
      </Group>
      <Box ref={tableRef} pos="relative" style={{ flex: 1, minHeight: 0 }}><Box pos="absolute" inset={0}>
        <DataTable<BarangayClassRow> height="100%" idAccessor="code" records={data.rows} columns={columns} fetching={fetching}
          withTableBorder withColumnBorders striped highlightOnHover fz="xs" borderColor={BORDER} rowBorderColor={BORDER}
          defaultColumnProps={{ sortable: true, noWrap: true, ellipsis: true, resizable: true, draggable: true }}
          storeColumnsKey="barangay-class-table-v1" styles={{ header: { background: HEADER_BG, color: NAVY } }}
          sortStatus={sort} onSortStatusChange={setSort} page={page} onPageChange={p => setPaging({ key: pageKey, page: p })}
          totalRecords={data.total} recordsPerPage={pageSize}
          paginationText={({ from, to }) => `${from} - ${to} of ${data.total.toLocaleString()}`}
          noRecordsText={error || 'No barangays found'} onRowClick={({ record }) => setSelected({ ...record, level: 'barangay' })}
          rowStyle={row => ({ cursor: 'pointer', ...(row.code === selected?.code ? { backgroundColor: 'var(--mantine-color-blue-1)' } : {}) })} />
      </Box></Box>
    </Box>
  );
}
