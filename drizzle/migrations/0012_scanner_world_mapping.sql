ALTER TABLE public.worlds ADD COLUMN server_number integer, ADD COLUMN server_region text;
ALTER TABLE public.worlds ADD CONSTRAINT worlds_server_number_valid CHECK (server_number IS NULL OR server_number BETWEEN 1 AND 9999), ADD CONSTRAINT worlds_server_region_valid CHECK (server_region IS NULL OR server_region ~ '^[a-z]{2,8}$');
CREATE UNIQUE INDEX worlds_ikariam_server_unique ON public.worlds (server_number, server_region) WHERE server_number IS NOT NULL AND server_region IS NOT NULL;
ALTER TABLE public.highscore_submissions ADD COLUMN scanner_request_id uuid, ADD COLUMN scanner_result jsonb;
CREATE UNIQUE INDEX highscore_scanner_request_unique ON public.highscore_submissions (scanner_request_id) WHERE scanner_request_id IS NOT NULL;
COMMENT ON COLUMN public.highscore_submissions.scanner_request_id IS 'Idempotency key for automatic scanner imports; not used by manual imports';