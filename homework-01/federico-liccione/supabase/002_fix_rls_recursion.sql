-- Fix infinite recursion in RLS policies.
-- Le policy admin leggevano profiles dentro una policy su profiles → loop.
-- Soluzione: funzione SECURITY DEFINER che bypassa RLS.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- profiles
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;

CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.get_my_role() = 'admin');

CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.get_my_role() = 'admin');

-- association_requests
DROP POLICY IF EXISTS "Admin can manage all association requests" ON public.association_requests;

CREATE POLICY "Admin can manage all association requests"
  ON public.association_requests FOR ALL
  USING (public.get_my_role() = 'admin');

-- submitted_events
DROP POLICY IF EXISTS "Admin can manage all submitted events" ON public.submitted_events;

CREATE POLICY "Admin can manage all submitted events"
  ON public.submitted_events FOR ALL
  USING (public.get_my_role() = 'admin');
