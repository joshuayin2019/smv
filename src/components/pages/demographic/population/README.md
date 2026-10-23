# Population

The table supports expandable rows with `sex_male` and `sex_female` counts from
`data.psa_2020`. Use the arrow beside an area name or click the row to expand it.
Existing population totals, filters, pagination, map selection and extent fitting
are preserved. Higher-level sex counts are summed from scoped barangay records.

Map markers use an SVG ring with blue male and orange female icons. Arc sizes use
the reported male + female counts. No percentage text is drawn on the symbol.
Hover a symbol or boundary for counts and percentages. The Legend tab contains a
hover switch, sex colors, the population color ranges and marker status.
The marker service fetches at most 300 anchors per viewport; overlap hiding, marker
reuse, cached measurements and debounced hover requests follow the building pages.

Null sex counts are treated as zero. A zero reported sex total produces a neutral
gray ring. Male/female percentages use their combined reported count, rather than
assuming that this sum always matches the separate population column.

Validation: `npx.cmd tsc --noEmit` and
`node --test tests/population_sex_queries.test.cjs`. These tests mock PostgreSQL;
the deployed database schema and map appearance require a live check.
