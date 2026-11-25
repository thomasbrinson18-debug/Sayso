CREATE OR REPLACE MACRO sayso_cat(bc, t) AS CASE
  WHEN t = 'yoga_studio' THEN 'Yoga studio'
  WHEN bc = 'gym' OR t IN ('pilates_studio','boot_camp','boxing_class','boxing_gym','cycling_class') THEN 'Gym'
  WHEN bc IN ('bar','alcoholic_beverage_venue') OR t = 'gastropub' THEN 'Bar'
  WHEN bc IN ('nightlife_venue','comedy_club') OR t IN ('music_venue','karaoke_venue','jazz_and_blues_venue') THEN 'Club'
  WHEN bc = 'coffee_shop' OR t = 'cafe' THEN 'Coffee shop'
  WHEN t IN ('beauty_salon','hair_salon','nail_salon','barber','hair_stylist','eyelash_service','waxing','threading_service','eyebrow_service','tanning_salon') THEN 'Salon'
  WHEN bc IN ('restaurant','fast_food_restaurant') OR t IN ('diner','bistro','tapas_bar','sandwich_shop','delicatessen','bagel_shop') THEN 'Restaurant'
END;
