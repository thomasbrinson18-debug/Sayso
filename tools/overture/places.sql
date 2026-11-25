LOAD httpfs; LOAD spatial; SET s3_region='us-west-2';
CREATE OR REPLACE TABLE cityshape AS
SELECT * FROM (
  SELECT CASE name WHEN 'Baton Rouge' THEN 'Baton Rouge, LA' WHEN 'Saint Petersburg' THEN 'St. Petersburg, FL'
                   WHEN 'Tampa' THEN 'Tampa, FL' WHEN 'New Orleans' THEN 'New Orleans, LA' WHEN 'New York' THEN 'New York, NY' END AS city,
         geometry, bbox, row_number() OVER (PARTITION BY name ORDER BY id) rn
  FROM read_parquet('areas.parquet')
  WHERE subtype='locality' AND name IN ('Baton Rouge','Saint Petersburg','Tampa','New Orleans','New York')
    AND region IN ('US-LA','US-FL','US-NY')
) WHERE rn=1;
SELECT city, bbox FROM cityshape;
CREATE OR REPLACE TABLE raw AS
SELECT c.city, p.id, p.names.primary AS name, p.basic_category, p.taxonomy.primary AS tax, p.taxonomy.hierarchy AS hier,
       p.confidence, p.operating_status, p.addresses[1].freeform AS address, p.addresses[1].postcode AS postcode,
       ST_Y(p.geometry) AS lat, ST_X(p.geometry) AS lng, p.geometry
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-11-18.0/theme=places/type=place/*', hive_partitioning=1) p
JOIN cityshape c ON p.bbox.xmin BETWEEN c.bbox.xmin AND c.bbox.xmax AND p.bbox.ymin BETWEEN c.bbox.ymin AND c.bbox.ymax
WHERE ST_Within(p.geometry, c.geometry);
COPY raw TO 'raw_places.parquet' (FORMAT parquet);
SELECT city, count(*) FROM raw GROUP BY 1 ORDER BY 1;
