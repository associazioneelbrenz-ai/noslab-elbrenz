-- Dashboard admin (app): lettura di tutte le domande di tesseramento e dei
-- pagamenti SOLO per admin (>=50) con 2FA verificato (AAL2). Additivo: le
-- policy self-read/self-write restano. Applicata via MCP.
drop policy if exists domande_tess_admin_read on public.domande_tesseramento;
create policy domande_tess_admin_read on public.domande_tesseramento
  for select to authenticated
  using ( public.has_ruolo_min(auth.uid(), 50) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' );

drop policy if exists pagamenti_tess_admin_read on public.pagamenti_tesseramento;
create policy pagamenti_tess_admin_read on public.pagamenti_tesseramento
  for select to authenticated
  using ( public.has_ruolo_min(auth.uid(), 50) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' );

grant select on public.domande_tesseramento to authenticated;
grant select on public.pagamenti_tesseramento to authenticated;
