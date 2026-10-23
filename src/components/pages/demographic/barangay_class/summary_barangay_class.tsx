import { useEffect, useState } from 'react';
import { Box, Group, LoadingOverlay, Select, Stack, Switch, Tabs, Text, Tooltip } from '@mantine/core';
import { BarChart, DonutChart } from '@mantine/charts';
import { BARANGAY_CLASSES } from '@/lib/pages/demographic/barangay_class/barangay_class_config';
import { useBarangayClassStore } from '@/stores/demographic/barangay_class_stores';
import { basePath } from '@/lib/config';

export default function SummaryBarangayClass({ active = true }: { active?: boolean }) {
  const [tab, setTab] = useState<string | null>('legend');
  const [chart, setChart] = useState<string | null>('donut');
  const query = useBarangayClassStore(s => s.barangay_classTableQuery);
  const hover = useBarangayClassStore(s => s.boundaryHoverEnabled);
  const setHover = useBarangayClassStore(s => s.setBoundaryHoverEnabled);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sp = new URLSearchParams(query ?? ''); sp.delete('sort'); sp.delete('dir');
  const summaryQuery = sp.toString();
  useEffect(() => {
    if (!active || tab !== 'charts' || !summaryQuery) return;
    const ctrl = new AbortController();
    setLoading(true); setError('');
    fetch(`${basePath}/api/pages/demographic/barangay_class/summary?${summaryQuery}`, { signal: ctrl.signal })
      .then(async response => { if (!response.ok) throw new Error('Could not load class summary'); return response.json(); })
      .then((rows: { classification: string; count: number }[]) => { if (!ctrl.signal.aborted) { setCounts(Object.fromEntries(rows.map(r => [r.classification, Number(r.count)]))); setLoading(false); } })
      .catch(e => { if (!ctrl.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => ctrl.abort();
  }, [active, tab, summaryQuery]);
  const data = BARANGAY_CLASSES.map(c => ({ name: c.label, value: counts[c.value] ?? 0, color: c.color }));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Tabs value={tab} onChange={setTab} h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Tabs.List><Tabs.Tab value="legend">Legend</Tabs.Tab><Tabs.Tab value="charts">Charts</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="legend" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <Stack p="sm" gap="xs">
          <Group justify="space-between" wrap="nowrap"><Text size="sm" fw={700}>Barangay Class</Text>
            <Tooltip label="Show the barangay class when hovering over its boundary"><Switch size="xs" label="Hover details" labelPosition="left" checked={hover} onChange={e => setHover(e.currentTarget.checked)} /></Tooltip>
          </Group>
          {BARANGAY_CLASSES.map(c => <Group key={c.value} gap="xs"><Box w={14} h={14} style={{ background: c.color }} /><Text size="xs">{c.label}{c.value !== 'Unknown' ? ` (${c.value})` : ''}</Text></Group>)}
          <Text size="xs" c="dimmed">Only U and R are recognized. Blank, missing and all other values are Unknown.</Text>
          <Text size="xs" c="dimmed">Click a barangay or table row to select and zoom.</Text>
          <Group gap="xs"><Box w={14} h={14} style={{ border: '2px solid #ff2d55' }} /><Text size="xs">Selected barangay</Text></Group>
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="charts" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <Stack p="sm" gap="xs">
          <Select size="xs" label="Chart" value={chart} onChange={setChart} allowDeselect={false} data={[{ value: 'donut', label: 'Donut' }, { value: 'bar', label: 'Bar' }]} />
          <Text size="sm" fw={700}>Barangays by class</Text><Text size="xs" c="dimmed">{total.toLocaleString()} barangays matching table filters</Text>
          {error && <Text size="xs" c="red">{error}</Text>}
          <Box pos="relative" mih={240}>
            <LoadingOverlay visible={loading} loaderProps={{ size: 'sm' }} />
            {total === 0 ? <Text size="xs" c="dimmed">No barangays found</Text> : chart === 'bar'
              ? <BarChart h={240} data={data.map(d => ({ name: d.name, Count: d.value, color: d.color }))} dataKey="name" series={[{ name: 'Count', color: '#163f78' }]} />
              : <DonutChart h={240} data={data} withLabels withTooltip />}
          </Box>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}
