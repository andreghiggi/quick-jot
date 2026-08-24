CREATE POLICY "Local printer script can read stations"
ON public.print_stations
FOR SELECT
TO anon
USING (true);