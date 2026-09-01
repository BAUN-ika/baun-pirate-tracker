-- 1. Alliance relations
CREATE TABLE public.alliance_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_tag TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('our_alliance','deal','protected')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX alliance_relations_tag_uniq ON public.alliance_relations (lower(btrim(alliance_tag)));
CREATE UNIQUE INDEX alliance_relations_one_our ON public.alliance_relations ((relation_type)) WHERE relation_type = 'our_alliance';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alliance_relations TO authenticated;
GRANT ALL ON public.alliance_relations TO service_role;
ALTER TABLE public.alliance_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read alliance relations" ON public.alliance_relations FOR SELECT TO authenticated USING (true);
CREATE POLICY "pirat insert alliance relations" ON public.alliance_relations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat'));
CREATE POLICY "pirat update alliance relations" ON public.alliance_relations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat'));
CREATE POLICY "pirat delete alliance relations" ON public.alliance_relations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat'));

-- 2. Assignment fields on ikariam_accounts
ALTER TABLE public.ikariam_accounts
  ADD COLUMN assignment_status TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN assigned_pirate_name TEXT,
  ADD COLUMN assigned_by_user_id UUID,
  ADD COLUMN assignment_started_at TIMESTAMPTZ;

-- 3. Highscore target status layer
CREATE TABLE public.highscore_target_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  rank INTEGER,
  ikariam_username TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','en_route','collected')),
  assigned_pirate_name TEXT,
  assigned_by_user_id UUID,
  started_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  collected_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX highscore_target_status_uniq
  ON public.highscore_target_status (period_start, lower(btrim(ikariam_username)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.highscore_target_status TO authenticated;
GRANT ALL ON public.highscore_target_status TO service_role;
ALTER TABLE public.highscore_target_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read hs target status" ON public.highscore_target_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert hs target status" ON public.highscore_target_status FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update hs target status" ON public.highscore_target_status FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- 4. Cluster status layer
CREATE TABLE public.pirate_cluster_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  radius INTEGER NOT NULL,
  cluster_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','en_route','collected')),
  assigned_pirate_name TEXT,
  assigned_by_user_id UUID,
  started_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  collected_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pirate_cluster_status_uniq
  ON public.pirate_cluster_status (period_start, radius, cluster_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pirate_cluster_status TO authenticated;
GRANT ALL ON public.pirate_cluster_status TO service_role;
ALTER TABLE public.pirate_cluster_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cluster status" ON public.pirate_cluster_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert cluster status" ON public.pirate_cluster_status FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update cluster status" ON public.pirate_cluster_status FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
