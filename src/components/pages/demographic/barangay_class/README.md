# Barangay Class

Open **Demographic Data → Barangay Class**. This is a barangay-level classification,
not an aggregated municipality classification.

`data.psa_2020.urban_rural` is joined to `core.brgy_bndry` using `bar_code = bgy_code`.
Exact `U` is Urban (purple), exact `R` is Rural (green), and every other value is
Unknown (gray), including null, empty, lowercase or unrecognized codes. Boundaries
without a matching PSA record are included as Unknown through a left join.
The same SQL classification is used for map tiles, table filters and summary counts.

The table supports geographic column filters, class filtering, debounced text search,
sorting, pagination and column controls. Legend opens by default. Charts count
barangays matching the table filters, using a donut or bar chart. Map fills show all
barangays in scope, independently of the table's filters.

Hover shows the barangay name, municipality and class, and highlights its boundary.
The Legend tab has a hover switch. Clicking a boundary or row selects it and fits
its extent. Selection from the map locates the corresponding table page if it
matches the filters. The persistent tile layer participates in the shared drawing
order used by the other demographic pages.

No new schema or migration is needed. The existing population index script covers
the geographic search, join and geometry columns.

Validation: `npx.cmd tsc --noEmit` and
`node --test tests/barangay_class_queries.test.cjs tests/demographic_layer_order.test.cjs`.
Controller tests mock PostgreSQL. Check the live schema and map appearance in the app.
