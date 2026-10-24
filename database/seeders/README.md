# Synthetic NCR parcels

Run from the project root with populated core.brgy_bndry, data.smv road lines,
data.parcel, and PostGIS 3+. Connection credentials come from .env.

```powershell
node database/seeders/parcel_id.cjs --database smv_orig --preview
node database/seeders/parcel_id.cjs --database smv_orig
```

Default: 20 rectangles per NCR barangay, five of each classification. Rectangles
are 8-14 metres wide and 8-18 metres long (64-252 square metres), calculated in
EPSG:32651 and stored as MultiPolygon EPSG:4326. They do not fill the barangay.
Candidates must lie inside the boundary, outside road corridors and separate
from other saved parcels.

Road clearance defaults to 12 metres from mapped road centreline to parcel edge,
plus one metre of construction margin. This is an assumed clearance, not a
measured road width. All road classes use the same clearance. Override with:

```powershell
node database/seeders/parcel_id.cjs --database smv_orig --road-clearance 15
```

Only roads present in data.smv can be excluded. Basemap roads may be missing
from that table. The database has no building footprint polygons: these are
building-sized synthetic rectangles, not actual buildings, cadastral parcels,
ownership records, or real zoning.

## Replace previous large samples

Stop the seeder and execute in your target database before generating:

```sql
DELETE FROM data.parcel
WHERE source IN ('synthetic-ncr-parcels-v1', 'synthetic-ncr-parcels-v2')
  AND parcel_id LIKE 'SYN-NCR-%';
```

This deletes old synthetic samples only. The script refuses to generate while
old samples remain. New records use source synthetic-ncr-parcels-v3 and IDs
beginning SYN-NCR-. Existing real records are never overwritten.

Each barangay commits independently after verifying count, size, containment,
validity, parcel overlaps and road clearance. Insufficient space rolls back and
retries up to eight candidate seeds. Candidate pools grow on retries; from the
third attempt, rectangles use the minimum 8 x 8 metre size (64 square metres)
to fit crowded barangays while retaining road clearance and overlap checks.
Persistent failures stop without saving bad
geometry. Earlier completed barangays remain saved. Rerun to resume with the
same count and clearance. Deliberately clear v3 seed records before changing
settings. --count overrides the default. --preview checks boundary metadata and
expected counts but does not test candidate capacity.
