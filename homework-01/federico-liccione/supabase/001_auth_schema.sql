-- ============================================================
-- AUTH SCHEMA — esegui questo script nel SQL Editor di Supabase
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'association', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Auto-crea il profilo al signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── notification_preferences ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  regions       TEXT[] NOT NULL DEFAULT '{}',
  event_types   TEXT[] NOT NULL DEFAULT '{}',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notification preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── association_requests ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.association_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_name        TEXT NOT NULL,
  org_website     TEXT,
  org_description TEXT NOT NULL,
  contact_email   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.association_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own association request"
  ON public.association_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create association request"
  ON public.association_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can manage all association requests"
  ON public.association_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── submitted_events ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submitted_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  event_type    TEXT NOT NULL
                  CHECK (event_type IN ('sciopero','manifestazione','corteo','presidio','altro')),
  tags          TEXT[] NOT NULL DEFAULT '{}',
  location_text TEXT,
  city          TEXT,
  region        TEXT,
  start_date    DATE,
  end_date      DATE,
  source_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.submitted_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Associations can create events"
  ON public.submitted_events FOR INSERT
  WITH CHECK (
    auth.uid() = submitted_by AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('association','admin'))
  );

CREATE POLICY "Users can view own submitted events"
  ON public.submitted_events FOR SELECT
  USING (auth.uid() = submitted_by);

CREATE POLICY "Admin can manage all submitted events"
  ON public.submitted_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Per impostare il primo admin ──────────────────────────────
-- Sostituisci l'email qui sotto e poi esegui:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'la-tua-email@esempio.it';
