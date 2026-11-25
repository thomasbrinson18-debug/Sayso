LOAD httpfs; LOAD spatial; SET s3_region='us-west-2';
CREATE OR REPLACE TABLE boxes AS SELECT * FROM (VALUES
 ('Baton Rouge','US-LA',30.45,-91.15),('St. Petersburg','US-FL',27.77,-82.64),('Tampa','US-FL',27.95,-82.46),
 ('New Orleans','US-LA',29.95,-90.07),('New York','US-NY',40.70,-73.95)) t(city,region,lat,lng);
CREATE OR REPLACE TABLE areas AS
SELECT a.id, a.names.primary AS name, a.subtype, a.class, a.region, a.geometry, a.bbox, b.city AS near_city
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-11-18.0/theme=divisions/type=division_area/*', hive_partitioning=1) a
JOIN boxes b ON a.bbox.xmin < b.lng+0.6 AND a.bbox.xmax > b.lng-0.6 AND a.bbox.ymin < b.lat+0.6 AND a.bbox.ymax > b.lat-0.6
WHERE a.country='US' AND a.subtype IN ('locality','neighborhood','macrohood','microhood','borough','county');
COPY areas TO 'areas.parquet' (FORMAT parquet);
SELECT near_city, subtype, count(*) n FROM areas GROUP BY ALL ORDER BY 1,2;
SELECT near_city, name, subtype, class, region, round(ST_Area(geometry)*10000,1) AS area_x FROM areas
WHERE subtype='locality' AND (name ILIKE '%baton rouge%' OR name ILIKE '%petersburg%' OR name ILIKE 'tampa' OR name ILIKE 'new orleans' OR name ILIKE 'new york%' OR name ILIKE 'city of new york');
