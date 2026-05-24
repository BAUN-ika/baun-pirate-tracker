
ALTER TABLE public.highscore_submissions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.highscore_entries
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS alliance_tag text,
  ADD COLUMN IF NOT EXISTS coordinates text,
  ADD COLUMN IF NOT EXISTS city_name text;
