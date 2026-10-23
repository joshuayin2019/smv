-- Population search, scope, join and map indexes.
-- Run statements individually with autocommit enabled (no BEGIN/transaction wrapper).
-- IF NOT EXISTS checks index names, not equivalent indexes under other names:
-- review existing indexes first to avoid duplicates.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_bgy_code_idx ON core.brgy_bndry (bgy_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_reg_code_idx ON core.brgy_bndry (reg_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_pro_code_idx ON core.brgy_bndry (pro_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_mun_code_idx ON core.brgy_bndry (mun_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_bar_code_idx ON data.psa_2020 (bar_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_reg_code_idx ON data.psa_2020_municipalities (reg_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_pro_code_idx ON data.psa_2020_municipalities (pro_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_mun_code_idx ON data.psa_2020_municipalities (mun_code);

-- Contains searches used by the table and summary.
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_bgy_name_trgm_idx ON core.brgy_bndry USING gin (bgy_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_mun_name_trgm_idx ON core.brgy_bndry USING gin (mun_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_pro_name_trgm_idx ON core.brgy_bndry USING gin (pro_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_reg_name_trgm_idx ON core.brgy_bndry USING gin (reg_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_mun_name_trgm_idx ON data.psa_2020_municipalities USING gin (mun_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_pro_name_trgm_idx ON data.psa_2020_municipalities USING gin (pro_name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_reg_name_trgm_idx ON data.psa_2020_municipalities USING gin (reg_name gin_trgm_ops);

-- Code search uses a text expression in the table query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_bgy_code_text_trgm_idx ON core.brgy_bndry USING gin ((bgy_code::text) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_reg_code_text_trgm_idx ON data.psa_2020_municipalities USING gin ((reg_code::text) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_pro_code_text_trgm_idx ON data.psa_2020_municipalities USING gin ((pro_code::text) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_mun_code_text_trgm_idx ON data.psa_2020_municipalities USING gin ((mun_code::text) gin_trgm_ops);

-- Spatial bounding-box filters used by map tiles.
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_brgy_bndry_geom_gist_idx ON core.brgy_bndry USING gist (geom);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pop_psa_2020_municipalities_geom_gist_idx ON data.psa_2020_municipalities USING gist (geom);

ANALYZE core.brgy_bndry;
ANALYZE data.psa_2020;
ANALYZE data.psa_2020_municipalities;

