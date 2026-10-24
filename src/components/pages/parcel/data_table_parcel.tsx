import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { ActionIcon, Alert, Box, Button, Checkbox, Group, Menu, Select, Text, TextInput } from '@mantine/core';
import { IconColumns3, IconFocus2, IconRefresh, IconSearch, IconX } from '@tabler/icons-react';
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable';
import { useTablePageSize } from '@/hooks/use_table_page_size';
import { pageForTableSize } from '@/lib/table_paging';
import { basePath } from '@/lib/config';
import { BORDER, HEADER_BG, HOVER_BG, NAVY, PANEL_BG } from '@/lib/theme_colors';
import { useGlobalStore } from '@/stores/global_stores';
import { useMapStore } from '@/stores/map_stores';
import { useParcelStore } from '@/stores/parcel_stores';
import { PARCEL_CLASSES, type ParcelResult, type ParcelRow } from '@/lib/pages/parcel/parcel_types';

const COLUMN_DEFS = [
  { accessor: 'id',title: 'ID',width: 90 },
  { accessor: 'parcel_id',title: 'Parcel ID',width: 230 },
  { accessor: 'parcel_name',title: 'Name',width: 260 },
  { accessor: 'classification',title: 'Classification',width: 160 },
  { accessor: 'bgy_name',title: 'Barangay',width: 160 },
  { accessor: 'mun_name',title: 'City / Municipality',width: 190 },
  { accessor: 'pro_name',title: 'Province',width: 260 },
  { accessor: 'reg_name',title: 'Region',width: 200 },
  { accessor: 'source',title: 'Source',width: 180 },
  { accessor: 'as_of',title: 'As Of',width: 110 },
];
const ALL = COLUMN_DEFS.map(c => c.accessor);

export default function DataTableParcel() {
  const { search,classification,setFilters,selected,select,revision,refresh,setTableQuery } = useParcelStore();
  const [input,setInput] = useState(search);
  const [debounced] = useDebouncedValue(input,350);
  const scopeKey = JSON.stringify(useGlobalStore(s => s.auth?.scope_parcel) ?? []);
  const map = useMapStore(s => s.map);
  const { tableRef,pageSize } = useTablePageSize();
  const [sort,setSort] = useState<DataTableSortStatus<ParcelRow>>({ columnAccessor: 'parcel_name',direction: 'asc' });
  const [visible,setVisible] = useLocalStorage<string[]>({ key: 'parcel-visible-columns-v1',defaultValue: ALL });
  const queryKey = new URLSearchParams({ search,classification,sort: String(sort.columnAccessor),direction: sort.direction,scopeKey,revision: String(revision) }).toString();
  const pageKey = `${queryKey}&ps=${pageSize}`;
  const [pageState,setPageState] = useState({ key: '',page: 1 });
  const page = pageForTableSize(pageState,queryKey,pageSize);
  const requestKey = `${pageKey}&page=${page}`;
  const [loaded,setLoaded] = useState<{ key: string; data: ParcelResult } | null>(null);
  const [fetching,setFetching] = useState(true);
  const [error,setError] = useState('');
  const [selectionNotice,setSelectionNotice] = useState('');
  const fitted = useRef('');
  const lastRevision = useRef(revision);
  const current = loaded?.key === requestKey ? loaded.data : null;
  useEffect(() => { if (debounced !== search) setFilters(debounced,classification); },[debounced,search,classification,setFilters]);
  useEffect(() => { select(null); },[scopeKey,select]);
  useEffect(() => {
    const ctrl = new AbortController();
    setFetching(true); setError('');
    const params = new URLSearchParams({ search,classification,sort: String(sort.columnAccessor),direction: sort.direction,pageSize: String(pageSize),page: String(page) });
    if (lastRevision.current !== revision) params.set('refresh','1');
    lastRevision.current = revision;
    setTableQuery(params.toString());
    fetch(`${basePath}/api/pages/parcel?${params}`,{ signal: ctrl.signal })
      .then(async r => { if (!r.ok) throw new Error('Unable to load parcels. Please retry.'); return r.json(); })
      .then(data => { if (!ctrl.signal.aborted) { setLoaded({ key: requestKey,data }); setFetching(false); } })
      .catch(e => { if (!ctrl.signal.aborted) { setError(e.message); setFetching(false); } });
    return () => ctrl.abort();
  },[requestKey,search,classification,sort.columnAccessor,sort.direction,pageSize,page,revision,setTableQuery]);
  const fit = (bounds: number[]) => {
    if (map && bounds?.length === 4 && bounds.every(Number.isFinite)) map.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]],{ padding: 45,maxZoom: 18,duration: 700 });
  };
  useEffect(() => {
    if (map && current?.bounds && !selected?.id && fitted.current !== scopeKey) {
      fitted.current = scopeKey;
      map.fitBounds([[current.bounds[0],current.bounds[1]],[current.bounds[2],current.bounds[3]]],{ padding: 45,maxZoom: 14 });
    }
  },[map,current,scopeKey,selected?.id]);
  useEffect(() => {
    if (!selected?.id) { setSelectionNotice(''); return; }
    const ctrl = new AbortController();
    setSelectionNotice('');
    const params = new URLSearchParams({ search,classification,sort: String(sort.columnAccessor),direction: sort.direction,pageSize: String(pageSize),id: selected.id,locate: '1' });
    fetch(`${basePath}/api/pages/parcel?${params}`,{ signal: ctrl.signal })
      .then(async r => { if (!r.ok) throw new Error('Unable to locate the parcel in the table.'); return r.json(); })
      .then(data => {
        if (ctrl.signal.aborted) return;
        if (data.reachable && data.page) setPageState({ key: pageKey,page: data.page });
        else setSelectionNotice(data.found ? 'Selected parcel is beyond the first 10,000 records. Narrow the search to reach it.' : 'Selected parcel does not match the current table filters.');
      })
      .catch(e => { if (!ctrl.signal.aborted) setSelectionNotice(e.message); });
    return () => ctrl.abort();
  },[selected?.id,pageKey,search,classification,sort.columnAccessor,sort.direction,pageSize]);
  const columns = useMemo<DataTableColumn<ParcelRow>[]>(() => COLUMN_DEFS.map(def => ({
    ...def, hidden: !visible.includes(def.accessor),textAlign: def.accessor === 'id' ? 'right' : 'left',
    ...(def.accessor === 'classification' ? {
      filtering: !!classification,
      filter: <Select size="xs" label="Classification" clearable placeholder="All classifications" data={PARCEL_CLASSES.map(c => c.name)} value={classification || null} onChange={v => setFilters(search,v || '')}/>,
    } : {}),
  })),[visible,classification,search,setFilters]);
  const total = current?.total || 0;
  const totalLabel = total.toLocaleString('en-PH') + (current?.capped ? '+' : '');
  return <Box h="100%" w="100%" style={{ display: 'flex',flexDirection: 'column' }}>
    <Group gap="xs" px="xs" py={6} wrap="nowrap" bg={PANEL_BG} justify="space-between" style={{ flexShrink: 0,borderBottom: `1px solid ${BORDER}` }}>
      <TextInput size="xs" placeholder="Search name or ID..." leftSection={<IconSearch size={14}/>} value={input} onChange={e => setInput(e.currentTarget.value)}
        rightSection={input ? <ActionIcon size="xs" variant="subtle" color="gray" aria-label="Clear search" onClick={() => setInput('')}><IconX size={12}/></ActionIcon> : null} style={{ flex: 1,maxWidth: 360 }}/>
      <Menu shadow="md" position="bottom-end" closeOnItemClick={false}><Menu.Target><Button size="xs" variant="default" c={NAVY} leftSection={<IconColumns3 size={14}/>}>Columns</Button></Menu.Target>
        <Menu.Dropdown><Menu.Label>Show columns</Menu.Label>{COLUMN_DEFS.map(c => <Box key={c.accessor} px="sm" py={4}><Checkbox size="xs" label={c.title} checked={visible.includes(c.accessor)} disabled={visible.includes(c.accessor) && visible.length === 1}
          onChange={() => setVisible(visible.includes(c.accessor) ? visible.filter(x => x !== c.accessor) : [...visible,c.accessor])}/></Box>)}<Menu.Divider/><Menu.Item onClick={() => setVisible(ALL)}>Show all</Menu.Item></Menu.Dropdown>
      </Menu>
    </Group>
    <Group gap="xs" px="xs" py={6} bg={PANEL_BG} style={{ flexShrink: 0,borderBottom: `1px solid ${BORDER}` }}>
      <Select size="xs" clearable placeholder="All classifications" aria-label="Classification" data={PARCEL_CLASSES.map(c => c.name)} value={classification || null} onChange={v => setFilters(search,v || '')} w={180}/>
      <Button size="xs" variant="default" c={NAVY} leftSection={<IconFocus2 size={14}/>} disabled={!current?.bounds || !map} onClick={() => current?.bounds && fit(current.bounds)}>Fit results</Button>
      <Button size="xs" variant="default" c={NAVY} leftSection={<IconRefresh size={14}/>} onClick={refresh}>Refresh</Button>
    </Group>
    {total > 10000 && <Text fz={11} c="dimmed" px="xs" py={4} bg={PANEL_BG} style={{ flexShrink: 0 }}>{totalLabel} matches. Only the first 10,000 can be paged: use search or classification to narrow the result.</Text>}
    {error && <Alert color="red" p="xs">{error}</Alert>}
    {selectionNotice && <Text size="xs" c="orange" px="xs" py={4}>{selectionNotice}</Text>}
    <Box ref={tableRef} pos="relative" style={{ flex: 1,minHeight: 0 }}><Box pos="absolute" inset={0}>
      <DataTable<ParcelRow> height="100%" withTableBorder withColumnBorders striped stripedColor={PANEL_BG} highlightOnHover highlightOnHoverColor={HOVER_BG}
        borderColor={BORDER} rowBorderColor={BORDER} paginationActiveBackgroundColor={NAVY} paginationActiveTextColor="#fff" fz="xs" verticalAlign="top" idAccessor="id"
        storeColumnsKey="parcel-table-columns-v1" defaultColumnProps={{ noWrap: true,ellipsis: true,sortable: true,draggable: true,resizable: true }}
        styles={{ table: { minWidth: '100%' },header: { backgroundColor: HEADER_BG,color: NAVY },pagination: { backgroundColor: PANEL_BG } }}
        columns={columns} records={current?.rows || []} fetching={fetching} sortStatus={sort} onSortStatusChange={setSort}
        totalRecords={Math.min(total,10000)} recordsPerPage={pageSize} page={current?.page || page} onPageChange={p => setPageState({ key: pageKey,page: p })}
        paginationText={({ from,to }) => `${from} - ${to} of ${totalLabel}`} onRowClick={({ record }) => select(record)}
        rowStyle={row => ({ cursor: 'pointer',...(row.id === selected?.id ? { backgroundColor: 'var(--mantine-color-blue-1)' } : {}) })}
        noRecordsText={error || 'No parcels found in your assigned scope'}/>
    </Box></Box>

  </Box>;
}
