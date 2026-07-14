-- 022_material_conversion.sql
-- Phase 2: track PPT/PPTX/DOC/DOCX -> interactive-PDF conversion. The original
-- office file is never served to students; once converted, the secure viewer
-- serves the derived PDF from the private lecture-content bucket.
ALTER TABLE course_materials
    ADD COLUMN IF NOT EXISTS converted_pdf_path TEXT,
    ADD COLUMN IF NOT EXISTS converted_bucket   TEXT DEFAULT 'lecture-content',
    ADD COLUMN IF NOT EXISTS conversion_status  TEXT DEFAULT 'none'
        CHECK (conversion_status IN ('none', 'pending', 'converting', 'done', 'failed')),
    ADD COLUMN IF NOT EXISTS conversion_error   TEXT;
