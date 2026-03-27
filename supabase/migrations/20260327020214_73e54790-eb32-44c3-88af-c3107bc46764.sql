ALTER TABLE public.optional_group_products 
ADD COLUMN min_select_override integer DEFAULT NULL,
ADD COLUMN max_select_override integer DEFAULT NULL;