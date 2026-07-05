-- Allow a campus to be deleted without being blocked by its classrooms.
-- classrooms.campus_id was NOT NULL with an ON DELETE NO ACTION foreign key,
-- so deleting a campus always failed. Make it nullable and switch the FK to
-- ON DELETE SET NULL: deleting a campus unlinks its classrooms (kept, with
-- campus_id set to NULL) instead of being blocked.

ALTER TABLE public.classrooms ALTER COLUMN campus_id DROP NOT NULL;

ALTER TABLE public.classrooms DROP CONSTRAINT classrooms_campus_id_fkey;

ALTER TABLE public.classrooms
  ADD CONSTRAINT classrooms_campus_id_fkey
  FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE SET NULL;
