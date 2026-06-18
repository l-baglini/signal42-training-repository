-- Permette agli utenti di creare la propria riga in profiles via upsert
-- (necessario quando il trigger on_auth_user_created non è ancora girato)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
