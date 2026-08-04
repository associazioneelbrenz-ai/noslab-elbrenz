-- 20260804034000 — la quota in un posto solo, e la regola giusta di «in regola»
--
-- GIA' APPLICATA in produzione. Qui si versiona.
--
-- Perche'. La vista diceva «in regola» quando esisteva un pagamento completato
-- qualunque. Sei soci hanno a sistema la sola integrazione da 10 euro, cioe'
-- meta' della quota, e risultavano a posto: la quota base da 10 versata prima
-- che salisse a 20 non e' registrata da nessuna parte. La regola giusta e' la
-- SOMMA degli incassi validi dell'anno contro la quota deliberata per
-- quell'anno.
--
-- E il numero 20 viveva in quattro file diversi. Finche' restano allineati non
-- si vede; il giorno che il Direttivo delibera 25, uno resta indietro e nessuno
-- se ne accorge finche' un socio non paga la cifra sbagliata.

insert into public.config_app (chiave, categoria, valore, descrizione)
values ('quota_sociale_per_anno', 'economia',
        '{"2025": 10, "2026": 20}'::jsonb,
        'Quota sociale deliberata, per anno. Fonte unica: la leggono la vista v_soci_in_regola e le edge. Aggiungere l''anno nuovo quando il Direttivo delibera, senza toccare il codice.')
on conflict (chiave) do update set valore = excluded.valore, descrizione = excluded.descrizione;

create or replace function public.quota_anno(p_anno int)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (valore ->> p_anno::text)::numeric
       from public.config_app where chiave = 'quota_sociale_per_anno'),
    20  -- rete: se la chiave sparisce non si spacca niente, si usa l'ultima nota
  );
$$;

comment on function public.quota_anno(int) is
 'Quota sociale deliberata per l''anno indicato, letta da config_app. Usarla ovunque serva il numero, invece di scriverlo.';

-- Tracciabilita' delle registrazioni manuali. Una data ricostruita DICHIARATA
-- e' un dato onesto; una data inventata e taciuta e' un falso. E un incasso non
-- si corregge: si annulla con motivo, perche' il RUNTS chiede di poter
-- ricostruire chi ha scritto cosa, e una riga riscritta cancella la storia.
alter table public.pagamenti_tesseramento
  add column if not exists data_ricostruita boolean not null default false,
  add column if not exists annullato_il timestamptz,
  add column if not exists annullato_da uuid,
  add column if not exists annullato_motivo text;

comment on column public.pagamenti_tesseramento.data_ricostruita is
 'true se incassato_il non e'' la data esatta ma una ricostruzione dichiarata (registro cartaceo, ricordo). Dichiararlo e'' onesto: inventarla e tacerlo no.';

-- Le viste: il testo applicato in produzione sta nelle migration MCP
-- «quota_anno_e_posizioni_soci» e «v_soci_distingue_annullata_da_respinta».
-- v_soci_in_regola distingue adesso anche «annullata» da «respinta»: la prima
-- vuol dire che quella riga non era una domanda, un doppione o un fantasma
-- nato da un pagamento; la seconda che qualcuno ha chiesto e gli e' stato detto
-- di no. Metterle nello stesso mucchio racconterebbe quattro rifiuti che non ci
-- sono mai stati.

-- [4/8/2026, dopo l'advisor] Le due funzioni risultavano chiamabili via
-- /rest/v1/rpc anche senza aver fatto l'accesso.
--
-- blocca_approvazione_senza_incasso() e' una funzione TRIGGER: chiamata come
-- RPC fallirebbe comunque, perche' fuori da un trigger non ha la riga su cui
-- lavorare. Ma esporla e' rumore in un elenco di sicurezza, e il rumore fa
-- passare inosservata la riga che conta.
--
-- quota_anno() legge un numero pubblico, la quota sta scritta sul sito. Ma
-- resta SECURITY DEFINER, cioe' gira con i permessi di chi l'ha creata: una
-- funzione cosi' si espone solo se serve, e qui non serve. La chiamano le
-- viste e le edge, che girano col service role.
--
-- ATTENZIONE alla riga su `public`: revocare da anon e authenticated NON basta,
-- perche' Postgres concede EXECUTE al ruolo PUBLIC per difetto e anon lo
-- eredita da li'. Senza quella riga la funzione resta chiamabile, e la
-- migration sembra fatta mentre non lo e'. L'ha detto la verifica
-- dall'esterno, non il codice.
revoke execute on function public.blocca_approvazione_senza_incasso() from anon, authenticated, public;
revoke execute on function public.quota_anno(int) from anon, authenticated, public;
