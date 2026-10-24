# Database migrations

Run from the project root with Node.js and the installed project dependencies.
Connection settings come from the existing `.env` variables `PGSQL_HOST`,
`PGSQL_PORT`, `PGSQL_USER`, and `PGSQL_PASSWORD`. The target database must be
specified explicitly; `PGSQL_DATABASE` is deliberately not used.

```powershell
# Inspect migration files without connecting to PostgreSQL
node database/migrate.cjs --check

# Create a new database and apply its structure
node database/migrate.cjs --database smv_new --create

# Apply pending migrations to an existing target
node database/migrate.cjs --database smv_new
```

The server needs PostgreSQL 16 or newer with PostGIS and pg_trgm available.
The connection user needs permission to create schemas and extensions, and
CREATEDB permission when using `--create`. The initial migration is for an empty
database; it does not adopt an existing populated database.

`migrations/001_initial_schema.sql` recreates the exported core, data, and lookup
schemas, public functions, tables, sequences, constraints, indexes, triggers,
and materialized view. It contains no application records. The materialized
view remains unpopulated, matching the schema-only dump; after importing data,
run `REFRESH MATERIALIZED VIEW data.psa_2020_municipalities` before querying it.
SVG icon files and other external assets are separate from the database.

`002_create_parcel.sql` creates parcels with both `geom` (EPSG:4326) and a
stored generated `geom_3857` MultiPolygon, each with a GiST index. Insert or
update `geom` only; PostgreSQL maintains the projected column automatically.
The additional geometry and index take extra storage.
For an existing database created manually, stop seeding, drop `data.parcel`
only if its records can be discarded, then execute the updated 002 SQL directly.
This recreates the table empty. Do not run the initial migration against
existing tables. Rerun the parcel seeder to generate sample records again.

If the previous 002 was already applied through the migration runner, its stored
checksum will differ. For a deliberate reset, drop the parcel table and delete
only the `002_create_parcel.sql` row from `smv_migrations.history`, then rerun
the runner. This does not apply to manually created tables without history.

Future map queries should filter the indexed projected column, for example:

```sql
SELECT id, parcel_id, classification
FROM data.parcel
WHERE geom_3857 && public.ST_TileEnvelope(14, 13664, 7517);
```

The projected column avoids per-request transformations for tile geometry.
Serving millions of parcels still requires viewport filtering, vector tiles,
and suitable zoom limits; storing another geometry alone is not sufficient.

Each migration and its history record are committed in one transaction. Failed
migrations roll back; already applied files are skipped and checked for edits.
History is stored in `smv_migrations.history`. Concurrent runners share a lock.
To change the schema later, add a numbered SQL file, such as
`002_add_poi_field.sql`. Keep applied files unchanged. SQL must support running
inside a transaction (for example, use CREATE INDEX without CONCURRENTLY).

The original export stays ignored in `_database_backup/`. The initial migration
removes psql-only restrict commands and the PostgreSQL 17+ transaction_timeout
setting so the PostgreSQL 16 source structure can be recreated through `pg`.
