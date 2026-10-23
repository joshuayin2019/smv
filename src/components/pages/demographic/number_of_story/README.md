# Number of Story of Building

Open **Demographic Data → Number of Story of Building**.

The page uses the six supplied `floors_*` columns in `data.psa_2020`, joined to
`core.brgy_bndry` on `bar_code = bgy_code`. Counts are summed by barangay,
municipality, province or region within the current scope. Null counts become zero.
The total counts buildings across the six categories; it does not multiply counts
by floor numbers or infer missing categories.

The panel includes search, geographic filters, a total-count numeric filter, sorting,
pagination and column controls. Legend opens by default with two columns of three
categories. Charts fetch only while their tab is active.

Map pies share the legend colors and load for the visible viewport, with at most
300 markers. Overlap hiding, marker reuse, cached measurements and hover debouncing
follow Year Built. Hovering a boundary or pie displays category counts, percentages,
and a translucent boundary highlight. The Hover details switch controls both.
Clicking a row or area selects it and fits its extent; clicking outside clears the
selection. The persistent layer joins the common demographic order to avoid page
switching conflicts.

No new database migration is required. Existing population indexes cover the shared
scope, text search, join and geometry columns.

Validation: `npx.cmd tsc --noEmit` and
`node --test tests/building_story_queries.test.cjs tests/demographic_layer_order.test.cjs`.
Controller tests mock the database. Validate production column types and map appearance
against the live app.
