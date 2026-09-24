CREATE OR REPLACE FUNCTION public.reset_collected_on_account_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.points_source <> 'collected'
     AND COALESCE(NEW.current_pirate_points,0) > 0
     AND (NEW.current_pirate_points IS DISTINCT FROM OLD.current_pirate_points
          OR NEW.points_source IS DISTINCT FROM OLD.points_source
          OR NEW.last_updated_at IS DISTINCT FROM OLD.last_updated_at) THEN
    UPDATE public.pirate_target_status
       SET status = 'ready', assigned_pirate_name = NULL, assigned_by_user_id = NULL,
           started_at = NULL, collected_at = NULL, collected_by_user_id = NULL,
           collected_points = NULL, updated_at = now()
     WHERE username_key = lower(trim(NEW.ikariam_username))
       AND status = 'collected'
       AND (collected_at IS NULL OR collected_at <= NEW.last_updated_at);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reset_collected_on_account_points ON public.ikariam_accounts;
CREATE TRIGGER trg_reset_collected_on_account_points
AFTER UPDATE ON public.ikariam_accounts
FOR EACH ROW EXECUTE FUNCTION public.reset_collected_on_account_points();

-- Highscore mete bez BAUN naloga: nova lista vraća metu u READY
-- samo ako je pokupljena PRIJE granice 18:00 te liste (inače se vjeruje pokupljanju).
CREATE OR REPLACE FUNCTION public.reset_collected_on_highscore_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(NEW.pirate_points,0) <= 0 THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.ikariam_accounts a
              WHERE lower(trim(a.ikariam_username)) = lower(trim(NEW.ikariam_username))) THEN
    RETURN NEW; -- savezni nalozi se rješavaju kroz sync poena naloga
  END IF;
  UPDATE public.pirate_target_status
     SET status = 'ready', assigned_pirate_name = NULL, assigned_by_user_id = NULL,
         started_at = NULL, collected_at = NULL, collected_by_user_id = NULL,
         collected_points = NULL, updated_at = now()
   WHERE username_key = lower(trim(NEW.ikariam_username))
     AND status = 'collected'
     AND collected_at < NEW.period_start;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reset_collected_on_highscore_entry ON public.highscore_entries;
CREATE TRIGGER trg_reset_collected_on_highscore_entry
AFTER INSERT ON public.highscore_entries
FOR EACH ROW EXECUTE FUNCTION public.reset_collected_on_highscore_entry();