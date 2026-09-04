CREATE UNIQUE INDEX IF NOT EXISTS uniq_target_round_username
  ON public.pirate_target_status (pirate_round_id, username_key);