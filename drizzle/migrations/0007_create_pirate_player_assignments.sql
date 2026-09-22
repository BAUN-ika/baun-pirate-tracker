CREATE TABLE public.pirate_player_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pirate_user_id uuid NOT NULL,
  ikariam_username text NOT NULL,
  username_key text NOT NULL,
  coordinates text,
  source text NOT NULL DEFAULT 'excel_import',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pirate_player_assignments_unique
  ON public.pirate_player_assignments (pirate_user_id, username_key, coalesce(coordinates, ''));
CREATE INDEX pirate_player_assignments_pirate_idx
  ON public.pirate_player_assignments (pirate_user_id);
CREATE INDEX pirate_player_assignments_key_idx
  ON public.pirate_player_assignments (username_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pirate_player_assignments TO authenticated;
GRANT ALL ON public.pirate_player_assignments TO service_role;

ALTER TABLE public.pirate_player_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read player assignments"
  ON public.pirate_player_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert player assignments"
  ON public.pirate_player_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));

CREATE POLICY "Managers can update player assignments"
  ON public.pirate_player_assignments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));

CREATE POLICY "Managers can delete player assignments"
  ON public.pirate_player_assignments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));