# Year Built of Buildings

Open **Demographic Data → Year Built of Buildings**.

The panel follows Population: four geographic levels, debounced searches, geographic
column filters, sorting, pagination, column controls, a collapsible summary, map
highlighting, and automatic fitting of the scope or selected area. Clicking empty
map space clears the selection. The numeric filter applies to the listed-years total.

The eight year categories come from `data.psa_2020`, joined to
`core.brgy_bndry` on `bar_code = bgy_code`, matching Population's geographic codes
and scope rules. Each category is summed for the higher geographic levels.
Null category counts are treated as zero.

The map shows blue boundary outlines and a pie chart at a stable interior point
for each area. Higher levels use an interior point of their combined scoped
municipality geometry, matching the boundary layer rather than a barangay anchor.
Slices use a fixed color for each year category; hover for counts and percentages.
Click a chart or boundary to select and zoom. The map legend lists all supplied years
and **Unknown: not reported**. Unlisted categories have no supplied count and are
not assigned a slice. Areas with zero reported counts have no pie chart.

Hover a chart or boundary for a larger pie and each year's count and percentage.
Boundary hover loads details for that specific code, so small areas whose markers
were hidden by overlap or the 300-chart cap remain inspectable. Hover requests are
debounced, cached for the current mode and scope, and cancelled when the area changes.

Charts load after map movement, only for anchors in view, with a maximum of 300
charts per request. The map displays a notice when this cap is reached. Grouped
category totals always include the whole scoped area, not just the visible part.

The summary uses **Buildings (listed years)**, the sum of exactly the eight
supplied fields. This excludes years absent from that query, including 1981–2000;
it should not be interpreted as an all-years total. Municipality geometry and label
points reuse `data.psa_2020_municipalities`; building counts are calculated from
the barangay records rather than that table's population field.

The existing population index script covers the shared search, scope, join, and
geometry columns; no additional database view or migration is required.

Validation: `npx.cmd tsc --noEmit` and
`node --test tests/year_built_queries.test.cjs`. The controller tests mock database
responses; validate the SQL and column types against the deployed PostgreSQL database
before relying on production results.
