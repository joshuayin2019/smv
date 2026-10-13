import { useEffect, useMemo, useState } from 'react';
import { Box } from '@mantine/core';
import { useDebouncedValue, useElementSize } from '@mantine/hooks';
import { DataTable } from 'mantine-datatable';
import { usePoiStore, type PoiFeature } from '@/stores/poi_stores';

type PoiRow = PoiFeature['properties'];

// Measured from the rendered table (fz="xs"); tweak if a little blank space remains
const ROW_HEIGHT = 30.5;
const HEADER_HEIGHT = 31;
const FOOTER_HEIGHT = 42;

export default function DataTablePOI() {
  const poi = usePoiStore((s) => s.poi);

  // Height of the area the table can use (follows the splitter)
  const { ref, height } = useElementSize();
  const [debouncedHeight] = useDebouncedValue(height, 100); // avoids re-paging every frame during the transition

  const pageSize = Math.max(
    1,
    Math.floor((debouncedHeight - HEADER_HEIGHT - FOOTER_HEIGHT) / ROW_HEIGHT)
  );

  // Track the first visible row instead of the page number,
  // so resizing the panel keeps you at the same place in the data
  const [offset, setOffset] = useState(0);
  const page = Math.floor(offset / pageSize) + 1;

  const rows: PoiRow[] = useMemo(() => poi.features.map((f) => f.properties), [poi]);

  // Back to the start when new POI data is loaded
  useEffect(() => {
    setOffset(0);
  }, [poi]);

  const records = useMemo(() => {
    const from = (page - 1) * pageSize;
    return rows.slice(from, from + pageSize);
  }, [rows, page, pageSize]);

  return (
    <Box ref={ref} h="100%" w="100%">
      <DataTable<PoiRow>
        height="100%"
        withTableBorder
        withColumnBorders
        striped
        stripedColor="gray.2"
        highlightOnHover
        fz="xs"
        verticalAlign="top"
        idAccessor="id"
        defaultColumnProps={{ noWrap: true }} // keeps every row the same height
        columns={[
          { accessor: 'name', title: 'Name' },
          { accessor: 'category', title: 'Category' },
          { accessor: 'barangay', title: 'Barangay' },
          { accessor: 'city_municipality', title: 'City / Municipality' },
          { accessor: 'province', title: 'Province' },
          { accessor: 'district', title: 'District' },
          { accessor: 'rd_name', title: 'Road' },
          { accessor: 'ft_traffic', title: 'Foot Traffic', textAlign: 'right' },
          { accessor: 'as_of', title: 'As Of' },
        ]}
        records={records}
        totalRecords={rows.length}
        recordsPerPage={pageSize}
        page={page}
        onPageChange={(p) => setOffset((p - 1) * pageSize)}
        noRecordsText="No points of interest loaded"
      />
    </Box>
  );
}