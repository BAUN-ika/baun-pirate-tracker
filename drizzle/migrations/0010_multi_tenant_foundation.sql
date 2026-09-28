-- ============ Multi-tenant foundation ============
CREATE TABLE public.worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code text,
  country_name text,
  flag_emoji text,
  timezone text NOT NULL DEFAULT 'Europe/Sarajevo',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE TABLE public.alliances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name text NOT NULL,
  tag text NOT NULL,
  passcode_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE UNIQUE INDEX alliances_world_tag_uniq ON public.alliances (world_id, lower(btrim(tag)));
CREATE TABLE public.user_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  alliance_id uuid NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (user_id, alliance_id)
);
CREATE TABLE public.system_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_active_context (
  user_id uuid PRIMARY KEY,
  world_id uuid REFERENCES public.worlds(id) ON DELETE SET NULL,
  alliance_id uuid REFERENCES public.alliances(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.alliance_visibility_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  alliance_id uuid NOT NULL UNIQUE REFERENCES public.alliances(id) ON DELETE CASCADE,
  can_view_global_highscore boolean NOT NULL DEFAULT false,
  can_view_global_clusters boolean NOT NULL DEFAULT false,
  can_view_global_nearest_points boolean NOT NULL DEFAULT false,
  can_view_global_map boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_visibility_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_view_global_highscore boolean,
  can_view_global_clusters boolean,
  can_view_global_nearest_points boolean,
  can_view_global_map boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, user_id)
);

GRANT SELECT ON public.worlds, public.user_memberships, public.system_admins,
  public.alliance_visibility_permissions, public.user_visibility_permissions TO authenticated;
GRANT SELECT (id, world_id, name, tag, is_active, created_at) ON public.alliances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_active_context TO authenticated;
GRANT ALL ON public.worlds, public.alliances, public.user_memberships, public.system_admins,
  public.user_active_context, public.alliance_visibility_permissions, public.user_visibility_permissions TO service_role;

ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_active_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_visibility_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_visibility_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_system_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.system_admins WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_alliance_member(_user_id uuid, _alliance_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_memberships
                  WHERE user_id = _user_id AND alliance_id = _alliance_id AND is_active)
$$;

CREATE OR REPLACE FUNCTION public.current_alliance_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT c.alliance_id FROM public.user_active_context c
       JOIN public.alliances al ON al.id = c.alliance_id
      WHERE c.user_id = auth.uid()
        AND (public.is_system_admin(auth.uid())
             OR (al.is_active AND public.is_alliance_member(auth.uid(), c.alliance_id)))),
    (SELECT m.alliance_id FROM public.user_memberships m
       JOIN public.alliances al ON al.id = m.alliance_id AND al.is_active
      WHERE m.user_id = auth.uid() AND m.is_active
      ORDER BY m.created_at LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_world_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT world_id FROM public.alliances WHERE id = public.current_alliance_id()
$$;

INSERT INTO public.worlds (id, name, country_code, country_name, flag_emoji)
VALUES ('a0000000-0000-4000-8000-000000000001', 'Nereus', 'GB', 'United Kingdom', '🇬🇧');
INSERT INTO public.alliances (id, world_id, name, tag, passcode_hash)
SELECT 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
       'Balkan Union', 'BAUN', baun_passcode_hash FROM public.app_settings WHERE id = 1;
INSERT INTO public.alliance_visibility_permissions (world_id, alliance_id)
VALUES ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');
INSERT INTO public.user_memberships (user_id, world_id, alliance_id)
SELECT id, 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001' FROM public.profiles;
INSERT INTO public.system_admins (user_id)
SELECT id FROM public.profiles WHERE lower(username) = 'bigdataspecialist';
COMMENT ON TABLE public.app_settings IS 'DEPRECATED: passcode moved to alliances.passcode_hash';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ikariam_accounts','highscore_submissions','highscore_entries','highscore_target_status',
    'pirate_target_status','pirate_cluster_status','pirate_collection_events','pirate_missions','pirate_regions',
    'pirate_region_items','pirate_region_players','pirate_player_assignments','alliance_relations','player_relations',
    'audit_logs','pirate_rounds','user_roles']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN world_id uuid REFERENCES public.worlds(id)', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN alliance_id uuid REFERENCES public.alliances(id) ON DELETE CASCADE', t);
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
    EXECUTE format('UPDATE public.%I SET world_id = %L, alliance_id = %L', t,
      'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001');
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
    EXECUTE format('CREATE INDEX %I ON public.%I (alliance_id)', t || '_alliance_idx', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.has_alliance_role(_user_id uuid, _alliance_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r
                   JOIN public.user_memberships m ON m.user_id = r.user_id AND m.alliance_id = r.alliance_id AND m.is_active
                  WHERE r.user_id = _user_id AND r.alliance_id = _alliance_id AND r.role = _role)
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.alliance_id IS NULL THEN
    NEW.alliance_id := public.current_alliance_id();
  END IF;
  IF NEW.alliance_id IS NOT NULL THEN
    SELECT world_id INTO NEW.world_id FROM public.alliances WHERE id = NEW.alliance_id;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ikariam_accounts','highscore_submissions','highscore_entries','highscore_target_status',
    'pirate_target_status','pirate_cluster_status','pirate_collection_events','pirate_missions','pirate_regions',
    'pirate_region_items','pirate_region_players','pirate_player_assignments','alliance_relations','player_relations',
    'audit_logs','pirate_rounds','user_roles']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_0_tenant BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_ids()', t);
    EXECUTE format('CREATE POLICY "tenant scope" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (alliance_id = public.current_alliance_id()) WITH CHECK (alliance_id = public.current_alliance_id())', t);
  END LOOP;
END $$;

ALTER TABLE public.ikariam_accounts DROP CONSTRAINT ikariam_accounts_owner_user_id_ikariam_username_key;
ALTER TABLE public.ikariam_accounts ADD CONSTRAINT ikariam_accounts_alliance_owner_username_key UNIQUE (alliance_id, owner_user_id, ikariam_username);
ALTER TABLE public.player_relations DROP CONSTRAINT player_relations_username_key_key;
ALTER TABLE public.player_relations ADD CONSTRAINT player_relations_alliance_username_key UNIQUE (alliance_id, username_key);
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_user_id_role_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_alliance_role_key UNIQUE (user_id, alliance_id, role);
DROP INDEX public.alliance_relations_tag_uniq;
CREATE UNIQUE INDEX alliance_relations_tag_uniq ON public.alliance_relations (alliance_id, lower(btrim(alliance_tag)));
DROP INDEX public.alliance_relations_one_our;
CREATE UNIQUE INDEX alliance_relations_one_our ON public.alliance_relations (alliance_id, relation_type) WHERE relation_type = 'our_alliance';
DROP INDEX public.highscore_target_status_uniq;
CREATE UNIQUE INDEX highscore_target_status_uniq ON public.highscore_target_status (alliance_id, period_start, lower(btrim(ikariam_username)));
DROP INDEX public.pirate_cluster_status_uniq;
CREATE UNIQUE INDEX pirate_cluster_status_uniq ON public.pirate_cluster_status (alliance_id, period_start, radius, cluster_key);
DROP INDEX public.one_active_round;
CREATE UNIQUE INDEX one_active_round ON public.pirate_rounds (alliance_id, status) WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (auth.uid() IS NOT NULL AND _user_id = auth.uid() AND _role = 'admin' AND public.is_system_admin(_user_id))
    OR EXISTS (
      SELECT 1 FROM public.user_roles r
       WHERE r.user_id = _user_id AND r.role = _role
         AND (auth.uid() IS NULL OR r.alliance_id = public.current_alliance_id())
    )
$$;

CREATE POLICY "read worlds" ON public.worlds FOR SELECT TO authenticated
  USING (public.is_system_admin(auth.uid())
         OR EXISTS (SELECT 1 FROM public.user_memberships m WHERE m.user_id = auth.uid() AND m.world_id = worlds.id AND m.is_active));
CREATE POLICY "read alliances" ON public.alliances FOR SELECT TO authenticated
  USING (public.is_system_admin(auth.uid()) OR public.is_alliance_member(auth.uid(), id));
CREATE POLICY "read memberships" ON public.user_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_system_admin(auth.uid()) OR alliance_id = public.current_alliance_id());
CREATE POLICY "read own sysadmin" ON public.system_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "own context" ON public.user_active_context FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "read alliance visibility" ON public.alliance_visibility_permissions FOR SELECT TO authenticated
  USING (public.is_system_admin(auth.uid()) OR alliance_id = public.current_alliance_id());
CREATE POLICY "read user visibility" ON public.user_visibility_permissions FOR SELECT TO authenticated
  USING (public.is_system_admin(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "tenant scope" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (id = auth.uid() OR public.is_system_admin(auth.uid()) OR public.is_alliance_member(id, public.current_alliance_id()));

CREATE OR REPLACE FUNCTION public.active_pirate_round_id_for(_alliance_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.pirate_rounds WHERE status = 'active' AND alliance_id = _alliance_id
  ORDER BY starts_at DESC LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.active_pirate_round_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.active_pirate_round_id_for(public.current_alliance_id())
$$;
CREATE OR REPLACE FUNCTION public.set_pirate_round_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pirate_round_id IS NULL THEN
    NEW.pirate_round_id := public.active_pirate_round_id_for(COALESCE(NEW.alliance_id, public.current_alliance_id()));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.complete_due_pirate_rounds()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  r RECORD; new_id UUID; acc_count INTEGER := 0; st_count INTEGER := 0; ev_count INTEGER := 0;
  processed INTEGER := 0; next_end TIMESTAMPTZ;
BEGIN
  FOR r IN SELECT * FROM public.pirate_rounds WHERE status = 'active' AND ends_at <= now() FOR UPDATE SKIP LOCKED
  LOOP
    WITH upd AS (
      UPDATE public.ikariam_accounts
         SET current_pirate_points = 0, last_updated_at = now(), points_source = 'round_reset',
             points_authoritative_at = now(), assignment_status = 'ready', assigned_pirate_name = NULL,
             assigned_by_user_id = NULL, assignment_started_at = NULL
       WHERE alliance_id = r.alliance_id
       RETURNING 1
    ) SELECT count(*) INTO acc_count FROM upd;

    WITH upd2 AS (
      UPDATE public.pirate_target_status
         SET status = 'ready', assigned_pirate_name = NULL, assigned_by_user_id = NULL, started_at = NULL, updated_at = now()
       WHERE pirate_round_id = r.id AND status = 'en_route'
       RETURNING 1
    ) SELECT count(*) INTO st_count FROM upd2;

    UPDATE public.pirate_cluster_status
       SET status = 'ready', assigned_pirate_name = NULL, assigned_by_user_id = NULL, started_at = NULL, updated_at = now()
     WHERE pirate_round_id = r.id AND status = 'en_route';

    SELECT count(*) INTO ev_count FROM public.pirate_collection_events WHERE pirate_round_id = r.id;

    UPDATE public.pirate_rounds SET status = 'completed', completed_at = now() WHERE id = r.id;

    next_end := r.ends_at + INTERVAL '21 days';
    WHILE next_end <= now() LOOP next_end := next_end + INTERVAL '21 days'; END LOOP;

    INSERT INTO public.pirate_rounds (starts_at, ends_at, status, alliance_id, world_id)
    VALUES (r.ends_at, next_end, 'active', r.alliance_id, r.world_id) RETURNING id INTO new_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, alliance_id, world_id)
    VALUES (NULL, 'automatic_pirate_round_reset', 'pirate_round', new_id::text,
            jsonb_build_object('previous_round_id', r.id, 'new_round_id', new_id, 'reset_at', now(),
                               'accounts_reset_count', acc_count, 'statuses_reset_count', st_count,
                               'collection_events_archived_count', ev_count),
            r.alliance_id, r.world_id);
    processed := processed + 1;
  END LOOP;
  RETURN processed;
END; $function$;

CREATE OR REPLACE FUNCTION public.complete_due_pirate_missions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE m RECORD; cnt INTEGER := 0;
BEGIN
  FOR m IN
    SELECT id, ikariam_account_id, user_id, reward_points, mission_type, alliance_id
      FROM public.pirate_missions
     WHERE status = 'pending' AND completes_at <= now()
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.ikariam_accounts
       SET current_pirate_points = current_pirate_points + m.reward_points, last_updated_at = now(),
           points_source = 'mission', points_authoritative_at = now()
     WHERE id = m.ikariam_account_id;
    UPDATE public.pirate_missions SET status = 'completed', completed_at = now() WHERE id = m.id;
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, alliance_id)
    VALUES (m.user_id, 'mission_completed', 'pirate_mission', m.id::text,
            jsonb_build_object('mission_type', m.mission_type, 'reward_points', m.reward_points,
                               'account_id', m.ikariam_account_id), m.alliance_id);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END; $function$;

CREATE OR REPLACE FUNCTION public.reset_collected_on_account_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
       AND alliance_id IS NOT DISTINCT FROM NEW.alliance_id
       AND status = 'collected'
       AND (collected_at IS NULL OR collected_at <= NEW.last_updated_at);
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.reset_collected_on_highscore_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF COALESCE(NEW.pirate_points,0) <= 0 THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.ikariam_accounts a
              WHERE lower(trim(a.ikariam_username)) = lower(trim(NEW.ikariam_username))
                AND a.alliance_id IS NOT DISTINCT FROM NEW.alliance_id) THEN
    RETURN NEW;
  END IF;
  UPDATE public.pirate_target_status
     SET status = 'ready', assigned_pirate_name = NULL, assigned_by_user_id = NULL,
         started_at = NULL, collected_at = NULL, collected_by_user_id = NULL,
         collected_points = NULL, updated_at = now()
   WHERE username_key = lower(trim(NEW.ikariam_username))
     AND alliance_id IS NOT DISTINCT FROM NEW.alliance_id
     AND status = 'collected'
     AND collected_at < NEW.period_start;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_username TEXT; v_alliance UUID; v_world UUID; v_count INT;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  INSERT INTO public.profiles (id, email, username) VALUES (NEW.id, NEW.email, v_username)
  ON CONFLICT (id) DO NOTHING;

  v_alliance := NULLIF(NEW.raw_user_meta_data->>'alliance_id', '')::uuid;
  IF v_alliance IS NULL THEN RETURN NEW; END IF;
  SELECT world_id INTO v_world FROM public.alliances WHERE id = v_alliance;
  IF v_world IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.user_memberships (user_id, world_id, alliance_id)
  VALUES (NEW.id, v_world, v_alliance) ON CONFLICT (user_id, alliance_id) DO NOTHING;

  SELECT COUNT(*) INTO v_count FROM public.user_roles WHERE alliance_id = v_alliance;
  INSERT INTO public.user_roles (user_id, role, alliance_id, world_id)
  VALUES (NEW.id, CASE WHEN v_count = 0 THEN 'admin'::app_role ELSE 'korisnik'::app_role END, v_alliance, v_world);
  RETURN NEW;
END; $function$;
