LOAD spatial;
CREATE OR REPLACE TABLE pick AS
SELECT id AS overture_id, left(trim(name),120) AS name, sayso_cat(basic_category, tax) AS category, city,
       split_part(city, ', ', 2) AS region, left(trim(address),200) AS address,
       round(lat,6) AS lat, round(lng,6) AS lng, geometry
FROM 'raw_places.parquet'
WHERE sayso_cat(basic_category, tax) IS NOT NULL
  AND coalesce(operating_status,'open') = 'open'
  AND confidence >= 0.4
  AND name IS NOT NULL AND trim(name) <> '';
CREATE OR REPLACE TABLE hoods AS
SELECT name, subtype, geometry, ST_Area(geometry) AS area,
       CASE subtype WHEN 'neighborhood' THEN 1 WHEN 'microhood' THEN 2 WHEN 'macrohood' THEN 3 ELSE 4 END AS pref
FROM 'areas.parquet' WHERE subtype IN ('neighborhood','microhood','macrohood','county') AND name NOT ILIKE '%community board%' AND name NOT ILIKE '%community district%';
CREATE OR REPLACE TABLE out AS
SELECT p.overture_id, p.name, p.category, p.city, p.region,
  (SELECT CASE WHEN h.subtype='county' THEN
            CASE h.name WHEN 'New York County' THEN 'Manhattan' WHEN 'Kings County' THEN 'Brooklyn' WHEN 'Queens County' THEN 'Queens'
                        WHEN 'Bronx County' THEN 'Bronx' WHEN 'Richmond County' THEN 'Staten Island' END
          ELSE h.name END
   FROM hoods h WHERE ST_Contains(h.geometry, p.geometry)
     AND (h.subtype <> 'county' OR p.city = 'New York, NY')
   ORDER BY h.pref, h.area LIMIT 1) AS neighborhood,
  p.address, p.lat, p.lng
FROM pick p;
SELECT city, count(*) places, count(neighborhood) with_hood FROM out GROUP BY 1 ORDER BY 2;
SELECT city, category, count(*) n FROM out GROUP BY ALL ORDER BY 1, 3 DESC;
