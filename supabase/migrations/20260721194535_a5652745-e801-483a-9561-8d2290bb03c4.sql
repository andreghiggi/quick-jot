
CREATE TABLE public.media_kit_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_kit_files TO authenticated;
GRANT ALL ON public.media_kit_files TO service_role;

ALTER TABLE public.media_kit_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read media kit"
  ON public.media_kit_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "super_admin insert media kit"
  ON public.media_kit_files FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super_admin update media kit"
  ON public.media_kit_files FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super_admin delete media kit"
  ON public.media_kit_files FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_media_kit_files_updated_at
  BEFORE UPDATE ON public.media_kit_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS policies for bucket "media-kit"
CREATE POLICY "media-kit: authenticated can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'media-kit');

CREATE POLICY "media-kit: super_admin can upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media-kit' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "media-kit: super_admin can update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media-kit' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "media-kit: super_admin can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'media-kit' AND public.has_role(auth.uid(), 'super_admin'));
