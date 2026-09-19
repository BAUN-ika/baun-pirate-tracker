-- alliance_relations
DROP POLICY IF EXISTS "pirat insert alliance relations" ON public.alliance_relations;
CREATE POLICY "pirat insert alliance relations" ON public.alliance_relations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat') OR public.has_role(auth.uid(),'pirat'));

DROP POLICY IF EXISTS "pirat update alliance relations" ON public.alliance_relations;
CREATE POLICY "pirat update alliance relations" ON public.alliance_relations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat') OR public.has_role(auth.uid(),'pirat'));

DROP POLICY IF EXISTS "pirat delete alliance relations" ON public.alliance_relations;
CREATE POLICY "pirat delete alliance relations" ON public.alliance_relations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat') OR public.has_role(auth.uid(),'pirat'));

-- player_relations
DROP POLICY IF EXISTS "pirat insert player relations" ON public.player_relations;
CREATE POLICY "pirat insert player relations" ON public.player_relations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat') OR public.has_role(auth.uid(),'pirat'));

DROP POLICY IF EXISTS "pirat update player relations" ON public.player_relations;
CREATE POLICY "pirat update player relations" ON public.player_relations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat') OR public.has_role(auth.uid(),'pirat'));

DROP POLICY IF EXISTS "pirat delete player relations" ON public.player_relations;
CREATE POLICY "pirat delete player relations" ON public.player_relations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat') OR public.has_role(auth.uid(),'pirat'));

-- ikariam_accounts
DROP POLICY IF EXISTS "pirat update account" ON public.ikariam_accounts;
CREATE POLICY "pirat update account" ON public.ikariam_accounts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'glavni_pirat') OR public.has_role(auth.uid(),'pirat') OR public.has_role(auth.uid(),'ide_na_plasman'));