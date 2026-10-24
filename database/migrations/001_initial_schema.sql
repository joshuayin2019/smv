--
-- PostgreSQL database dump
--


-- Dumped from database version 16.14
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;


--
-- Name: data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA data;


--
-- Name: lookup; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA lookup;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: generate_user_id(); Type: FUNCTION; Schema: data; Owner: -
--

CREATE FUNCTION data.generate_user_id() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_seq   integer;
BEGIN
  -- atomic: inserts day's first row, or increments it (row-locked, so concurrency-safe)
  INSERT INTO data.user_id_counter (id_date, last_seq)
  VALUES (v_today, 1)
  ON CONFLICT (id_date)
  DO UPDATE SET last_seq = data.user_id_counter.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'USER'
      || to_char(v_today, 'YY')
      || '-'
      || to_char(v_today, 'MMDD')
      || lpad(v_seq::text, 6, '0');
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: brgy_bndry; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.brgy_bndry (
    id bigint NOT NULL,
    geom public.geometry(MultiPolygon,4326),
    reg_code character varying(11),
    reg_name character varying(100),
    pro_code character varying(11),
    pro_name character varying(100),
    mun_code character varying(11),
    mun_name character varying(100),
    bgy_code character varying(11),
    bgy_name character varying(100)
);


--
-- Name: muni_bndry; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.muni_bndry (
    id bigint NOT NULL,
    geom public.geometry(MultiPolygon,4326),
    reg_code character varying(11),
    reg_name character varying(100),
    pro_code character varying(11),
    pro_name character varying(100),
    mun_code character varying(11),
    mun_name character varying(100)
);


--
-- Name: prov_bndry; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.prov_bndry (
    id bigint NOT NULL,
    geom public.geometry(MultiPolygon,4326),
    reg_code character varying(11),
    reg_name character varying(100),
    pro_code character varying(11),
    pro_name character varying(100)
);


--
-- Name: region_bndry; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.region_bndry (
    id bigint NOT NULL,
    geom public.geometry(MultiPolygon,4326),
    reg_code character varying(254),
    reg_name character varying(254),
    geom_z0_6 public.geometry(Geometry,4326),
    geom_z7_12 public.geometry(Geometry,4326)
);


--
-- Name: poi; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE data.poi (
    id integer NOT NULL,
    geom public.geometry(Point,4326),
    fid bigint,
    name text,
    category_id integer,
    ft_traffic bigint,
    rd_name character varying(254),
    filename text,
    as_of text,
    reg_code character varying(254),
    pro_code character varying(254),
    mun_code character varying(254),
    bgy_code character varying(254),
    zone text,
    district_address text,
    population bigint,
    layer text,
    path text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    category text,
    reg_name text,
    pro_name text,
    mun_name text,
    bgy_name text,
    geom_3857 public.geometry(Point,3857) GENERATED ALWAYS AS (public.st_transform(geom, 3857)) STORED
);


--
-- Name: poi_id_seq; Type: SEQUENCE; Schema: data; Owner: -
--

CREATE SEQUENCE data.poi_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: poi_id_seq; Type: SEQUENCE OWNED BY; Schema: data; Owner: -
--

ALTER SEQUENCE data.poi_id_seq OWNED BY data.poi.id;


--
-- Name: psa_2020; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE data.psa_2020 (
    id integer NOT NULL,
    psgc_code integer,
    barangay character varying,
    district character varying,
    city_municipality character varying,
    province character varying,
    region character varying,
    city_class character varying,
    income_classification character varying,
    urban_rural character varying,
    correspondence_code integer,
    bar_code character varying,
    local_code character varying,
    population integer,
    sex_male integer,
    sex_female integer,
    age_under_1 integer,
    age_1 integer,
    age_2 integer,
    age_3 integer,
    age_4 integer,
    age_5 integer,
    age_6 integer,
    age_7 integer,
    age_8 integer,
    age_9 integer,
    age_10 integer,
    age_11 integer,
    age_12 integer,
    age_13 integer,
    age_14 integer,
    age_15 integer,
    age_16 integer,
    age_17 integer,
    age_18 integer,
    age_19 integer,
    age_20 integer,
    age_21 integer,
    age_22 integer,
    age_23 integer,
    age_24 integer,
    age_25 integer,
    age_26 integer,
    age_27 integer,
    age_28 integer,
    age_29 integer,
    age_30 integer,
    age_31 integer,
    age_32 integer,
    age_33 integer,
    age_34 integer,
    age_35 integer,
    age_36 integer,
    age_37 integer,
    age_38 integer,
    age_39 integer,
    age_40 integer,
    age_41 integer,
    age_42 integer,
    age_43 integer,
    age_44 integer,
    age_45 integer,
    age_46 integer,
    age_47 integer,
    age_48 integer,
    age_49 integer,
    age_50 integer,
    age_51 integer,
    age_52 integer,
    age_53 integer,
    age_54 integer,
    age_55 integer,
    age_56 integer,
    age_57 integer,
    age_58 integer,
    age_59 integer,
    age_60 integer,
    age_61 integer,
    age_62 integer,
    age_63 integer,
    age_64 integer,
    age_65 integer,
    age_66 integer,
    age_67 integer,
    age_68 integer,
    age_69 integer,
    age_70 integer,
    age_71 integer,
    age_72 integer,
    age_73 integer,
    age_74 integer,
    age_75 integer,
    age_76 integer,
    age_77 integer,
    age_78 integer,
    age_79 integer,
    age_80_and_over integer,
    age_group_0_4 integer,
    age_group_5_9 integer,
    age_group_10_14 integer,
    age_group_15_19 integer,
    age_group_20_24 integer,
    age_group_25_29 integer,
    age_group_30_34 integer,
    age_group_35_39 integer,
    age_group_40_44 integer,
    age_group_45_49 integer,
    age_group_50_54 integer,
    age_group_55_59 integer,
    age_group_60_64 integer,
    age_group_65_69 integer,
    age_group_70_74 integer,
    age_group_75_79 integer,
    age_group_80_above integer,
    birth_registration_status_registered integer,
    birth_registration_status_not_registered integer,
    birth_registration_status_dont_know integer,
    birth_registration_status_not_reported integer,
    copy_of_birth_certificate_with_copy integer,
    copy_of_birth_certificate_without_copy integer,
    copy_of_birth_certificate_dont_know integer,
    copy_of_birth_certificate_not_reported integer,
    marital_status_single integer,
    marital_status_married integer,
    marital_status_live_in integer,
    marital_status_widowed integer,
    marital_status_divorced_separated_annulled integer,
    marital_status_unknown integer,
    religion_none integer,
    religion_aglipay integer,
    religion_alliance_of_bible_christian_communities_of_the_phi integer,
    religion_ambassadors_for_christ_phil_evangelism_inc integer,
    religion_ang_iglesia_metodista_sa_pilipinas_inc integer,
    religion_apostolic_catholic_church_inc integer,
    religion_asia_evangelistic_fellowship_philippines_inc integer,
    religion_assemblies_of_god integer,
    religion_association_of_baptist_churches_in_luz_vis_and_min integer,
    religion_association_of_fundamental_baptist_churches_in_the_phi integer,
    religion_baptist_conference_of_the_philippines integer,
    religion_bethany_church_of_philippines integer,
    religion_bible_baptist_church integer,
    bible_centered_fellowship integer,
    religion_bread_of_life_ministries integer,
    religion_buddhist integer,
    religion_cathedral_of_praise_incorporated integer,
    religion_catholic_charismatic integer,
    religion_charismatic_full_gospel_ministries integer,
    religion_christ_faith_fellowship_philippines_inc integer,
    religion_christ_the_living_stone_fellowship integer,
    religion_christ_to_the_philippines_inc integer,
    religion_christs_commission_fellowship integer,
    religion_christian_and_missionary_alliance_church_of_the_ph integer,
    religion_christian_brethren_international_pilipinas_inc integer,
    religion_christian_missions_in_the_philippines integer,
    religion_christian_reformed_church_in_the_philippines_inc integer,
    religion_church_body_of_christ_filipinista integer,
    religion_church_of_christ integer,
    religion_church_of_god_world_missions_in_the_philippines integer,
    religion_church_of_jesus_christ_of_the_latter_day_saints integer,
    religion_church_of_the_foursquare_gospel_in_the_phil_inc integer,
    religion_church_of_the_nazarene integer,
    religion_conservative_baptist_association_in_the_phil integer,
    religion_convention_of_the_philippine_baptist_church integer,
    religion_crusaders_of_the_divine_church_of_christ_inc integer,
    religion_don_stewart_ministries_miracle_revivals_inc integer,
    religion_door_of_faith integer,
    religion_episcopal_church_in_the_philippines integer,
    religion_evangelical_christian_outreach_foundation integer,
    religion_evangelical_free_church_of_the_philippines integer,
    religion_evangelical_presbyterian_church integer,
    religion_free_mission_philippines_inc integer,
    religion_faith_baptist_church integer,
    faith_tabernacle_church_living_rock_ministries integer,
    religion_islam integer,
    religion_fifcop_mission_inc integer,
    religion_filipino_assemblies_of_the_first_born_incorporated integer,
    religion_free_believers_in_christ_fellowship integer,
    religion_free_methodist_church integer,
    religion_fundamental_grace_gospel_church_of_christ_in_ph_in integer,
    religion_general_baptist_churches_of_the_philippines integer,
    religion_good_news_christian_churches integer,
    religion_good_news_worldwide_mission_inc integer,
    religion_harvesters_christian_fellowship integer,
    religion_higher_ground_baptist_mission_of_the_phil_inc integer,
    religion_i_am_redeemer_and_master_evangelical_church_inc integer,
    religion_iglesia_evangelica_unida_de_cristo integer,
    religion_iglesia_evangelista_methodista_en_las_islas_fil integer,
    religion_iglesia_filipina_independiente integer,
    religion_iglesia_ni_cristo integer,
    religion_iglesia_sa_dios_espiritu_santo_incorporated integer,
    religion_independent_baptist_churches_of_the_philippines integer,
    religion_international_baptist_missionary_fellowship integer,
    religion_international_one_way_outreach integer,
    religion_jehovahs_witness integer,
    religion_jesus_christ_saves_global_outreach integer,
    religion_jesus_first_christian_ministries_incorporated integer,
    religion_jesus_is_alive_community_inc integer,
    religion_jesus_is_lord_church integer,
    religion_jesus_loves_you_ministries_inc integer,
    religion_jesus_reigns_ministries integer,
    religion_jesus_the_anointed_one_church integer,
    religion_jireh_evangel_church_planting_phils_inc integer,
    religion_kingsway_fellowship_international_philippines_inc integer,
    religion_light_of_the_world_christian_center_inc integer,
    religion_lord_jesus_our_redeemer_church_foundation_int_inc integer,
    religion_lord_of_the_nations_inc integer,
    religion_love_of_christ_international_ministries integer,
    religion_lutheran_church_of_the_philippines integer,
    religion_march_of_faith_church_sole_inc integer,
    religion_miracle_life_fellowship_international integer,
    religion_miracle_revival_church_of_the_philippines integer,
    religion_missionary_baptist_churches_of_the_philippines integer,
    religion_most_holy_church_of_god_in_christ_jesus integer,
    religion_national_council_of_christian_community_church_inc integer,
    religion_oblates_of_mary_immaculate_inc integer,
    religion_pentecostal_church_of_god_asia_mission integer,
    religion_philippine_benevolent_missionaries_association integer,
    religion_philippine_ecumenical_christian_church integer,
    religion_philippine_evangelical_holiness_church integer,
    religion_philippine_evangelical_mission integer,
    religion_philippine_good_news_ministries integer,
    religion_philippine_independent_catholic_church integer,
    religion_philippine_missionary_fellowship integer,
    religion_philippine_pentecostal_holiness_church integer,
    religion_phil_general_council_of_the_assemblies_of_god integer,
    religion_potters_house_christian_center integer,
    religion_presbyterian_church_in_the_philippines integer,
    religion_river_of_god_church_inc integer,
    religion_roman_catholic_excluding_catholic_charismatic integer,
    religion_salvation_army_philippines integer,
    religion_seventh_day_adventist integer,
    religion_southern_baptist_church integer,
    religion_take_the_nation_for_jesus_global_min_corpus_christ integer,
    religion_things_to_come integer,
    religion_tribal_religion integer,
    religion_unida_evangelical_church integer,
    religion_union_espiritista_cristiana_de_filipinas_incorporated integer,
    religion_united_church_of_christ_in_the_philippines integer,
    religion_united_evangelical_church_of_the_phil_chinese integer,
    religion_united_methodists_church integer,
    religion_united_pentecostal_church_philippines_inc integer,
    religion_universal_pentecostal_church integer,
    religion_victory_chapel_christian_fellowship integer,
    religion_victory_christian_fellowship_of_the_phil_inc integer,
    religion_way_of_salvation integer,
    religion_wesleyan_church_the integer,
    religion_word_for_the_world integer,
    religion_word_international_ministries_inc integer,
    religion_world_missionary_evangelism integer,
    religion_worldwide_church_of_god integer,
    religion_zion_christian_community_church integer,
    religion_other_baptist integer,
    religion_other_evangelical_churches integer,
    religion_other_methodist integer,
    religion_other_protestant integer,
    religion_others integer,
    religion_not_reported integer,
    citizenship_filipino integer,
    citizenship_filipino_with_dual_citizenship integer,
    citizenship_foreign integer,
    country_afghanistan integer,
    country_albania integer,
    country_american_samoa integer,
    country_angola integer,
    country_argentina integer,
    country_australia integer,
    country_austria integer,
    country_bahrain integer,
    country_bangladesh integer,
    country_belarus integer,
    country_belgium integer,
    country_brazil integer,
    country_british_indian_ocean_territory integer,
    country_cambodia integer,
    country_cameroon integer,
    country_canada integer,
    country_central_african_republic integer,
    country_chile integer,
    "country_china_people's_republic_of" integer,
    country_christmas_island integer,
    country_colombia integer,
    country_croatia integer,
    country_cyprus integer,
    country_czechia_czech_republic integer,
    country_denmark integer,
    country_ecuador integer,
    country_egypt integer,
    country_england integer,
    country_eritrea integer,
    country_finland integer,
    country_france integer,
    country_french_guiana integer,
    country_gabon integer,
    country_germany integer,
    country_ghana integer,
    country_greece integer,
    "country_guinea-bissau" integer,
    country_haiti integer,
    country_hawaiian_islands boolean,
    country_hong_kong_sar_of_china integer,
    country_hungary integer,
    country_iceland integer,
    country_india integer,
    country_indonesia integer,
    country_iran_islamic_republic_of integer,
    country_iraq integer,
    country_ireland integer,
    country_isle_of_man integer,
    country_israel integer,
    country_italy integer,
    country_jamaica integer,
    country_japan integer,
    country_jordan integer,
    country_kazakhstan integer,
    country_kenya integer,
    country_korea_democratic_peoples_republic_of_north_korea integer,
    country_korea_republic_of_south_korea integer,
    country_kuwait integer,
    country_lao_peoples_democratic_republic integer,
    country_lebanon integer,
    country_liberia integer,
    country_madagascar integer,
    country_malaysia integer,
    country_mexico integer,
    country_myanmar integer,
    country_nepal integer,
    country_netherlands integer,
    country_new_zealand integer,
    country_nigeria integer,
    country_norway integer,
    country_oman integer,
    country_pakistan integer,
    country_palestine_state_of integer,
    country_panama integer,
    country_papua_new_guinea integer,
    country_peru integer,
    country_poland integer,
    country_portugal integer,
    country_qatar integer,
    country_romania integer,
    country_russian_federation integer,
    country_rwanda integer,
    country_saudi_arabia integer,
    country_scotland integer,
    country_senegal integer,
    country_serbia integer,
    country_singapore integer,
    country_slovenia integer,
    country_somalia integer,
    country_south_africa integer,
    country_spain integer,
    country_sri_lanka integer,
    country_sudan integer,
    country_sweden integer,
    country_switzerland integer,
    country_syrian_arab_republic integer,
    country_taiwan_province_of_china integer,
    country_thailand integer,
    country_turkey integer,
    country_uganda integer,
    country_ukraine integer,
    country_united_arab_emirates integer,
    country_united_kingdom_of_great_britain_and_northern_ireland integer,
    country_united_states_minor_outlying_islands integer,
    country_united_states_of_america integer,
    country_uruguay integer,
    country_vanuatu integer,
    country_venezuela_bolivarian_republic_of integer,
    country_viet_nam integer,
    country_virgin_islands_british integer,
    country_wales integer,
    country_yemen integer,
    country_zimbabwe integer,
    country_philippines integer,
    country_other_foreign_country integer,
    country_not_reported integer,
    ethnicity_abelling_aberling integer,
    ethnicity_aeta integer,
    ethnicity_aeta_ayta integer,
    ethnicity_aeta_ayta_abelling_abellen integer,
    ethnicity_aeta_ayta_ambala integer,
    ethnicity_aeta_ayta_magbukun integer,
    ethnicity_aeta_ayta_mag_indi integer,
    ethnicity_aeta_ayta_mang_ansti integer,
    ethnicity_aeta_ayta_sambal integer,
    ethnicity_afghan integer,
    ethnicity_agta integer,
    ethnicity_agta_isigiran integer,
    ethnicity_agta_agay integer,
    ethnicity_agta_cimaron integer,
    ethnicity_agta_dumagat integer,
    ethnicity_agta_dupanigan integer,
    ethnicity_agta_labin integer,
    ethnicity_agta_tabangnon integer,
    ethnicity_agta_taboy integer,
    ethnicity_agutaynen integer,
    ethnicity_alta integer,
    ethnicity_american integer,
    ethnicity_applai integer,
    ethnicity_applai_kachakran_kadaclan integer,
    ethnicity_aromanen_manobo_eromanen_manobo integer,
    ethnicity_aromanen_manobo_eromanen_manobo_dibabeen integer,
    ethnicity_aromanen_manobo_eromanen_manobo_direrayaan integer,
    ethnicity_aromanen_manobo_eromanen_manobo_ilianen integer,
    ethnicity_aromanen_manobo_eromanen_manobo_isoroken integer,
    ethnicity_aromanen_manobo_eromanen_manobo_kirenteken integer,
    ethnicity_aromanen_manobo_eromanen_manobo_kulmanen integer,
    ethnicity_aromanen_manobo_eromanen_manobo_lahitanen integer,
    ethnicity_aromanen_manobo_eromanen_manobo_livunganen integer,
    ethnicity_aromanen_manobo_eromanen_manobo_mulitaan integer,
    ethnicity_aromanen_manobo_eromanen_manobo_pulengien integer,
    ethnicity_ata integer,
    ethnicity_ata_negrito integer,
    ethnicity_ati integer,
    ethnicity_australian integer,
    ethnicity_ayangan integer,
    ethnicity_ayangan_henanga integer,
    ethnicity_ayta integer,
    ethnicity_blaan_blaan integer,
    ethnicity_badjao integer,
    ethnicity_bago integer,
    ethnicity_bagobo integer,
    ethnicity_bagobo_klata integer,
    ethnicity_bagobo_tagabawa integer,
    ethnicity_bajau integer,
    ethnicity_balangao integer,
    ethnicity_balangao_lias integer,
    ethnicity_baliwon integer,
    ethnicity_baliwon_fiallig_fialika integer,
    ethnicity_baliwon_gaddang integer,
    ethnicity_baliwon_i_sadanga integer,
    ethnicity_baliwon_miligan integer,
    ethnicity_bantoanon integer,
    ethnicity_banwaon integer,
    ethnicity_batak integer,
    ethnicity_batangan integer,
    ethnicity_bikol_bicol integer,
    ethnicity_bisaya_binisaya integer,
    ethnicity_boholano integer,
    ethnicity_bontok integer,
    ethnicity_bontok_majukayong integer,
    ethnicity_british integer,
    ethnicity_bugkalot_ilongot integer,
    ethnicity_bukidnon integer,
    ethnicity_bukidnon_akeanon integer,
    ethnicity_bukidnon_halowodnon integer,
    ethnicity_bukidnon_iraynon integer,
    ethnicity_bukidnon_ituman integer,
    ethnicity_bukidnon_magahat integer,
    ethnicity_bukidnon_pan_anayon integer,
    ethnicity_bukidnon_tagoloanon integer,
    ethnicity_cagayanen integer,
    ethnicity_calinga integer,
    ethnicity_canadian integer,
    ethnicity_capizeno integer,
    ethnicity_caviteno integer,
    ethnicity_caviteno_chavacano integer,
    ethnicity_cebuano integer,
    ethnicity_chinese integer,
    ethnicity_cotabateno integer,
    ethnicity_cotabateno_chavacano integer,
    ethnicity_cuyonen_cuyunon integer,
    ethnicity_davao_chavacano integer,
    ethnicity_davaweno integer,
    ethnicity_diangan integer,
    ethnicity_dibabawon integer,
    ethnicity_dumagat integer,
    ethnicity_dumagat_edimala integer,
    ethnicity_dumagat_kabolowen integer,
    ethnicity_dumagat_remontado integer,
    ethnicity_dumagat_tagebolus integer,
    ethnicity_eskaya integer,
    ethnicity_french integer,
    ethnicity_gaddang integer,
    ethnicity_german integer,
    ethnicity_guiangan integer,
    ethnicity_higaonon_higa_onon integer,
    ethnicity_higaonon_tagoloanon integer,
    ethnicity_ibaloy integer,
    ethnicity_ibanag integer,
    ethnicity_ibatan integer,
    ethnicity_ibukid integer,
    ethnicity_ifugao integer,
    ethnicity_illaud integer,
    ethnicity_ilocano integer,
    ethnicity_ilonggo integer,
    ethnicity_imalawa integer,
    ethnicity_indian integer,
    ethnicity_indonesian integer,
    ethnicity_iranun_iraynun integer,
    ethnicity_isinai integer,
    ethnicity_isnag integer,
    ethnicity_isneg integer,
    ethnicity_isneg_isnag integer,
    ethnicity_italian integer,
    ethnicity_itawes integer,
    ethnicity_itneg integer,
    ethnicity_itneg_tinguian integer,
    ethnicity_itneg_tinguian_adasen integer,
    ethnicity_itneg_tinguian_balatok integer,
    ethnicity_itneg_tinguian_banao integer,
    ethnicity_itneg_tinguian_belwang integer,
    ethnicity_itneg_tinguian_binongan integer,
    ethnicity_itneg_tinguian_gubang integer,
    ethnicity_itneg_tinguian_inlaud integer,
    ethnicity_itneg_tinguian_mabaka integer,
    ethnicity_itneg_tinguian_maeng integer,
    ethnicity_itneg_tinguian_masadiit integer,
    ethnicity_itneg_tinguian_muyadan integer,
    ethnicity_ivatan integer,
    ethnicity_iwak integer,
    ethnicity_jama_mapun integer,
    ethnicity_japanese integer,
    ethnicity_kabayukan integer,
    ethnicity_kabihug integer,
    ethnicity_kabihug_manide integer,
    ethnicity_kagan_kalagan integer,
    ethnicity_kailawan_kaylawan integer,
    ethnicity_kalanguya integer,
    ethnicity_kalanguya_ikalahan integer,
    ethnicity_kalanguya_yattuka integer,
    ethnicity_kalinga integer,
    ethnicity_kalinga_ab_abaan integer,
    ethnicity_kalinga_ableg_dalupa integer,
    ethnicity_kalinga_aciga integer,
    ethnicity_kalinga_ammacian integer,
    ethnicity_kalinga_balatoc integer,
    ethnicity_kalinga_balinciagao integer,
    ethnicity_kalinga_ballayangan integer,
    ethnicity_kalinga_banao integer,
    ethnicity_kalinga_bangad integer,
    ethnicity_kalinga_basao integer,
    ethnicity_kalinga_biga integer,
    ethnicity_kalinga_buaya integer,
    ethnicity_kalinga_butbut integer,
    ethnicity_kalinga_cagaluan integer,
    ethnicity_kalinga_culminga integer,
    ethnicity_kalinga_dacalan integer,
    ethnicity_kalinga_dallac integer,
    ethnicity_kalinga_dananao integer,
    ethnicity_kalinga_dangtalan integer,
    ethnicity_kalinga_dao_angan integer,
    ethnicity_kalinga_dugpa integer,
    ethnicity_kalinga_gaang integer,
    ethnicity_kalinga_gaddang integer,
    ethnicity_kalinga_gubang integer,
    ethnicity_kalinga_guilayon integer,
    ethnicity_kalinga_guina_ang integer,
    ethnicity_kalinga_limos integer,
    ethnicity_kalinga_lubo integer,
    ethnicity_kalinga_lubuagan integer,
    ethnicity_kalinga_mabaca integer,
    ethnicity_kalinga_mabongtot integer,
    ethnicity_kalinga_magaogao integer,
    ethnicity_kalinga_malbong integer,
    ethnicity_kalinga_mangali integer,
    ethnicity_kalinga_minanga integer,
    ethnicity_kalinga_nanong integer,
    ethnicity_kalinga_pangol integer,
    ethnicity_kalinga_pinukpuk integer,
    ethnicity_kalinga_poswoy integer,
    ethnicity_kalinga_salegseg integer,
    ethnicity_kalinga_sumadel integer,
    ethnicity_kalinga_taloctoc integer,
    ethnicity_kalinga_tanglag integer,
    ethnicity_kalinga_tobog integer,
    ethnicity_kalinga_tongrayan integer,
    ethnicity_kalinga_tulgao integer,
    ethnicity_kalinga_uma integer,
    ethnicity_kamiguin integer,
    ethnicity_kankanaey integer,
    "ethnicity_kankanaey_hak'ki" integer,
    ethnicity_kapampangan integer,
    ethnicity_karao integer,
    ethnicity_karay_a integer,
    ethnicity_karulano integer,
    ethnicity_kaunana integer,
    ethnicity_kolibugan integer,
    ethnicity_korean_north integer,
    ethnicity_korean_south integer,
    ethnicity_lambanguian integer,
    ethnicity_langilan integer,
    ethnicity_magahats integer,
    ethnicity_magkunana integer,
    ethnicity_maguindanao integer,
    ethnicity_malaueg integer,
    ethnicity_mamanwa integer,
    ethnicity_mandaya integer,
    ethnicity_mangguangan integer,
    ethnicity_mangyan integer,
    ethnicity_mangyan_alangan integer,
    ethnicity_mangyan_bangon integer,
    ethnicity_mangyan_buhid integer,
    ethnicity_mangyan_buhid_bangon integer,
    ethnicity_mangyan_gubatnon integer,
    ethnicity_mangyan_hanunuo integer,
    ethnicity_mangyan_iraya integer,
    ethnicity_mangyan_ratagnon integer,
    ethnicity_mangyan_tadyawan integer,
    ethnicity_mangyan_tau_buid integer,
    ethnicity_manobo integer,
    ethnicity_manobo_aromanon integer,
    ethnicity_manobo_ata integer,
    ethnicity_manobo_blit integer,
    ethnicity_manobo_blit_tasaday integer,
    ethnicity_manobo_dulangan integer,
    ethnicity_manobo_dulungan_lambangian integer,
    ethnicity_manobo_dunggoanon integer,
    ethnicity_manobo_kirenteken integer,
    ethnicity_manobo_pulanguinon integer,
    ethnicity_mansaka integer,
    ethnicity_maranao integer,
    ethnicity_masbateno_masbatenon integer,
    ethnicity_matigsalog integer,
    ethnicity_molbog integer,
    ethnicity_obu_manuvu integer,
    ethnicity_palawani integer,
    ethnicity_palawan_o integer,
    ethnicity_palawan_o_ken_ey integer,
    "ethnicity_palawan_o_tao't_bato" integer,
    ethnicity_panay_bukidnon integer,
    ethnicity_pan_ayanon integer,
    ethnicity_pangasinan integer,
    ethnicity_parananum integer,
    ethnicity_romblomanon integer,
    ethnicity_sama_samal integer,
    ethnicity_sama_badjao integer,
    ethnicity_sama_bangingi integer,
    ethnicity_sama_delaut__sama_laut integer,
    ethnicity_sangir_sangil integer,
    ethnicity_sibuyan_mangyan_tagabukid integer,
    ethnicity_singaporean integer,
    ethnicity_south_african integer,
    ethnicity_spanish integer,
    ethnicity_subanen_subanon integer,
    ethnicity_surigaonon integer,
    ethnicity_swiss integer,
    "ethnicity_t'boli_tboli" integer,
    "ethnicity_t'duray_teduray" integer,
    ethnicity_tagabawa integer,
    ethnicity_tagakaulo integer,
    ethnicity_tagalog integer,
    ethnicity_tagbanua integer,
    ethnicity_tagbanua_tandulanen integer,
    ethnicity_tagbanua_calamian integer,
    ethnicity_tagbanua_kalamianen integer,
    ethnicity_taiwanese integer,
    ethnicity_talaandig integer,
    ethnicity_talaingod integer,
    ethnicity_tausog_tausug integer,
    ethnicity_tigwahanon integer,
    ethnicity_tinananen integer,
    ethnicity_tingguian integer,
    ethnicity_turkish integer,
    ethnicity_tuwali integer,
    ethnicity_tuwali_kele_i integer,
    ethnicity_ubo_manuvu_manobo_ubo_ubo_manobo_ubo_manuvu_ubo_menuv integer,
    ethnicity_umayamnon integer,
    ethnicity_waray integer,
    ethnicity_yakan integer,
    ethnicity_yapayao integer,
    ethnicity_yogad integer,
    "ethnicity_zamboangueño" integer,
    ethnicity_other_local integer,
    ethnicity_other_foreign integer,
    ethnicity_not_reported integer,
    seeing_without_functional_difficulty integer,
    seeing_with_mild_functional_difficulty integer,
    seeing_with_moderate_functional_difficulty integer,
    seeing_with_severe_functional_difficulty integer,
    seeing_not_reported integer,
    hearing_without_functional_difficulty integer,
    hearing_with_mild_functional_difficulty integer,
    hearing_with_moderate_functional_difficulty integer,
    hearing_with_severe_functional_difficulty integer,
    hearing_not_reported integer,
    walking_without_functional_difficulty integer,
    walking_with_mild_functional_difficulty integer,
    walking_with_moderate_functional_difficulty integer,
    walking_with_severe_functional_difficulty integer,
    walking_not_reported integer,
    remembering_without_functional_difficulty integer,
    remembering_with_mild_functional_difficulty integer,
    remembering_with_moderate_functional_difficulty integer,
    remembering_with_severe_functional_difficulty integer,
    remembering_not_reported integer,
    selfcaring_without_functional_difficulty integer,
    selfcaring_with_mild_functional_difficulty integer,
    selfcaring_with_moderate_functional_difficulty integer,
    selfcaring_with_severe_functional_difficulty integer,
    selfcaring_not_reported integer,
    communicating_without_functional_difficulty integer,
    communicating_with_mild_functional_difficulty integer,
    communicating_with_moderate_functional_difficulty integer,
    communicating_with_severe_functional_difficulty integer,
    communicating_not_reported integer,
    mother_residence_national_capital_region integer,
    mother_residence_city_of_manila integer,
    mother_residence_city_of_mandaluyong integer,
    mother_residence_city_of_marikina integer,
    mother_residence_city_of_pasig integer,
    mother_residence_quezon_city integer,
    mother_residence_city_of_san_juan integer,
    mother_residence_city_of_caloocan integer,
    mother_residence_city_of_malabon integer,
    mother_residence_city_of_navotas integer,
    mother_residence_city_of_malabon_1 integer,
    "mother_residence_city_of_las_piñas" integer,
    mother_residence_city_of_makati integer,
    mother_residence_city_of_muntinlupa integer,
    "mother_residence_city_of_parañaque" integer,
    mother_residence_pasay_city integer,
    mother_residence_city_of_taguig integer,
    mother_residence_pateros integer,
    mother_residence_ncr_unknown_city_municipality integer,
    mother_residence_cordillera_administrative_region integer,
    mother_residence_abra integer,
    mother_residence_benguet integer,
    mother_residence_city_of_baguio integer,
    mother_residence_ifugao integer,
    mother_residence_kalinga integer,
    mother_residence_mountain_province integer,
    mother_residence_apayao integer,
    mother_residence_region_i integer,
    mother_residence_ilocos_norte integer,
    mother_residence_ilocos_sur integer,
    mother_residence_la_union integer,
    mother_residence_pangasinan integer,
    mother_residence_region_ii integer,
    mother_residence_batanes integer,
    mother_residence_cagayan integer,
    mother_residence_isabela integer,
    mother_residence_nueva_vizcaya integer,
    mother_residence_quirino integer,
    mother_residence_region_iii integer,
    mother_residence_bataan integer,
    mother_residence_bulacan integer,
    mother_residence_nueva_ecija integer,
    mother_residence_pampanga integer,
    mother_residence_city_of_angeles integer,
    mother_residence_tarlac integer,
    mother_residence_zambales integer,
    mother_residence_city_of_olongapo integer,
    mother_residence_aurora integer,
    mother_residence_region_iv_a integer,
    mother_residence_batangas integer,
    mother_residence_cavite integer,
    mother_residence_laguna integer,
    mother_residence_quezon integer,
    mother_residence_city_of_lucena integer,
    mother_residence_rizal integer,
    mother_residence_mimaropa_region integer,
    mother_residence_marinduque integer,
    mother_residence_occidental_mindoro integer,
    mother_residence_oriental_mindoro integer,
    mother_residence_palawan integer,
    mother_residence_city_of_puerto_princesa integer,
    mother_residence_romblon integer,
    mother_residence_region_v integer,
    mother_residence_albay integer,
    mother_residence_camarines_norte integer,
    mother_residence_camarines_sur integer,
    mother_residence_catanduanes integer,
    mother_residence_masbate integer,
    mother_residence_sorsogon integer,
    mother_residence_region_vi integer,
    mother_residence_aklan integer,
    mother_residence_antique integer,
    mother_residence_capiz integer,
    mother_residence_iloilo integer,
    mother_residence_city_of_iloilo integer,
    mother_residence_negros_occidental integer,
    mother_residence_guimaras integer,
    mother_residence_region_vii integer,
    mother_residence_bohol integer,
    mother_residence_cebu integer,
    mother_residence_city_of_cebu integer,
    mother_residence_city_of_lapu_lapu integer,
    mother_residence_city_of_mandaue integer,
    mother_residence_negros_oriental integer,
    mother_residence_siquijor integer,
    mother_residence_region_viii integer,
    mother_residence_eastern_samar integer,
    mother_residence_leyte integer,
    mother_residence_city_of_tacloban integer,
    mother_residence_northern_samar integer,
    mother_residence_western_samar integer,
    mother_residence_southern_leyte integer,
    mother_residence_biliran integer,
    mother_residence_region_ix integer,
    mother_residence_zamboanga_del_norte integer,
    mother_residence_zamboanga_del_sur integer,
    mother_residence_city_of_zamboanga integer,
    mother_residence_zamboanga_sibugay integer,
    mother_residence_city_of_isabela integer,
    mother_residence_region_x integer,
    mother_residence_bukidnon integer,
    mother_residence_camiguin integer,
    mother_residence_lanao_del_norte integer,
    mother_residence_city_of_iligan integer,
    mother_residence_misamis_occidental integer,
    mother_residence_misamis_oriental integer,
    mother_residence_city_of_cagayan_de_oro integer,
    mother_residence_region_xi integer,
    mother_residence_davao_del_norte integer,
    mother_residence_davao_del_sur integer,
    mother_residence_city_of_davao integer,
    mother_residence_davao_oriental integer,
    mother_residence_compostela_valley integer,
    mother_residence_davao_occidental integer,
    mother_residence_region_xii integer,
    mother_residence_cotabato integer,
    mother_residence_south_cotabato integer,
    mother_residence_city_of_general_santos integer,
    mother_residence_sultan_kudarat integer,
    mother_residence_sarangani integer,
    mother_residence_region_xiii integer,
    mother_residence_agusan_del_norte integer,
    mother_residence_city_of_butuan integer,
    mother_residence_agusan_del_sur integer,
    mother_residence_surigao_del_norte integer,
    mother_residence_surigao_del_sur integer,
    mother_residence_dinagat_islands integer,
    mother_residence_bangsamoro_autonomous_region_in_muslim_min integer,
    mother_residence_basilan integer,
    mother_residence_lanao_del_sur integer,
    mother_residence_maguindanao integer,
    mother_residence_sulu integer,
    mother_residence_tawi_tawi integer,
    mother_residence_foreign_country integer,
    mother_residence_not_reported integer,
    mother_residence_same_province_and_same_city_municipality integer,
    mother_residence_same_province_but_different_city_municipality integer,
    mother_residence_different_province integer,
    mother_residence_foreign_country_1 integer,
    mother_residence_not_reported_1 integer,
    residence_5yr_ago_national_capital_region integer,
    residence_5yr_ago_city_of_manila integer,
    residence_5yr_ago_city_of_mandaluyong integer,
    residence_5yr_ago_city_of_marikina integer,
    residence_5yr_ago_city_of_pasig integer,
    residence_5yr_ago_quezon_city integer,
    residence_5yr_ago_city_of_san_juan integer,
    residence_5yr_ago_city_of_caloocan integer,
    residence_5yr_ago_city_of_malabon integer,
    residence_5yr_ago_city_of_navotas integer,
    residence_5yr_ago_city_of_malabon_1 integer,
    "residence_5yr_ago_city_of_las_piñas" integer,
    residence_5yr_ago_city_of_makati integer,
    residence_5yr_ago_city_of_muntinlupa integer,
    "residence_5yr_ago_city_of_parañaque" integer,
    residence_5yr_ago_pasay_city integer,
    residence_5yr_ago_city_of_taguig integer,
    residence_5yr_ago_pateros integer,
    residence_5yr_ago_ncr_unknown_city_municipality integer,
    residence_5yr_ago_cordillera_administrative_region integer,
    residence_5yr_ago_abra integer,
    residence_5yr_ago_benguet integer,
    residence_5yr_ago_city_of_baguio integer,
    residence_5yr_ago_ifugao integer,
    residence_5yr_ago_kalinga integer,
    residence_5yr_ago_mountain_province integer,
    residence_5yr_ago_apayao integer,
    residence_5yr_ago_region_i integer,
    residence_5yr_ago_ilocos_norte integer,
    residence_5yr_ago_ilocos_sur integer,
    residence_5yr_ago_la_union integer,
    residence_5yr_ago_pangasinan integer,
    residence_5yr_ago_region_ii integer,
    residence_5yr_ago_batanes integer,
    residence_5yr_ago_cagayan integer,
    residence_5yr_ago_isabela integer,
    residence_5yr_ago_nueva_vizcaya integer,
    residence_5yr_ago_quirino integer,
    residence_5yr_ago_region_iii integer,
    residence_5yr_ago_bataan integer,
    residence_5yr_ago_bulacan integer,
    residence_5yr_ago_nueva_ecija integer,
    residence_5yr_ago_pampanga integer,
    residence_5yr_ago_city_of_angeles integer,
    residence_5yr_ago_tarlac integer,
    residence_5yr_ago_zambales integer,
    residence_5yr_ago_city_of_olongapo integer,
    residence_5yr_ago_aurora integer,
    residence_5yr_ago_region_iv_a integer,
    residence_5yr_ago_batangas integer,
    residence_5yr_ago_cavite integer,
    residence_5yr_ago_laguna integer,
    residence_5yr_ago_quezon integer,
    residence_5yr_ago_city_of_lucena integer,
    residence_5yr_ago_rizal integer,
    residence_5yr_ago_mimaropa_region integer,
    residence_5yr_ago_marinduque integer,
    residence_5yr_ago_occidental_mindoro integer,
    residence_5yr_ago_oriental_mindoro integer,
    residence_5yr_ago_palawan integer,
    residence_5yr_ago_city_of_puerto_princesa integer,
    residence_5yr_ago_romblon integer,
    residence_5yr_ago_region_v integer,
    residence_5yr_ago_albay integer,
    residence_5yr_ago_camarines_norte integer,
    residence_5yr_ago_camarines_sur integer,
    residence_5yr_ago_catanduanes integer,
    residence_5yr_ago_masbate integer,
    residence_5yr_ago_sorsogon integer,
    residence_5yr_ago_region_vi integer,
    residence_5yr_ago_aklan integer,
    residence_5yr_ago_antique integer,
    residence_5yr_ago_capiz integer,
    residence_5yr_ago_iloilo integer,
    residence_5yr_ago_city_of_iloilo integer,
    residence_5yr_ago_negros_occidental integer,
    residence_5yr_ago_guimaras integer,
    residence_5yr_ago_region_vii integer,
    residence_5yr_ago_bohol integer,
    residence_5yr_ago_cebu integer,
    residence_5yr_ago_city_of_cebu integer,
    residence_5yr_ago_city_of_lapu_lapu integer,
    residence_5yr_ago_city_of_mandaue integer,
    residence_5yr_ago_negros_oriental integer,
    residence_5yr_ago_siquijor integer,
    residence_5yr_ago_region_viii integer,
    residence_5yr_ago_eastern_samar integer,
    residence_5yr_ago_leyte integer,
    residence_5yr_ago_city_of_tacloban integer,
    residence_5yr_ago_northern_samar integer,
    residence_5yr_ago_western_samar integer,
    residence_5yr_ago_southern_leyte integer,
    residence_5yr_ago_biliran integer,
    residence_5yr_ago_region_ix integer,
    residence_5yr_ago_zamboanga_del_norte integer,
    residence_5yr_ago_zamboanga_del_sur integer,
    residence_5yr_ago_city_of_zamboanga integer,
    residence_5yr_ago_zamboanga_sibugay integer,
    residence_5yr_ago_city_of_isabela integer,
    residence_5yr_ago_region_x integer,
    residence_5yr_ago_bukidnon integer,
    residence_5yr_ago_camiguin integer,
    residence_5yr_ago_lanao_del_norte integer,
    residence_5yr_ago_city_of_iligan integer,
    residence_5yr_ago_misamis_occidental integer,
    residence_5yr_ago_misamis_oriental integer,
    residence_5yr_ago_city_of_cagayan_de_oro integer,
    residence_5yr_ago_region_xi integer,
    residence_5yr_ago_davao_del_norte integer,
    residence_5yr_ago_davao_del_sur integer,
    residence_5yr_ago_city_of_davao integer,
    residence_5yr_ago_davao_oriental integer,
    residence_5yr_ago_compostela_valley integer,
    residence_5yr_ago_davao_occidental integer,
    residence_5yr_ago_region_xii integer,
    residence_5yr_ago_cotabato integer,
    residence_5yr_ago_south_cotabato integer,
    residence_5yr_ago_city_of_general_santos integer,
    residence_5yr_ago_sultan_kudarat integer,
    residence_5yr_ago_sarangani integer,
    residence_5yr_ago_region_xiii integer,
    residence_5yr_ago_agusan_del_norte integer,
    residence_5yr_ago_city_of_butuan integer,
    residence_5yr_ago_agusan_del_sur integer,
    residence_5yr_ago_surigao_del_norte integer,
    residence_5yr_ago_surigao_del_sur integer,
    residence_5yr_ago_dinagat_islands integer,
    residence_5yr_ago_bangsamoro_autonomous_region_in_muslim_min integer,
    residence_5yr_ago_basilan integer,
    residence_5yr_ago_lanao_del_sur integer,
    residence_5yr_ago_maguindanao integer,
    residence_5yr_ago_sulu integer,
    residence_5yr_ago_tawi_tawi integer,
    residence_5yr_ago_foreign_country integer,
    residence_5yr_ago_not_reported integer,
    literacy_literate integer,
    literacy_illiterate integer,
    highest_grade_no_grade_completed integer,
    highest_grade_preschool integer,
    highest_grade_kindergarten integer,
    highest_grade_grade_1_k_to_12 integer,
    highest_grade_grade_2_k_to_12 integer,
    highest_grade_grade_3_k_to_12 integer,
    highest_grade_grade_4_k_to_12 integer,
    highest_grade_grade_5_k_to_12 integer,
    highest_grade_grade_6_k_to_12 integer,
    highest_grade_grade_7_k_to_12 integer,
    highest_grade_grade_8_k_to_12 integer,
    highest_grade_grade_9_k_to_12 integer,
    highest_grade_grade_10_k_to_12 integer,
    highest_grade_grade_11_k_to_12 integer,
    highest_grade_grade_12_k_to_12 integer,
    highest_grade_grade_1_old_curriculum integer,
    highest_grade_grade_2_old_curriculum integer,
    highest_grade_grade_3_old_curriculum integer,
    highest_grade_grade_4_old_curriculum integer,
    highest_grade_grade_5_old_curriculum integer,
    highest_grade_grade_6_old_curriculum integer,
    highest_grade_grade_6_graduate_old_curriculum integer,
    highest_grade_grade_7_graduate_old_curriculum integer,
    highest_grade_1st_year_high_school_old_curriculum integer,
    highest_grade_2nd_year_high_school_old_curriculum integer,
    highest_grade_3rd_year_high_school_old_curriculum integer,
    highest_grade_4th_year_high_school_old_curriculum integer,
    highest_grade_high_school_graduate_old_curriculum integer,
    highest_grade_inclusive_special_needs_education_prog_elem integer,
    highest_grade_inclusive_special_needs_education_program_hs integer,
    highest_grade_continuing_second_chance_education_prog_elem integer,
    highest_grade_continuing_second_chance_education_program_hs integer,
    highest_grade_post_secondary_undergraduate integer,
    highest_grade_post_secondary_non_tertiary_graduate integer,
    highest_grade_generic_programmes_and_qualifications integer,
    highest_grade_education integer,
    highest_grade_arts_and_humanities integer,
    highest_grade_social_sciences_journalism_and_information integer,
    highest_grade_business_administration_and_law integer,
    highest_grade_natural_sciences_mathematics_and_statistics integer,
    highest_grade_information_and_communication_technologies integer,
    highest_grade_engineering_manufacturing_and_construction integer,
    highest_grade_agriculture_forestry_fisheries_and_veterinary integer,
    highest_grade_health_and_welfare integer,
    highest_grade_services integer,
    highest_grade_field_unknown integer,
    highest_grade_short_cycle_terytiary_undergraduate integer,
    highest_grade_short_cycle_tertiary_graduate integer,
    highest_grade_generic_programmes_and_qualifications_1 integer,
    highest_grade_education_1 integer,
    highest_grade_arts_and_humanities_1 integer,
    highest_grade_social_sciences_journalism_and_information_1 integer,
    highest_grade_business_administration_and_law_1 integer,
    highest_grade_natural_sciences_mathematics_and_statistics_1 integer,
    highest_grade_information_and_communication_technologies2 integer,
    highest_grade_engineering_manufacturing_and_construction_1 integer,
    highest_grade_agriculture_forestry_fisheries_and_veterinary_1 integer,
    highest_grade_health_and_welfare_1 integer,
    highest_grade_services_1 integer,
    highest_grade_field_unknown_1 integer,
    highest_grade_1st_year_college integer,
    highest_grade_2nd_year_college integer,
    highest_grade_3rd_year_college integer,
    highest_grade_4th_year_college integer,
    highest_grade_5th_year_college integer,
    highest_grade_6th_year_college integer,
    highest_grade_bachelors_degree_graduate integer,
    highest_grade_generic_programmes_and_qualifications_2 integer,
    highest_grade_education_2 integer,
    highest_grade_arts_and_humanities_2 integer,
    highest_grade_social_sciences_journalism_and_information_2 integer,
    highest_grade_business_administration_and_law_2 integer,
    highest_grade_natural_sciences_mathematics_and_statistics_2 integer,
    highest_grade_information_and_communication_technologies3 integer,
    highest_grade_engineering_manufacturing_and_construction_2 integer,
    highest_grade_agriculture_forestry_fisheries_and_veterinary_2 integer,
    highest_grade_health_and_welfare_2 integer,
    highest_grade_services_2 integer,
    highest_grade_field_unknown_2 integer,
    highest_grade_masters_degree_undergraduate integer,
    highest_grade_masters_degree_graduate integer,
    highest_grade_generic_programmes_and_qualifications_3 integer,
    highest_grade_education_3 integer,
    highest_grade_arts_and_humanities_3 integer,
    highest_grade_social_sciences_journalism_and_information_3 integer,
    highest_grade_business_administration_and_law_3 integer,
    highest_grade_natural_sciences_mathematics_and_statistics_3 integer,
    highest_grade_information_and_communication_technologies4 integer,
    highest_grade_engineering_manufacturing_and_construction_3 integer,
    highest_grade_agriculture_forestry_fisheries_and_veterinary_3 integer,
    highest_grade_health_and_welfare_3 integer,
    highest_grade_services_3 integer,
    highest_grade_field_unknown_3 integer,
    highest_grade_doctorate_degree_undergradutae integer,
    highest_grade_doctorate_degree_graduate integer,
    highest_grade_generic_programmes_and_qualifications_4 integer,
    highest_grade_education_4 integer,
    highest_grade_arts_and_humanities_4 integer,
    highest_grade_social_sciences_journalism_and_information_4 integer,
    highest_grade_business_administration_and_law_4 integer,
    highest_grade_natural_sciences_mathematics_and_statistics_4 integer,
    highest_grade_information_and_communication_technologies5_icts integer,
    highest_grade_engineering_manufacturing_and_construction_4 integer,
    highest_grade_agriculture_forestry_fisheries_and_veterinary_4 integer,
    highest_grade_health_and_welfare_4 integer,
    highest_grade_services_4 integer,
    highest_grade_field_unknown_4 integer,
    highest_grade_not_reported integer,
    overseas_worker integer,
    not_overseas_worker integer,
    overseas_worker_not_reported integer,
    building_type_single_house integer,
    building_type_duplex integer,
    building_type_apartment_accessoria_rowhouse integer,
    building_type_condominium_condotel integer,
    building_type_other_multi_unit_residential integer,
    building_type_commercial_industrial_agricultural integer,
    building_type_institutional_living_quarter integer,
    building_type_other_types_of_building integer,
    building_type_none integer,
    floors_one_floor integer,
    floors_two_floors integer,
    floors_three_floors integer,
    floors_four_floors integer,
    floors_five_to_10_floors integer,
    floors_11_floors_or_more integer,
    floors_not_reported integer,
    roof_materials_galvanized_iron_aluminum integer,
    roof_materials_concrete_clay_tile integer,
    roof_materials_half_galvanized_iron_and_half_concrete integer,
    roof_materials_wood_bamboo integer,
    roof_materials_cogon_nipa_anahaw integer,
    roof_materials_asbestos integer,
    roof_materials_makeshift_salvaged_improvised_materials integer,
    roof_materials_others integer,
    roof_materials_not_reported integer,
    outer_wall_materials_concrete_brick_stone integer,
    outer_wall_materials_wood integer,
    outer_wall_materials_half_concrete_brick_stone_and_half_wood integer,
    outer_wall_materials_galvanized_iron_aluminum integer,
    outer_wall_materials_bamboo_sawali_cogon_nipa integer,
    outer_wall_materials_asbestos integer,
    outer_wall_materials_glass integer,
    outer_wall_materials_makeshift_salvaged_improvised_materials integer,
    outer_wall_materials_others integer,
    outer_wall_materials_none integer,
    outer_wall_materials_not_reported integer,
    floor_finishing_materials_ceramic_tile_marble_granite integer,
    floor_finishing_materials_cement_brick_stone integer,
    floor_finishing_materials_wood_plank integer,
    floor_finishing_materials_wood_tile_parquet integer,
    floor_finishing_materials_vinyl_carpet_tile integer,
    floor_finishing_materials_linoleum integer,
    floor_finishing_materials_others integer,
    floor_finishing_materials_none integer,
    floor_finishing_materials_not_reported integer,
    floor_construction_materials_concrete integer,
    floor_construction_materials_wood integer,
    floor_construction_materials_coconut_lumber integer,
    floor_construction_materials_bamboo integer,
    floor_construction_materials_earth_sand_mud integer,
    floor_construction_materials_makeshift_salvaged_improvised_mate integer,
    floor_construction_materials_others integer,
    floor_construction_materials_not_reported integer,
    repair_state_needs_no_repair_needs_minor_repair integer,
    repair_state_needs_major_repair integer,
    repair_state_dilapidated_condemned integer,
    repair_state_under_renovation_being_repaired integer,
    "repair_state_under_construction_(ongoing)" integer,
    repair_state_unfinished_construction integer,
    repair_state_not_reported integer,
    year_built_2020 integer,
    year_built_2019 integer,
    year_built_2018 integer,
    year_built_2017 integer,
    year_built_2016 integer,
    year_built_2011_to_2015 integer,
    year_built_2001_to_2010 integer,
    year_built_1991_to_2000 integer,
    year_built_1981_to_1990 integer,
    year_built_1980_or_earlier integer,
    year_built_dont_know integer,
    year_built_not_reported integer,
    floor_area_less_than_5_sqm_or_less_than_54_sqft integer,
    "floor_area_5_–_9_sqm_or_54_to_107_sqft" integer,
    floor_area_10_to_19_sqm_or_108_to_209_sqft integer,
    floor_area_20_to_29_sqm_or_210_to_317_sqft integer,
    floor_area_30_to_49_sqm_or_318_to_532_sqft integer,
    floor_area_50_to_69_sqm_or_533_to_748_sqft integer,
    floor_area_70_to_89_sqm_or_749_to_963_sqft integer,
    floor_area_90_to_119_sqm_or_964_to_1286_sqft integer,
    floor_area_120_to_149_sqm_or_1_287_to_1609_sqft integer,
    floor_area_150_to_199_sqm_or_1_610_to_2147_sqft integer,
    floor_area_200_sqm_and_over_or_2148_sqft_and_over integer,
    floor_area_not_reported integer,
    tenure_status_own_or_owner_like_possession_of_the_house_and_lot integer,
    tenure_status_own_house_rent_lot integer,
    tenure_status_own_house_rent_free_lot_with_consent_of_owner integer,
    tenure_status_own_house_rent_free_lot_without_consent_of_owner integer,
    tenure_status_rent_house_room_including_lot integer,
    tenure_status_rent_free_house_and_lot_with_consent_of_owner integer,
    tenure_status_rent_free_house_and_lot_without_consent_of_owner integer,
    tenure_status_not_reported integer,
    land_ownership_with_other_residential_lands integer,
    land_ownership_without_other_residential_lands integer,
    land_ownership_not_reported integer,
    land_ownership_with_agricultural_lands integer,
    land_ownership_without_agricultural_lands integer,
    land_ownership_with_agricultural_lands_not_reported integer,
    land_ownership_with_agricultural_lands_carp_acquired integer,
    land_ownership_without_agricultural_lands_carp_acquired integer,
    land_ownership_agricultural_lands_acquired_not_reported integer,
    land_ownership_with_other_lands integer,
    land_ownership_without_other_lands integer,
    land_ownership_other_lands_not_reported integer,
    dialect_generally_spoken_abelling_aberling integer,
    dialect_generally_spoken_aeta integer,
    dialect_generally_spoken_aeta_ayta integer,
    dialect_generally_spoken_aeta_ayta_abelling_abellen integer,
    dialect_generally_spoken_aeta_ayta_ambala integer,
    dialect_generally_spoken_aeta_ayta_magbukun_magbekin_magbukon integer,
    dialect_generally_spoken_aeta_ayta_mag_indi integer,
    dialect_generally_spoken_aeta_ayta_mang_ansti integer,
    dialect_generally_spoken_aeta_ayta_sambal_zambal integer,
    dialect_generally_spoken_agta integer,
    dialect_generally_spoken_agta_isigiran integer,
    dialect_generally_spoken_agta_iraya_inagta_iraya integer,
    dialect_generally_spoken_agta_iriga_inagta_iriga integer,
    dialect_generally_spoken_agta_isarog_inagta_isarog integer,
    dialect_generally_spoken_agta_remontado_hatang_kaye integer,
    dialect_generally_spoken_agta_agay integer,
    dialect_generally_spoken_agta_cimaron integer,
    dialect_generally_spoken_agta_dumagat_casiguran integer,
    dialect_generally_spoken_agta_dumagat_umiray integer,
    dialect_generally_spoken_agta_dupanigan integer,
    dialect_generally_spoken_agta_labin integer,
    dialect_generally_spoken_agta_tabangnon integer,
    dialect_generally_spoken_agta_taboy integer,
    dialect_generally_spoken_agutaynen integer,
    dialect_generally_spoken_alta integer,
    dialect_generally_spoken_alta_kabulowan integer,
    dialect_generally_spoken_applai integer,
    dialect_generally_spoken_applai_kachakran_kadaclan integer,
    dialect_generally_spoken_aromanen_manobo_eromanen_manobo integer,
    dialect_gen_spoken_aromanen_manobo_eromanen_manobo_dibabeen integer,
    dialect_spoken_aromanen_manobo_eromanen_manobo_direrayaan integer,
    dialect_gen_spoken_aromanen_manobo_eromanen_manobo_ilianen integer,
    dialect_gen_spoken_aromanen_manobo_eromanen_manobo_isoroken integer,
    dialect_spoken_aromanen_manobo_eromanen_manobo_kirenteken integer,
    dialect_gen_spoken_aromanen_manobo_eromanen_manobo_kulmanen integer,
    dialect_spoken_aromanen_manobo_eromanen_manobo_lahitanen integer,
    dialect_spoken_aromanen_manobo_eromanen_manobo_livunganen integer,
    dialect_gen_spoken_aromanen_manobo_eromanen_manobo_mulitaan integer,
    dialect_spoken_aromanen_manobo_eromanen_manobo_pulengien integer,
    dialect_generally_spoken_arta integer,
    dialect_generally_spoken_ata integer,
    dialect_generally_spoken_atta integer,
    dialect_generally_spoken_ata_inata_negrito integer,
    dialect_generally_spoken_ati_inete_inati_negros integer,
    dialect_generally_spoken_ayangan integer,
    dialect_generally_spoken_ayangan_henanga integer,
    dialect_generally_spoken_ayta integer,
    dialect_generally_spoken_ayta_kadi integer,
    dialect_generally_spoken_blaan_blaan integer,
    dialect_generally_spoken_badjao integer,
    dialect_generally_spoken_bago integer,
    dialect_generally_spoken_bagobo integer,
    dialect_generally_spoken_bagobo_clata_klata integer,
    dialect_generally_spoken_bagobo_tagabawa integer,
    dialect_generally_spoken_bajao_bajau integer,
    dialect_generally_spoken_balangao integer,
    dialect_generally_spoken_balangao_lias integer,
    dialect_generally_spoken_baliwon integer,
    dialect_generally_spoken_bantoanon_asi integer,
    dialect_generally_spoken_banwaon integer,
    dialect_generally_spoken_batak integer,
    dialect_generally_spoken_batangan integer,
    dialect_generally_spoken_bikol_bicol integer,
    dialect_generally_spoken_bisaya_binisaya integer,
    dialect_generally_spoken_boholano integer,
    dialect_generally_spoken_bolinaw integer,
    dialect_generally_spoken_bontok integer,
    dialect_generally_spoken_bontok_majukayong integer,
    dialect_generally_spoken_bugkalot_ilongot integer,
    dialect_generally_spoken_butwanon integer,
    dialect_generally_spoken_bukidnon_binukid integer,
    dialect_generally_spoken_bukidnon_binukid_akeanon_aklanon integer,
    dialect_generally_spoken_bukidnon_binukid__halawodnon integer,
    dialect_generally_spoken_cagayanen integer,
    dialect_generally_spoken_calinga integer,
    "dialect_generally_spoken_capizeño" integer,
    "dialect_generally_spoken_caviteño" integer,
    "dialect_generally_spoken_caviteño_chavacano" integer,
    dialect_generally_spoken_cebuano integer,
    "dialect_generally_spoken_cotabateño" integer,
    "dialect_generally_spoken_cotabateño_chavacano" integer,
    dialect_generally_spoken_cuyonon_cuyonen integer,
    dialect_generally_spoken_davao_chavacano integer,
    "dialect_generally_spoken_davaweño" integer,
    dialect_generally_spoken_diangan integer,
    dialect_generally_spoken_dibabawon integer,
    dialect_generally_spoken_dumagat integer,
    dialect_generally_spoken_dumagat_edimala integer,
    dialect_generally_spoken_dumagat_kabolowen integer,
    dialect_generally_spoken_dumagat_remontado integer,
    dialect_generally_spoken_dumagat_tagebolus integer,
    dialect_generally_spoken_eskaya integer,
    dialect_generally_spoken_gaddang integer,
    dialect_generally_spoken_guiangan integer,
    dialect_generally_spoken_hamtikanon integer,
    dialect_generally_spoken_higaonon_higa_onon integer,
    dialect_generally_spoken_higaonon_tagoloanon integer,
    dialect_generally_spoken_ibaloi_ibaloy integer,
    dialect_generally_spoken_ibanag integer,
    dialect_generally_spoken_ibatan integer,
    dialect_generally_spoken_ibukid integer,
    dialect_generally_spoken_ifugao integer,
    dialect_generally_spoken_illaud integer,
    dialect_generally_spoken_ilocano integer,
    dialect_generally_spoken_hiligaynon_ilonggo integer,
    dialect_generally_spoken_inabaknon integer,
    dialect_generally_spoken_imalawa integer,
    dialect_generally_spoken_iranon_iranun_iraynon integer,
    dialect_generally_spoken_irungdungan integer,
    dialect_generally_spoken_isinai integer,
    dialect_generally_spoken_isnag integer,
    dialect_generally_spoken_isneg integer,
    dialect_generally_spoken_isneg_isnag integer,
    dialect_generally_spoken_itawis integer,
    dialect_generally_spoken_itneg integer,
    dialect_generally_spoken_itneg_tingguian integer,
    dialect_generally_spoken_itneg_tinguian_adasen integer,
    dialect_generally_spoken_itneg_tinguian_balatok integer,
    dialect_generally_spoken_itneg_tinguian_banao integer,
    dialect_generally_spoken_itneg_tinguian_belwang integer,
    dialect_generally_spoken_itneg_tinguian_binongan integer,
    dialect_generally_spoken_itneg_tinguian_gubang integer,
    dialect_generally_spoken_itneg_tinguian_inlaud integer,
    dialect_generally_spoken_itneg_tinguian_mabaka integer,
    dialect_generally_spoken_itneg_tinguian_maeng integer,
    dialect_generally_spoken_itneg_tinguian_masadiit integer,
    dialect_generally_spoken_itneg_tinguian_muyadan integer,
    dialect_generally_spoken_ivatan integer,
    dialect_generally_spoken_iwak_iowak_owak_i_wak integer,
    dialect_generally_spoken_jama_mapun integer,
    dialect_generally_spoken_kabalianon integer,
    dialect_generally_spoken_kabayukan integer,
    dialect_generally_spoken_kabihug integer,
    dialect_generally_spoken_kabihug_manide integer,
    dialect_generally_spoken_kalagan integer,
    dialect_generally_spoken_kailawan_kaylawan integer,
    dialect_generally_spoken_kalamyanen integer,
    dialect_generally_spoken_kalanguya integer,
    dialect_generally_spoken_kalanguya_ikalahan integer,
    dialect_generally_spoken_kalanguya_yattuka integer,
    dialect_generally_spoken_kalinga integer,
    dialect_generally_spoken_kaluyanen integer,
    dialect_generally_spoken_kamayo integer,
    dialect_generally_spoken_kamiguin integer,
    dialect_generally_spoken_kankanaey integer,
    dialect_generally_spoken_kankanaey_hakki integer,
    dialect_generally_spoken_kapampangan integer,
    dialect_generally_spoken_karao integer,
    dialect_generally_spoken_karay_a_kinaray_a integer,
    dialect_generally_spoken_karulano integer,
    dialect_generally_spoken_kasiguranin integer,
    dialect_generally_spoken_kaunana integer,
    dialect_generally_spoken_kalibugan_kolibugan integer,
    dialect_generally_spoken_lambangian integer,
    dialect_generally_spoken_langilan integer,
    dialect_generally_spoken_magahats integer,
    dialect_generally_spoken_magkunana integer,
    dialect_generally_spoken_maguindanao integer,
    dialect_generally_spoken_malaueg integer,
    dialect_generally_spoken_malaynon integer,
    dialect_generally_spoken_mamanwa integer,
    dialect_generally_spoken_mandaya integer,
    dialect_generally_spoken_mangguangan integer,
    dialect_generally_spoken_mangyan integer,
    dialect_generally_spoken_mangyan_alangan integer,
    dialect_generally_spoken_mangyan_bangon integer,
    dialect_generally_spoken_mangyan_buhid integer,
    dialect_generally_spoken_mangyan_buhid_bangon integer,
    dialect_generally_spoken_mangyan_gubatnon integer,
    dialect_generally_spoken_mangyan_hanunuo integer,
    dialect_generally_spoken_mangyan_iraya integer,
    dialect_generally_spoken_mangyan_ratagnon integer,
    dialect_generally_spoken_mangyan_tadyawan integer,
    dialect_generally_spoken_mangyan_tau_buid integer,
    dialect_generally_spoken_manobo integer,
    dialect_generally_spoken_manobo_aromanon integer,
    dialect_generally_spoken_manobo_ata integer,
    dialect_generally_spoken_manobo_blit integer,
    dialect_generally_spoken_manobo_blit___tasaday integer,
    dialect_generally_spoken_manobo_agusan integer,
    dialect_generally_spoken_manobo_dibabawon integer,
    dialect_generally_spoken_manobo_kalamansig integer,
    dialect_generally_spoken_manobo_kinamigin_kamiguin boolean,
    dialect_generally_spoken_manobo_matigsalug integer,
    dialect_generally_spoken_manobo_saranggani integer,
    dialect_generally_spoken_manobo_tigwahanon integer,
    dialect_generally_spoken_manobo_dulangan integer,
    dialect_generally_spoken_manobo_dulangan_lambangian integer,
    dialect_generally_spoken_manobo_dunggoanon integer,
    dialect_generally_spoken_manobo_kirenteken integer,
    dialect_generally_spoken_manobo_pulanguinon integer,
    dialect_generally_spoken_mansaka integer,
    dialect_generally_spoken_manubo_ubo_manobo_ubo integer,
    dialect_generally_spoken_maranao integer,
    dialect_generally_spoken_masadiit integer,
    "dialect_generally_spoken_masbateño_masbatenon" integer,
    dialect_generally_spoken_molbog integer,
    dialect_generally_spoken_muyadan integer,
    dialect_generally_spoken_obu_manuvu_ubo_manobo integer,
    dialect_generally_spoken_onhan integer,
    dialect_generally_spoken_palawani integer,
    dialect_generally_spoken_palawan_o integer,
    dialect_generally_spoken_palawan_o_ken_ey integer,
    dialect_generally_spoken_palawan_o_taot_bato integer,
    dialect_generally_spoken_panay_bukidnon integer,
    dialect_generally_spoken_pan_ayanon integer,
    dialect_generally_spoken_pangasinan_panggalato integer,
    dialect_generally_spoken_pannon integer,
    dialect_generally_spoken_parananum integer,
    dialect_generally_spoken_porohanon integer,
    dialect_generally_spoken_romblomanon_ini integer,
    dialect_generally_spoken_sama_samal integer,
    dialect_generally_spoken_sama_badjao integer,
    dialect_generally_spoken_sama_bangingi integer,
    dialect_generally_spoken_sama_laut integer,
    dialect_generally_spoken_sangir_sangil integer,
    dialect_generally_spoken_sibuyan_mangyan_tagabukid integer,
    dialect_generally_spoken_sinadanga integer,
    dialect_generally_spoken_subanen_subanon_subanun integer,
    dialect_generally_spoken_surigaonon integer,
    "dialect_generally_spoken_t‘boli_tboli" integer,
    dialect_generally_spoken_tduray_teduray integer,
    dialect_generally_spoken_tagabawa integer,
    dialect_generally_spoken_tagabulos integer,
    dialect_generally_spoken_tagakaulo integer,
    dialect_generally_spoken_tagalog integer,
    dialect_generally_spoken_tagbanua integer,
    dialect_generally_spoken_tagbanua_tandulanen integer,
    dialect_generally_spoken_tagbanua_calamian integer,
    dialect_generally_spoken_tagbanua_kalamianen integer,
    dialect_generally_spoken_talaandig integer,
    dialect_generally_spoken_talaingod integer,
    dialect_generally_spoken_tausug_bahasa_sug integer,
    dialect_generally_spoken_tigwahanon integer,
    dialect_generally_spoken_tinananen integer,
    dialect_generally_spoken_tingguian integer,
    dialect_generally_spoken_tuwali integer,
    dialect_generally_spoken_tuwali_kele_i integer,
    dialect_ubo_monuvu_manobo_ubo_ubo_manobo_ubo_manuvu_ubo_menuvu integer,
    dialect_generally_spoken_umayamnon integer,
    dialect_generally_spoken_waray integer,
    dialect_generally_spoken_yakan integer,
    dialect_generally_spoken_yapayao integer,
    dialect_generally_spoken_yogad integer,
    "dialect_generally_spoken_zamboagueño_chavacano" integer,
    dialect_generally_spoken_other_local_dialects integer,
    dialect_generally_spoken_american_english integer,
    dialect_generally_spoken_british integer,
    dialect_generally_spoken_chinese integer,
    dialect_generally_spoken_french integer,
    dialect_generally_spoken_german integer,
    dialect_generally_spoken_italian integer,
    dialect_generally_spoken_japanese integer,
    dialect_generally_spoken_korean integer,
    dialect_generally_spoken_spanish integer,
    dialect_generally_spoken_other_foreign_languages integer,
    dialect_generally_spoken_not_reported integer,
    residence_5_years_from_now_ncr integer,
    residence_5_years_from_now_manila integer,
    residence_5_years_from_now_mandaluyong integer,
    residence_5_years_from_now_marikina integer,
    residence_5_years_from_now_pasig integer,
    residence_5_years_from_now_quezon_city integer,
    residence_5_years_from_now_san_juan integer,
    residence_5_years_from_now_caloocan integer,
    residence_5_years_from_now_malabon integer,
    residence_5_years_from_now_navotas integer,
    residence_5_years_from_now_malabon_1 integer,
    residence_5_years_from_now_las_pinas integer,
    residence_5_years_from_now_makati integer,
    residence_5_years_from_now_muntinlupa integer,
    residence_5_years_from_now_paranaque integer,
    residence_5_years_from_now_pasay integer,
    residence_5_years_from_now_taguig integer,
    residence_5_years_from_now_pateros integer,
    residence_5_years_from_now_ncr_unknown_city integer,
    residence_5_years_from_now_car integer,
    residence_5_years_from_now_abra integer,
    residence_5_years_from_now_benguet integer,
    residence_5_years_from_now_baguio integer,
    residence_5_years_from_now_ifugao integer,
    residence_5_years_from_now_kalinga integer,
    residence_5_years_from_now_mountain_province integer,
    residence_5_years_from_now_apayao integer,
    residence_5_years_from_now_region_1 integer,
    residence_5_years_from_now_ilocos_norte integer,
    residence_5_years_from_now_ilocos_sur integer,
    residence_5_years_from_now_la_union integer,
    residence_5_years_from_now_pangasinan integer,
    residence_5_years_from_now_region_1_1 integer,
    residence_5_years_from_now_batanes integer,
    residence_5_years_from_now_cagayan integer,
    residence_5_years_from_now_isabela integer,
    residence_5_years_from_now_nueva_vizcaya integer,
    residence_5_years_from_now_quirino integer,
    residence_5_years_from_now_region_3 integer,
    residence_5_years_from_now_bataan integer,
    residence_5_years_from_now_bulacan integer,
    residence_5_years_from_now_nueva_ecija integer,
    residence_5_years_from_now_pampanga integer,
    residence_5_years_from_now_angeles_city integer,
    residence_5_years_from_now_tarlac integer,
    residence_5_years_from_now_zambales integer,
    residence_5_years_from_now_olongapo integer,
    residence_5_years_from_now_aurora integer,
    residence_5_years_from_now_region_4a integer,
    residence_5_years_from_now_batangas integer,
    residence_5_years_from_now_cavite integer,
    residence_5_years_from_now_laguna integer,
    residence_5_years_from_now_quezon integer,
    residence_5_years_from_now_lucena_city integer,
    residence_5_years_from_now_rizal integer,
    residence_5_years_from_now_mimaropa integer,
    residence_5_years_from_now_marinduque integer,
    residence_5_years_from_now_occidental_mindoro integer,
    residence_5_years_from_now_oriental_mindoro integer,
    residence_5_years_from_now_palawan integer,
    residence_5_years_from_now_puerto_princesa_city integer,
    residence_5_years_from_now_romblon integer,
    residence_5_years_from_now_region_4 integer,
    residence_5_years_from_now_albay integer,
    residence_5_years_from_now_camarines_norte integer,
    residence_5_years_from_now_camarines_sur integer,
    residence_5_years_from_now_catanduanes integer,
    residence_5_years_from_now_masbate integer,
    residence_5_years_from_now_sorsogon integer,
    residence_5_years_from_now_region_6 integer,
    residence_5_years_from_now_aklan integer,
    residence_5_years_from_now_antique integer,
    residence_5_years_from_now_capiz integer,
    residence_5_years_from_now_iloilo integer,
    residence_5_years_from_now_iloilo_city integer,
    residence_5_years_from_now_negros_occidental integer,
    residence_5_years_from_now_guimaras integer,
    residence_5_years_from_now_region_7 integer,
    residence_5_years_from_now_bohol integer,
    residence_5_years_from_now_cebu integer,
    residence_5_years_from_now_cebu_city integer,
    residence_5_years_from_now_lapu_lapu_city integer,
    residence_5_years_from_now_mandaue_city integer,
    residence_5_years_from_now_negros_oriental integer,
    residence_5_years_from_now_siquijor integer,
    residence_5_years_from_now_region_8 integer,
    residence_5_years_from_now_eastern_samar integer,
    residence_5_years_from_now_leyte integer,
    residence_5_years_from_now_tacloban_city integer,
    residence_5_years_from_now_northern_samar integer,
    residence_5_years_from_now_western_samar integer,
    residence_5_years_from_now_southern_leyte integer,
    residence_5_years_from_now_biliran integer,
    residence_5_years_from_now_region_9 integer,
    residence_5_years_from_now_zamboanga_del_norte integer,
    residence_5_years_from_now_zamboanga_del_sur integer,
    residence_5_years_from_now_zamboanga_city integer,
    residence_5_years_from_now_zamboanga_sibugay integer,
    residence_5_years_from_now_isabela_city integer,
    residence_5_years_from_now_region_10 integer,
    residence_5_years_from_now_bukidnon integer,
    residence_5_years_from_now_camiguin integer,
    residence_5_years_from_now_lanao_del_norte integer,
    residence_5_years_from_now_iligan_city integer,
    residence_5_years_from_now_misamis_occidental integer,
    residence_5_years_from_now_misamis_oriental integer,
    residence_5_years_from_now_cagayan_de_oro_city integer,
    residence_5_years_from_now_region_11 integer,
    residence_5_years_from_now_davao_del_norte integer,
    residence_5_years_from_now_davao_del_sur integer,
    residence_5_years_from_now_davao_city integer,
    residence_5_years_from_now_davao_oriental integer,
    residence_5_years_from_now_compostela_valley integer,
    residence_5_years_from_now_davao_occidental integer,
    residence_5_years_from_now_region_12 integer,
    residence_5_years_from_now_north_cotabato integer,
    residence_5_years_from_now_south_cotabato integer,
    residence_5_years_from_now_general_santos_city integer,
    residence_5_years_from_now_sultan_kudarat integer,
    residence_5_years_from_now_sarangani integer,
    residence_5_years_from_now_region_13 integer,
    residence_5_years_from_now_agusan_del_norte integer,
    residence_5_years_from_now_butuan_city integer,
    residence_5_years_from_now_agusan_del_sur integer,
    residence_5_years_from_now_surigao_del_norte integer,
    residence_5_years_from_now_surigao_del_sur integer,
    residence_5_years_from_now_dinagat_island integer,
    residence_5_years_from_now_barmm integer,
    residence_5_years_from_now_basilan integer,
    residence_5_years_from_now_lanao_del_sur integer,
    residence_5_years_from_now_maguindanao integer,
    residence_5_years_from_now_sulu integer,
    residence_5_years_from_now_tawi_tawi integer,
    residence_5_years_from_now_foreign_country integer,
    residence_5_years_from_now_not_reported integer,
    first_household_in_the_housing_unit integer
);


--
-- Name: psa_2020_id_seq; Type: SEQUENCE; Schema: data; Owner: -
--

CREATE SEQUENCE data.psa_2020_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: psa_2020_id_seq; Type: SEQUENCE OWNED BY; Schema: data; Owner: -
--

ALTER SEQUENCE data.psa_2020_id_seq OWNED BY data.psa_2020.id;


--
-- Name: psa_2020_municipalities; Type: MATERIALIZED VIEW; Schema: data; Owner: -
--

CREATE MATERIALIZED VIEW data.psa_2020_municipalities AS
 WITH src AS (
         SELECT (b.reg_code)::text AS reg_code,
            b.reg_name,
            (b.pro_code)::text AS pro_code,
            b.pro_name,
            (b.mun_code)::text AS mun_code,
            b.mun_name,
            COALESCE(p.population, 0) AS population,
            public.st_transform(b.geom, 4326) AS geom
           FROM (core.brgy_bndry b
             LEFT JOIN data.psa_2020 p ON (((p.bar_code)::text = (b.bgy_code)::text)))
        ), m AS (
         SELECT src.mun_code,
            max((src.mun_name)::text) AS mun_name,
            max(src.reg_code) AS reg_code,
            max((src.reg_name)::text) AS reg_name,
            max(src.pro_code) AS pro_code,
            max((src.pro_name)::text) AS pro_name,
            sum(src.population) AS population,
            public.st_multi(public.st_simplifypreservetopology(public.st_unaryunion(public.st_collect(src.geom)), (0.0005)::double precision)) AS geom
           FROM src
          GROUP BY src.mun_code
        )
 SELECT mun_code,
    mun_name,
    reg_code,
    reg_name,
    pro_code,
    pro_name,
    population,
    geom,
    public.st_pointonsurface(geom) AS lbl
   FROM m
  WITH NO DATA;


--
-- Name: scope; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE data.scope (
    scope_id integer NOT NULL,
    user_id character varying(100),
    scope_level integer,
    reg_code character varying(50),
    pro_code character varying(50),
    mun_code character varying(50),
    bgy_code character varying(50),
    poi boolean DEFAULT true,
    smv boolean DEFAULT true,
    psa boolean DEFAULT true,
    parcel boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: scope_scope_id_seq; Type: SEQUENCE; Schema: data; Owner: -
--

ALTER TABLE data.scope ALTER COLUMN scope_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME data.scope_scope_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: smv; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE data.smv (
    id integer NOT NULL,
    geom public.geometry(MultiLineString,4326),
    objectid bigint,
    fid_ncr_ro bigint,
    osm_id character varying(255),
    code integer,
    fclass character varying(255),
    reg_code character varying(254),
    pro_code character varying(254),
    mun_code character varying(254),
    bgy_code character varying(254),
    reg_name text,
    pro_name text,
    mun_name text,
    bgy_name text,
    district character varying(255),
    zone integer,
    street character varying(255),
    smv_year integer,
    r bigint,
    c bigint,
    i bigint,
    a bigint,
    zv_rr bigint,
    zv_cr bigint,
    zv_i bigint,
    zv_x bigint,
    zv_rc bigint,
    zv_cc bigint,
    zv_ps bigint,
    flg bigint,
    dist integer
);


--
-- Name: smv2_id_seq; Type: SEQUENCE; Schema: data; Owner: -
--

CREATE SEQUENCE data.smv2_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: smv2_id_seq; Type: SEQUENCE OWNED BY; Schema: data; Owner: -
--

ALTER SEQUENCE data.smv2_id_seq OWNED BY data.smv.id;


--
-- Name: user_id_counter; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE data.user_id_counter (
    id_date date NOT NULL,
    last_seq integer DEFAULT 0 NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: data; Owner: -
--

CREATE TABLE data.users (
    id integer NOT NULL,
    user_id character varying(100) DEFAULT data.generate_user_id(),
    username character varying(50) NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(100),
    phone_number character varying(20),
    address text,
    role character varying(20) DEFAULT 'user'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    token text,
    CONSTRAINT username_not_admin CHECK (((username)::text <> 'admin'::text)),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('admin'::character varying)::text, ('user'::character varying)::text, ('guest'::character varying)::text]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('banned'::character varying)::text])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: data; Owner: -
--

ALTER TABLE data.users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME data.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: category; Type: TABLE; Schema: lookup; Owner: -
--

CREATE TABLE lookup.category (
    id integer NOT NULL,
    name character varying(254) NOT NULL,
    category_id integer
);


--
-- Name: category_id_seq; Type: SEQUENCE; Schema: lookup; Owner: -
--

CREATE SEQUENCE lookup.category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: category_id_seq; Type: SEQUENCE OWNED BY; Schema: lookup; Owner: -
--

ALTER SEQUENCE lookup.category_id_seq OWNED BY lookup.category.id;


--
-- Name: poi id; Type: DEFAULT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.poi ALTER COLUMN id SET DEFAULT nextval('data.poi_id_seq'::regclass);


--
-- Name: psa_2020 id; Type: DEFAULT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.psa_2020 ALTER COLUMN id SET DEFAULT nextval('data.psa_2020_id_seq'::regclass);


--
-- Name: smv id; Type: DEFAULT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.smv ALTER COLUMN id SET DEFAULT nextval('data.smv2_id_seq'::regclass);


--
-- Name: category id; Type: DEFAULT; Schema: lookup; Owner: -
--

ALTER TABLE ONLY lookup.category ALTER COLUMN id SET DEFAULT nextval('lookup.category_id_seq'::regclass);


--
-- Name: brgy_bndry brgy_bndry_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.brgy_bndry
    ADD CONSTRAINT brgy_bndry_pkey PRIMARY KEY (id);


--
-- Name: muni_bndry muni_bndry_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.muni_bndry
    ADD CONSTRAINT muni_bndry_pkey PRIMARY KEY (id);


--
-- Name: prov_bndry prov_bndry_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.prov_bndry
    ADD CONSTRAINT prov_bndry_pkey PRIMARY KEY (id);


--
-- Name: region_bndry region_bndry_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.region_bndry
    ADD CONSTRAINT region_bndry_pkey PRIMARY KEY (id);


--
-- Name: poi poi_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.poi
    ADD CONSTRAINT poi_pkey PRIMARY KEY (id);


--
-- Name: psa_2020 psa_2020_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.psa_2020
    ADD CONSTRAINT psa_2020_pkey PRIMARY KEY (id);


--
-- Name: scope scope_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.scope
    ADD CONSTRAINT scope_pkey PRIMARY KEY (scope_id);


--
-- Name: smv smv2_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.smv
    ADD CONSTRAINT smv2_pkey PRIMARY KEY (id);


--
-- Name: user_id_counter user_id_counter_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.user_id_counter
    ADD CONSTRAINT user_id_counter_pkey PRIMARY KEY (id_date);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_user_id_key; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.users
    ADD CONSTRAINT users_user_id_key UNIQUE (user_id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: data; Owner: -
--

ALTER TABLE ONLY data.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: category category_category_id_key; Type: CONSTRAINT; Schema: lookup; Owner: -
--

ALTER TABLE ONLY lookup.category
    ADD CONSTRAINT category_category_id_key UNIQUE (category_id);


--
-- Name: category category_pkey; Type: CONSTRAINT; Schema: lookup; Owner: -
--

ALTER TABLE ONLY lookup.category
    ADD CONSTRAINT category_pkey PRIMARY KEY (id);


--
-- Name: brgy_bndry_geom_gix; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX brgy_bndry_geom_gix ON core.brgy_bndry USING gist (geom);


--
-- Name: brgy_bndry_geom_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX brgy_bndry_geom_idx ON core.brgy_bndry USING gist (geom);


--
-- Name: idx_brgy_bndry_geom; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_brgy_bndry_geom ON core.brgy_bndry USING gist (geom);


--
-- Name: idx_brgy_bndry_id; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_brgy_bndry_id ON core.brgy_bndry USING btree (id);


--
-- Name: idx_city_bndry_geom; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_city_bndry_geom ON core.muni_bndry USING gist (geom);


--
-- Name: idx_city_bndry_id; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_city_bndry_id ON core.muni_bndry USING btree (id);


--
-- Name: idx_prov_bndry_geom; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_prov_bndry_geom ON core.prov_bndry USING gist (geom);


--
-- Name: idx_prov_id; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_prov_id ON core.prov_bndry USING btree (id);


--
-- Name: idx_region_bndry_geom; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_region_bndry_geom ON core.region_bndry USING gist (geom);


--
-- Name: idx_region_bndry_id; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX idx_region_bndry_id ON core.region_bndry USING btree (id);


--
-- Name: pop_brgy_bndry_bgy_code_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_bgy_code_idx ON core.brgy_bndry USING btree (bgy_code);


--
-- Name: pop_brgy_bndry_bgy_code_text_trgm_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_bgy_code_text_trgm_idx ON core.brgy_bndry USING gin (((bgy_code)::text) public.gin_trgm_ops);


--
-- Name: pop_brgy_bndry_bgy_name_trgm_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_bgy_name_trgm_idx ON core.brgy_bndry USING gin (bgy_name public.gin_trgm_ops);


--
-- Name: pop_brgy_bndry_geom_gist_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_geom_gist_idx ON core.brgy_bndry USING gist (geom);


--
-- Name: pop_brgy_bndry_mun_code_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_mun_code_idx ON core.brgy_bndry USING btree (mun_code);


--
-- Name: pop_brgy_bndry_mun_name_trgm_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_mun_name_trgm_idx ON core.brgy_bndry USING gin (mun_name public.gin_trgm_ops);


--
-- Name: pop_brgy_bndry_pro_code_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_pro_code_idx ON core.brgy_bndry USING btree (pro_code);


--
-- Name: pop_brgy_bndry_pro_name_trgm_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_pro_name_trgm_idx ON core.brgy_bndry USING gin (pro_name public.gin_trgm_ops);


--
-- Name: pop_brgy_bndry_reg_code_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_reg_code_idx ON core.brgy_bndry USING btree (reg_code);


--
-- Name: pop_brgy_bndry_reg_name_trgm_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pop_brgy_bndry_reg_name_trgm_idx ON core.brgy_bndry USING gin (reg_name public.gin_trgm_ops);


--
-- Name: region_bndry_geom_gix; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX region_bndry_geom_gix ON core.region_bndry USING gist (geom);


--
-- Name: region_bndry_geom_z0_6_gix; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX region_bndry_geom_z0_6_gix ON core.region_bndry USING gist (geom_z0_6);


--
-- Name: region_bndry_geom_z7_12_gix; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX region_bndry_geom_z7_12_gix ON core.region_bndry USING gist (geom_z7_12);


--
-- Name: region_bndry_id_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX region_bndry_id_idx ON core.region_bndry USING btree (id);


--
-- Name: poi_bgy_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_bgy_code_idx ON data.poi USING btree (bgy_code);


--
-- Name: poi_bgy_trgm; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_bgy_trgm ON data.poi USING gin (bgy_name public.gin_trgm_ops);


--
-- Name: poi_category_id_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_category_id_idx ON data.poi USING btree (category_id);


--
-- Name: poi_geom_3857_gix; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_geom_3857_gix ON data.poi USING gist (geom_3857);


--
-- Name: poi_geom_gix; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_geom_gix ON data.poi USING gist (geom);


--
-- Name: poi_mun_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_mun_code_idx ON data.poi USING btree (mun_code);


--
-- Name: poi_mun_trgm; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_mun_trgm ON data.poi USING gin (mun_name public.gin_trgm_ops);


--
-- Name: poi_name_trgm; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_name_trgm ON data.poi USING gin (name public.gin_trgm_ops);


--
-- Name: poi_pro_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_pro_code_idx ON data.poi USING btree (pro_code);


--
-- Name: poi_pro_trgm; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_pro_trgm ON data.poi USING gin (pro_name public.gin_trgm_ops);


--
-- Name: poi_reg_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_reg_code_idx ON data.poi USING btree (reg_code);


--
-- Name: poi_reg_trgm; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX poi_reg_trgm ON data.poi USING gin (reg_name public.gin_trgm_ops);


--
-- Name: pop_psa_2020_bar_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_bar_code_idx ON data.psa_2020 USING btree (bar_code);


--
-- Name: pop_psa_2020_municipalities_geom_gist_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_geom_gist_idx ON data.psa_2020_municipalities USING gist (geom);


--
-- Name: pop_psa_2020_municipalities_mun_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_mun_code_idx ON data.psa_2020_municipalities USING btree (mun_code);


--
-- Name: pop_psa_2020_municipalities_mun_code_text_trgm_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_mun_code_text_trgm_idx ON data.psa_2020_municipalities USING gin (mun_code public.gin_trgm_ops);


--
-- Name: pop_psa_2020_municipalities_mun_name_trgm_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_mun_name_trgm_idx ON data.psa_2020_municipalities USING gin (mun_name public.gin_trgm_ops);


--
-- Name: pop_psa_2020_municipalities_pro_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_pro_code_idx ON data.psa_2020_municipalities USING btree (pro_code);


--
-- Name: pop_psa_2020_municipalities_pro_code_text_trgm_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_pro_code_text_trgm_idx ON data.psa_2020_municipalities USING gin (pro_code public.gin_trgm_ops);


--
-- Name: pop_psa_2020_municipalities_pro_name_trgm_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_pro_name_trgm_idx ON data.psa_2020_municipalities USING gin (pro_name public.gin_trgm_ops);


--
-- Name: pop_psa_2020_municipalities_reg_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_reg_code_idx ON data.psa_2020_municipalities USING btree (reg_code);


--
-- Name: pop_psa_2020_municipalities_reg_code_text_trgm_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_reg_code_text_trgm_idx ON data.psa_2020_municipalities USING gin (reg_code public.gin_trgm_ops);


--
-- Name: pop_psa_2020_municipalities_reg_name_trgm_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX pop_psa_2020_municipalities_reg_name_trgm_idx ON data.psa_2020_municipalities USING gin (reg_name public.gin_trgm_ops);


--
-- Name: psa_2020_municipalities_geom_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX psa_2020_municipalities_geom_idx ON data.psa_2020_municipalities USING gist (geom);


--
-- Name: psa_2020_municipalities_mun_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE UNIQUE INDEX psa_2020_municipalities_mun_code_idx ON data.psa_2020_municipalities USING btree (mun_code);


--
-- Name: psa_2020_municipalities_pro_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX psa_2020_municipalities_pro_code_idx ON data.psa_2020_municipalities USING btree (pro_code);


--
-- Name: psa_2020_municipalities_reg_code_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX psa_2020_municipalities_reg_code_idx ON data.psa_2020_municipalities USING btree (reg_code);


--
-- Name: smv_geom_gix; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX smv_geom_gix ON data.smv USING gist (geom);


--
-- Name: smv_geom_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE INDEX smv_geom_idx ON data.smv USING gist (geom);


--
-- Name: users_username_idx; Type: INDEX; Schema: data; Owner: -
--

CREATE UNIQUE INDEX users_username_idx ON data.users USING btree (username);


--
-- Name: scope set_updated_at; Type: TRIGGER; Schema: data; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON data.scope FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- PostgreSQL database dump complete
--


