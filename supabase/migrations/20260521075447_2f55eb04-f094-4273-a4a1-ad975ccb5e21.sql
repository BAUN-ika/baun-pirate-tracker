
-- ============ ENUM ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'glavni_pirat', 'korisnik');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- security definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============ APP SETTINGS (BAUN passcode) ============
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  baun_passcode_hash TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- default passcode "BAUN2026" -> sha256 hex
INSERT INTO public.app_settings (id, baun_passcode_hash)
VALUES (1, encode(digest('BAUN2026', 'sha256'), 'hex'));

-- ============ IKARIAM ACCOUNTS ============
CREATE TABLE public.ikariam_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ikariam_username TEXT NOT NULL,
  current_pirate_points INT NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_collected_at TIMESTAMPTZ,
  collected_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, ikariam_username)
);
ALTER TABLE public.ikariam_accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.ikariam_accounts(owner_user_id);
CREATE INDEX ON public.ikariam_accounts(current_pirate_points DESC);

-- ============ HIGHSCORE SUBMISSIONS ============
CREATE TABLE public.highscore_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  raw_text TEXT NOT NULL,
  entries_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.highscore_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.highscore_submissions(period_start);

-- ============ HIGHSCORE ENTRIES ============
CREATE TABLE public.highscore_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.highscore_submissions(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  rank INT NOT NULL,
  ikariam_username TEXT NOT NULL,
  pirate_points INT NOT NULL,
  submitted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.highscore_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.highscore_entries(period_start, rank);
CREATE INDEX ON public.highscore_entries(period_start, ikariam_username);

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.audit_logs(created_at DESC);

-- ============ RLS POLICIES ============

-- profiles: svi authenticated mogu citati; samo admin update is_active
CREATE POLICY "auth read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "admin update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- user_roles: svi vide; samo admin mijenja
CREATE POLICY "auth read roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- app_settings: svi authenticated mogu citati (treba username samo); admin update
CREATE POLICY "auth read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ikariam_accounts: svi vide; vlasnik CRUD; admin/glavni_pirat update (za collect)
CREATE POLICY "auth read accounts" ON public.ikariam_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner insert account" ON public.ikariam_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "owner update account" ON public.ikariam_accounts FOR UPDATE TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY "pirat update account" ON public.ikariam_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'glavni_pirat'));
CREATE POLICY "owner delete account" ON public.ikariam_accounts FOR DELETE TO authenticated USING (auth.uid() = owner_user_id);
CREATE POLICY "admin delete account" ON public.ikariam_accounts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- highscore_submissions: svi citaju; svaki authenticated insert za sebe
CREATE POLICY "auth read submissions" ON public.highscore_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "self insert submission" ON public.highscore_submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by_user_id);

-- highscore_entries: svi citaju; insert za sebe
CREATE POLICY "auth read entries" ON public.highscore_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "self insert entry" ON public.highscore_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by_user_id);

-- audit_logs: svi citaju; insert kroz triggere / server functions (service role)
CREATE POLICY "auth read audit" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert audit" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ TRIGGERS: signup -> profile + role ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_count INT;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, username)
  VALUES (NEW.id, NEW.email, v_username)
  ON CONFLICT (id) DO NOTHING;

  -- prvi user = admin, ostali = korisnik
  SELECT COUNT(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'korisnik');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
