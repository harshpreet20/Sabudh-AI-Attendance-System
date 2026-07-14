-- 029_material_slides_cache.sql
-- Cache the extracted, interactive slide structure of a PowerPoint so it is
-- parsed once (server-side) and served instantly thereafter.
ALTER TABLE course_materials ADD COLUMN IF NOT EXISTS extracted JSONB;
