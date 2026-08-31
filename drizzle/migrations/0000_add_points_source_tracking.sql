ALTER TABLE public.ikariam_accounts
  ADD COLUMN IF NOT EXISTS points_source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS points_authoritative_at TIMESTAMPTZ;

UPDATE public.ikariam_accounts
   SET points_authoritative_at = COALESCE(points_authoritative_at, last_updated_at);

CREATE OR REPLACE FUNCTION public.complete_due_pirate_missions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           last_updated_at = now(),
           points_source = 'mission',
           points_authoritative_at = now()
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
$function$;