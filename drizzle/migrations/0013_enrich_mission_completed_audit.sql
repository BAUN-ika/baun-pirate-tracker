CREATE OR REPLACE FUNCTION public.complete_due_pirate_missions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE m RECORD; cnt INTEGER := 0; v_username TEXT; v_world_id UUID;
BEGIN
  FOR m IN
    SELECT id, ikariam_account_id, user_id, reward_points, mission_type, alliance_id
      FROM public.pirate_missions
     WHERE status = 'pending' AND completes_at <= now()
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT ikariam_username, world_id INTO v_username, v_world_id
      FROM public.ikariam_accounts WHERE id = m.ikariam_account_id;
    UPDATE public.ikariam_accounts
       SET current_pirate_points = current_pirate_points + m.reward_points, last_updated_at = now(),
           points_source = 'mission', points_authoritative_at = now()
     WHERE id = m.ikariam_account_id;
    UPDATE public.pirate_missions SET status = 'completed', completed_at = now() WHERE id = m.id;
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, alliance_id, world_id)
    VALUES (m.user_id, 'mission_completed', 'pirate_mission', m.id::text,
            jsonb_build_object('mission_type', m.mission_type, 'reward_points', m.reward_points,
                               'account_id', m.ikariam_account_id, 'ikariam_username', v_username,
                               'previous_status', 'pending', 'new_status', 'completed'),
            m.alliance_id, v_world_id);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END; $function$;