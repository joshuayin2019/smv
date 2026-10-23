# Type of Buildings

Open **Demographic Data → Type of Buildings**. This page has its own store, API
routes, table, summary, legend, map boundaries and pie markers.

The eight supplied `building_type_*` columns in `data.psa_2020` are joined to
`core.brgy_bndry` using `bar_code = bgy_code`. Null counts are treated as zero.
Totals and individual categories are summed for municipality, province and region
views, restricted to the current scope. The numeric filter applies to the total.

Legend is the default summary tab. Its colors match the map's pie slices. The small
Hover details switch controls both boundary and pie-chart popups. The separate Charts
tab retains the area-based charts and fetches only while active.

Pies use stable interior points matching the boundary geometry. Overlapping markers
are hidden, with the selection given priority. Viewport requests are debounced and
limited to 300 charts; individual boundary hover can fetch details beyond that limit.
Markers and measurements are reused during map movement. Clicking an area or table
row highlights it and fits its extent; clicking empty map space clears the selection.

The **Other** slice uses `building_type_other_types_of_building`; no extra Unknown
category or count is inferred. The existing population index script covers the shared
geographic search, join and geometry columns; no new database migration is required.

Validation: `npx.cmd tsc --noEmit` and
`node --test tests/building_type_queries.test.cjs tests/year_built_queries.test.cjs`.
Controller tests mock the database; production schema and browser behavior require
a live check.
