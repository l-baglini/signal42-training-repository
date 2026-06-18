-- Traccia l'ultima volta che un utente è stato notificato
-- per evitare di rimandargli eventi già ricevuti
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;
