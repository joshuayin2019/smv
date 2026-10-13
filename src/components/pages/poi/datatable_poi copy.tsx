import { useState, useEffect } from 'react';
import { DataTable } from 'mantine-datatable';
import companies from "./companies.json";



const PAGE_SIZE = 15;
export default function DataTablePOI() {
   const [page, setPage] = useState(1);
   const [records, setRecords] = useState(companies.slice(0, PAGE_SIZE));
  

    useEffect(() => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      setRecords(companies.slice(from, to));
    }, [page]);


  return (
    <DataTable
      withTableBorder
      withColumnBorders
      striped
      stripedColor="gray.2"
      highlightOnHover
      fz="xs"
      verticalAlign="top"
      columns={[{ accessor: 'name' }, { accessor: 'streetAddress' }, { accessor: 'city' }, { accessor: 'state' }]}
      records={records}
      recordsPerPage={PAGE_SIZE}
      totalRecords={companies.length}
      page={page}
      onPageChange={(p) => setPage(p)}

    />
  );
}



