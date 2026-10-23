import { useEffect, useState } from 'react';
import { useDebouncedValue, useElementSize } from '@mantine/hooks';
import { rowsForTableHeight } from '@/lib/table_paging';

export function useTablePageSize() {
  const { ref, height } = useElementSize<HTMLDivElement>();
  const [settledHeight] = useDebouncedValue(height, 150);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    // Collapsed/hidden panels retain their last size instead of firing tiny requests.
    if (settledHeight > 0) setPageSize(rowsForTableHeight(settledHeight));
  }, [settledHeight]);
  return { tableRef: ref, pageSize };
}
