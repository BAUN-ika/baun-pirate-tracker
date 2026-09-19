CREATE TABLE public.pirate_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pirate_user_id UUID NOT NULL,
  name TEXT,
  color TEXT NOT NULL DEFAULT '#38bdf8',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pirate_region_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.pirate_regions(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'point',
  x_start INTEGER NOT NULL,
  x_end INTEGER NOT NULL,
  y_start INTEGER NOT NULL,
  y_end INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pirate_region_items_type_chk CHECK (item_type IN ('point','rectangle')),
  CONSTRAINT pirate_region_items_range_chk CHECK (
    x_start >= 1 AND x_end <= 100 AND y_start >= 1 AND y_end <= 100
    AND x_start <= x_end AND y_start <= y_end
  )
);

CREATE INDEX pirate_regions_pirate_idx ON public.pirate_regions(pirate_user_id);
CREATE INDEX pirate_region_items_region_idx ON public.pirate_region_items(region_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pirate_regions TO authenticated;
GRANT ALL ON public.pirate_regions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pirate_region_items TO authenticated;
GRANT ALL ON public.pirate_region_items TO service_role;

ALTER TABLE public.pirate_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pirate_region_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read regions" ON public.pirate_regions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage regions insert" ON public.pirate_regions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));
CREATE POLICY "manage regions update" ON public.pirate_regions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));
CREATE POLICY "manage regions delete" ON public.pirate_regions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));

CREATE POLICY "auth read region items" ON public.pirate_region_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage region items insert" ON public.pirate_region_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));
CREATE POLICY "manage region items update" ON public.pirate_region_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));
CREATE POLICY "manage region items delete" ON public.pirate_region_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));
