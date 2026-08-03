-- 20260803090000 — allineamento dello schema dei pagamenti
--
-- Queste quattro modifiche sono GIA' APPLICATE in produzione (3 agosto 2026,
-- via MCP, insieme al segretario). Qui si versionano soltanto: il repository
-- non le conosceva, e chi ricostruisse il database dalle migration avrebbe
-- ottenuto uno schema diverso da quello vivo.
--
-- Tutto e' scritto per essere RIESEGUIBILE senza danno: su produzione non
-- cambia niente, su un database nuovo produce lo stesso stato.
--
-- NOTA IMPORTANTE. Le correzioni ai DATI fatte la stessa mattina (due
-- pagamenti riclassificati, due domande fantasma annullate, il pagamento di
-- Corradini ricollegato) NON stanno qui e non ci devono stare: rieseguirle su
-- un database nuovo inventerebbe dati. Sono documentate in
-- docs/CHANGELOG_dati.md, che e' un registro, non uno script.

-- 1. sorgente_utm diventa jsonb come nelle altre quattro tabelle del funnel.
--    Era l'unica text, ed era proprio quella su cui si fanno i conti. La
--    conversione avviene a colonna vuota; il `case` serve solo a rendere la
--    migration onesta su un database che avesse gia' dei valori: una stringa
--    che non e' JSON diventa {"raw": "..."} invece di far fallire tutto.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pagamenti_tesseramento'
      and column_name = 'sorgente_utm' and data_type <> 'jsonb'
  ) then
    alter table public.pagamenti_tesseramento
      alter column sorgente_utm type jsonb
      using case
        when sorgente_utm is null or btrim(sorgente_utm) = '' then null
        else jsonb_build_object('raw', sorgente_utm)
      end;
  end if;
end $$;

comment on column public.pagamenti_tesseramento.sorgente_utm is
 'Provenienza della visita che ha generato il pagamento. Stessa forma jsonb delle altre tabelle del funnel.';

-- 2. Nuovo tipo di pagamento: l'anticipo di una gita non e' una quota
--    associativa. Prima non esisteva un modo di dirlo, e infatti i due
--    anticipi del 26 luglio e del 1 agosto erano finiti fra le quote 2026.
alter table public.pagamenti_tesseramento
  drop constraint if exists pagamenti_tesseramento_tipo_check;
alter table public.pagamenti_tesseramento
  add constraint pagamenti_tesseramento_tipo_check
  check (tipo = any (array['quota', 'donazione', 'integrazione', 'anticipo_gita']));

-- 3. Nuovo stato per le domande: annullata. Una riga nata per errore non e'
--    una domanda respinta, perche' non e' mai stata una domanda: chiamarla
--    respinta racconterebbe che qualcuno ha chiesto e gli e' stato detto di no.
alter table public.domande_tesseramento
  drop constraint if exists domande_tesseramento_stato_check;
alter table public.domande_tesseramento
  add constraint domande_tesseramento_stato_check
  check (stato = any (array['in_attesa', 'approvata', 'respinta', 'annullata']));

-- 4. Colonna presente in produzione ma mai versionata: la scrivono
--    contact-form e contanti-registra da luglio.
alter table public.domande_tesseramento
  add column if not exists sorgente_utm jsonb;

comment on column public.domande_tesseramento.sorgente_utm is
 'Provenienza della visita che ha generato la domanda. Sempre un oggetto, mai una stringa nuda.';
