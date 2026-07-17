-- §5 Fase 3: anteprima PDF (thumbnail immagine della prima pagina, generata
-- client-side con pdf.js e caricata su Storage) + cattura delle menzioni.
alter table public.forum_media add column if not exists anteprima_url text;
-- id degli utenti menzionati nel testo (per future notifiche FCM; additivo,
-- nessuna consegna ora).
alter table public.forum_post add column if not exists menzioni uuid[] not null default '{}';
