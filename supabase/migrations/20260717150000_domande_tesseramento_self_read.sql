-- Self-read della propria tessera per il socio autenticato (PWA elbrenz-community
-- + sito): mostra numero/anno/scadenza/codice+QR nel Profilo. Match sull'email
-- del JWT: nessun accesso alle righe altrui. La tabella resta deny-by-default
-- per il resto (scrittura solo service-role dagli edge). Additivo.
drop policy if exists domande_tess_self_read on public.domande_tesseramento;
create policy domande_tess_self_read on public.domande_tesseramento
  for select to authenticated
  using ( lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) );
