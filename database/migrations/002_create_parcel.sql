-- Parcel boundaries use longitude/latitude (WGS 84), matching core boundaries.
CREATE TABLE data.parcel (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parcel_id text NOT NULL UNIQUE,
    geom public.geometry(MultiPolygon,4326) NOT NULL,
    geom_3857 public.geometry(MultiPolygon,3857)
        GENERATED ALWAYS AS (public.ST_Transform(geom, 3857)) STORED,
    parcel_name text,
    classification text,
    reg_code varchar(11),
    reg_name varchar(100),
    pro_code varchar(11),
    pro_name varchar(100),
    mun_code varchar(11),
    mun_name varchar(100),
    bgy_code varchar(11),
    bgy_name varchar(100),
    address text,
    source text,
    as_of date,
    remarks text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT parcel_id_not_blank CHECK (btrim(parcel_id) <> ''),
    CONSTRAINT parcel_geom_not_empty CHECK (NOT public.ST_IsEmpty(geom)),
    CONSTRAINT parcel_geom_valid CHECK (public.ST_IsValid(geom))
);

COMMENT ON COLUMN data.parcel.parcel_id IS 'Unique parcel reference supplied by the source dataset.';
COMMENT ON COLUMN data.parcel.classification IS 'Land classification, for example Agricultural, Residential, Commercial, or Industrial.';
COMMENT ON COLUMN data.parcel.geom IS 'Valid, nonempty MultiPolygon in EPSG:4326. Transform other coordinate systems before importing.';
COMMENT ON COLUMN data.parcel.geom_3857 IS 'Automatically maintained Web Mercator geometry for indexed viewport and vector tile queries. Insert/update geom only.';

CREATE INDEX parcel_geom_gix ON data.parcel USING gist (geom);
CREATE INDEX parcel_geom_3857_gix ON data.parcel USING gist (geom_3857);
CREATE INDEX parcel_classification_idx ON data.parcel (classification);
CREATE INDEX parcel_reg_code_idx ON data.parcel (reg_code);
CREATE INDEX parcel_pro_code_idx ON data.parcel (pro_code);
CREATE INDEX parcel_mun_code_idx ON data.parcel (mun_code);
CREATE INDEX parcel_bgy_code_idx ON data.parcel (bgy_code);

CREATE TRIGGER parcel_set_updated_at
    BEFORE UPDATE ON data.parcel
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
