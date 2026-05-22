
-- 1. fortress_coordinates on ikariam_accounts
ALTER TABLE public.ikariam_accounts
  ADD COLUMN IF NOT EXISTS fortress_coordinates TEXT;

-- Validation trigger (CHECK on regex would also work but trigger keeps it flexible)
CREATE OR REPLACE FUNCTION public.validate_fortress_coords()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parts TEXT[];
  a INT;
  b INT;
BEGIN
  IF NEW.fortress_coordinates IS NULL OR NEW.fortress_coordinates = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.fortress_coordinates !~ '^[0-9]{1,2}:[0-9]{1,2}$' THEN
    RAISE EXCEPTION 'Neispravan format koordinata. Očekivano N:N (1-99).';
  END IF;
  parts := string_to_array(NEW.fortress_coordinates, ':');
  a := parts[1]::int;
  b := parts[2]::int;
  IF a < 1 OR a > 99 OR b < 1 OR b > 99 THEN
    RAISE EXCEPTION 'Koordinate moraju biti između 1 i 99.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_fortress_coords ON public.ikariam_accounts;
CREATE TRIGGER trg_validate_fortress_coords
BEFORE INSERT OR UPDATE OF fortress_coordinates ON public.ikariam_accounts
FOR EACH ROW EXECUTE FUNCTION public.validate_fortress_coords();

-- 2. pirate_missions table
DO $$ BEGIN
  CREATE TYPE public.mission_type AS ENUM ('mission_8h', 'mission_16h');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mission_status AS ENUM ('pending', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pirate_missions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ikariam_account_id UUID NOT NULL REFERENCES public.ikariam_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  mission_type public.mission_type NOT NULL,
  reward_points INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completes_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status public.mission_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pirate_missions_account ON public.pirate_missions(ikariam_account_id);
CREATE INDEX IF NOT EXISTS idx_pirate_missions_pending ON public.pirate_missions(status, completes_at) WHERE status = 'pending';

ALTER TABLE public.pirate_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read missions" ON public.pirate_missions FOR SELECT TO authenticated USING (true);

CREATE POLICY "owner insert mission" ON public.pirate_missions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.ikariam_accounts a
      WHERE a.id = ikariam_account_id AND a.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "owner cancel mission" ON public.pirate_missions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (status IN ('pending', 'cancelled'));

CREATE POLICY "admin manage mission" ON public.pirate_missions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Atomic completion function
CREATE OR REPLACE FUNCTION public.complete_due_pirate_missions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  cnt INTEGER := 0;
BEGIN
  FOR m IN
    SELECT id, ikariam_account_id, user_id, reward_points, mission_type
    FROM public.pirate_missions
    WHERE status = 'pending' AND completes_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ikariam_accounts
       SET current_pirate_points = current_pirate_points + m.reward_points,
           last_updated_at = now()
     WHERE id = m.ikariam_account_id;

    UPDATE public.pirate_missions
       SET status = 'completed', completed_at = now()
     WHERE id = m.id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (m.user_id, 'mission_completed', 'pirate_mission', m.id::text,
            jsonb_build_object('mission_type', m.mission_type, 'reward_points', m.reward_points,
                               'account_id', m.ikariam_account_id));

    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_due_pirate_missions() TO authenticated;
