ALTER TABLE public.optional_group_items
  ADD COLUMN IF NOT EXISTS section text;

CREATE INDEX IF NOT EXISTS idx_optional_group_items_group_section
  ON public.optional_group_items (group_id, section);