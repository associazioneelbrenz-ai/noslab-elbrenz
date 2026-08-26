-- Coda di ascolto (brief "La coda di ascolto", 26/8/2026 §6, verifica 2):
-- v_coda_ascolto aveva SELECT concesso anche ad anon (probabilmente per lo
-- stesso pattern "grant select to anon, authenticated" usato per le viste
-- pubbliche, applicato qui per errore — il brief dice esplicitamente
-- "grant select to authenticated", mai anon). Nella pratica anon riceveva
-- comunque un errore di permesso sulle tabelle di base (non un elenco
-- vuoto), ma il grant sulla vista era inutile e fuori dall'intento
-- dichiarato: tolto. Le due funzioni erano eseguibili da PUBLIC per
-- default di Postgres: innocuo perche' controllano has_ruolo_min() al loro
-- interno, ma fuori dal modello di irrigidimento gia' in uso nel resto del
-- progetto (revoca da anon/public, execute solo a chi serve). Allineato.
revoke select on public.v_coda_ascolto from anon;
revoke execute on function public.conferma_ascolto(uuid) from public;
revoke execute on function public.scarta_ascolto(uuid, text) from public;
grant execute on function public.conferma_ascolto(uuid) to authenticated;
grant execute on function public.scarta_ascolto(uuid, text) to authenticated;
