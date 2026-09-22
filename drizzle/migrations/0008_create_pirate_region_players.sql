CREATE TABLE public.pirate_region_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.pirate_regions(id) ON DELETE CASCADE,
  x INTEGER NOT NULL CHECK (x >= 1 AND x <= 100),
  y INTEGER NOT NULL CHECK (y >= 1 AND y <= 100),
  ikariam_username TEXT NOT NULL,
  username_key TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, x, y, username_key)
);

CREATE INDEX idx_region_players_region ON public.pirate_region_players(region_id);
CREATE INDEX idx_region_players_key ON public.pirate_region_players(username_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pirate_region_players TO authenticated;
GRANT ALL ON public.pirate_region_players TO service_role;

ALTER TABLE public.pirate_region_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "region players readable by authenticated"
  ON public.pirate_region_players FOR SELECT TO authenticated USING (true);

CREATE POLICY "managers insert region players"
  ON public.pirate_region_players FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));

CREATE POLICY "managers update region players"
  ON public.pirate_region_players FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));

CREATE POLICY "managers delete region players"
  ON public.pirate_region_players FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));

COMMENT ON TABLE public.pirate_player_assignments IS 'DEPRECATED: zamijenjeno tabelom public.pirate_region_players (player assignments su dio rejona).';
