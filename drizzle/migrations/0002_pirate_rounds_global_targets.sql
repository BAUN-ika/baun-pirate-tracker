-- ============ PIRATE ROUNDS ============
CREATE TABLE public.pirate_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE ON public.pirate_rounds TO authenticated;
GRANT ALL ON public.pirate_rounds TO service_role;
ALTER TABLE public.pirate_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read rounds" ON public.pirate_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert rounds" ON public.pirate_rounds FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin update rounds" ON public.pirate_rounds FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE UNIQUE INDEX one_active_round ON public.pirate_rounds (status) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.active_pirate_round_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.pirate_rounds WHERE status = 'active' ORDER BY starts_at DESC LIMIT 1
$$;

-- ============ PLAYER RELATIONS ============
CREATE TABLE public.player_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ikariam_username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  relation_type TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_relations TO authenticated;
GRANT ALL ON public.player_relations TO service_role;
ALTER TABLE public.player_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read player relations" ON public.player_relations FOR SELECT TO authenticated USING (true);
CREATE POLICY "pirat insert player relations" ON public.player_relations FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'glavni_pirat'::app_role));
CREATE POLICY "pirat update player relations" ON public.player_relations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'glavni_pirat'::app_role));
CREATE POLICY "pirat delete player relations" ON public.player_relations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'glavni_pirat'::app_role));

-- ============ GLOBAL TARGET STATUS ============
CREATE TABLE public.pirate_target_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pirate_round_id UUID,
  username_key TEXT NOT NULL,
  ikariam_username TEXT NOT NULL,
  coordinates TEXT,
  alliance_tag TEXT,
  rank INTEGER,
  status TEXT NOT NULL DEFAULT 'ready',
  assigned_pirate_name TEXT,
  assigned_by_user_id UUID,
  started_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  collected_by_user_id UUID,
  collected_points INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pirate_target_status TO authenticated;
GRANT ALL ON public.pirate_target_status TO service_role;
ALTER TABLE public.pirate_target_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read target status" ON public.pirate_target_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert target status" ON public.pirate_target_status FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update target status" ON public.pirate_target_status FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- ============ COLLECTION EVENTS ============
CREATE TABLE public.pirate_collection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pirate_round_id UUID,
  collected_by_name TEXT NOT NULL,
  collected_by_user_id UUID,
  target_username TEXT NOT NULL,
  target_coordinates TEXT,
  target_alliance TEXT,
  pirate_points_collected INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pirate_collection_events TO authenticated;
GRANT ALL ON public.pirate_collection_events TO service_role;
ALTER TABLE public.pirate_collection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read collection events" ON public.pirate_collection_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert collection events" ON public.pirate_collection_events FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_collection_events_round ON public.pirate_collection_events (pirate_round_id, collected_at DESC);

-- ============ ROUND TAGGING ON EXISTING TABLES ============
ALTER TABLE public.highscore_submissions ADD COLUMN IF NOT EXISTS pirate_round_id UUID;
ALTER TABLE public.highscore_entries ADD COLUMN IF NOT EXISTS pirate_round_id UUID;
ALTER TABLE public.pirate_cluster_status ADD COLUMN IF NOT EXISTS pirate_round_id UUID;
ALTER TABLE public.highscore_target_status ADD COLUMN IF NOT EXISTS pirate_round_id UUID;

CREATE OR REPLACE FUNCTION public.set_pirate_round_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pirate_round_id IS NULL THEN
    NEW.pirate_round_id := public.active_pirate_round_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_round_id BEFORE INSERT ON public.highscore_submissions FOR EACH ROW EXECUTE FUNCTION public.set_pirate_round_id();
CREATE TRIGGER trg_round_id BEFORE INSERT ON public.highscore_entries FOR EACH ROW EXECUTE FUNCTION public.set_pirate_round_id();
CREATE TRIGGER trg_round_id BEFORE INSERT ON public.pirate_cluster_status FOR EACH ROW EXECUTE FUNCTION public.set_pirate_round_id();
CREATE TRIGGER trg_round_id BEFORE INSERT ON public.highscore_target_status FOR EACH ROW EXECUTE FUNCTION public.set_pirate_round_id();
CREATE TRIGGER trg_round_id BEFORE INSERT ON public.pirate_target_status FOR EACH ROW EXECUTE FUNCTION public.set_pirate_round_id();
CREATE TRIGGER trg_round_id BEFORE INSERT ON public.pirate_collection_events FOR EACH ROW EXECUTE FUNCTION public.set_pirate_round_id();

-- ============ AUTOMATIC ROUND RESET (idempotent) ============
CREATE OR REPLACE FUNCTION public.complete_due_pirate_rounds()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  new_id UUID;
  acc_count INTEGER := 0;
  st_count INTEGER := 0;
  ev_count INTEGER := 0;
  processed INTEGER := 0;
  next_end TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT * FROM public.pirate_rounds
     WHERE status = 'active' AND ends_at <= now()
     FOR UPDATE SKIP LOCKED
  LOOP
    -- A) reset alliance pirate points + assignments
    WITH upd AS (
      UPDATE public.ikariam_accounts
         SET current_pirate_points = 0,
             last_updated_at = now(),
             points_source = 'round_reset',
             points_authoritative_at = now(),
             assignment_status = 'ready',
             assigned_pirate_name = NULL,
             assigned_by_user_id = NULL,
             assignment_started_at = NULL
       RETURNING 1
    ) SELECT count(*) INTO acc_count FROM upd;

    -- B) close out active EN_ROUTE assignments of the finished round
    WITH upd2 AS (
      UPDATE public.pirate_target_status
         SET status = 'ready', assigned_pirate_name = NULL, assigned_by_user_id = NULL,
             started_at = NULL, updated_at = now()
       WHERE pirate_round_id = r.id AND status = 'en_route'
       RETURNING 1
    ) SELECT count(*) INTO st_count FROM upd2;

    UPDATE public.pirate_cluster_status
       SET status = 'ready', assigned_pirate_name = NULL, assigned_by_user_id = NULL,
           started_at = NULL, updated_at = now()
     WHERE pirate_round_id = r.id AND status = 'en_route';

    SELECT count(*) INTO ev_count FROM public.pirate_collection_events WHERE pirate_round_id = r.id;

    -- close round
    UPDATE public.pirate_rounds
       SET status = 'completed', completed_at = now()
     WHERE id = r.id;

    -- next round: exactly 21 days after previous ends_at, catching up if late
    next_end := r.ends_at + INTERVAL '21 days';
    WHILE next_end <= now() LOOP
      next_end := next_end + INTERVAL '21 days';
    END LOOP;

    INSERT INTO public.pirate_rounds (starts_at, ends_at, status)
    VALUES (r.ends_at, next_end, 'active')
    RETURNING id INTO new_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (NULL, 'automatic_pirate_round_reset', 'pirate_round', new_id::text,
            jsonb_build_object('previous_round_id', r.id, 'new_round_id', new_id,
                               'reset_at', now(), 'accounts_reset_count', acc_count,
                               'statuses_reset_count', st_count,
                               'collection_events_archived_count', ev_count));
    processed := processed + 1;
  END LOOP;
  RETURN processed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_due_pirate_rounds() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.active_pirate_round_id() TO authenticated, service_role;