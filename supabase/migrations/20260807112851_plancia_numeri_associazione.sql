-- LA PLANCIA · blocco 4, i numeri dell'Associazione (7/8/2026)
--
-- Qui i totali hanno senso, perche' servono a inquadrare cio' che e' emerso
-- sopra. Stanno in fondo apposta: sono belli da vedere ma non fanno agire
-- nessuno, e chi apre la pagina deve trovare per primo il lavoro.
--
-- Due cautele che vengono da errori gia' fatti:
--   - I SOCI DEL REGISTRO CARTACEO NON SONO MOROSI. Sono entrati con l'import
--     del 7 luglio e la loro posizione dice «da regolarizzare», che e' una nota
--     amministrativa e non un'accusa. La plancia lo scrive, perche' un numero
--     accanto a una parola sbagliata diventa un elenco di persone da chiamare.
--   - CIO' CHE NON C'E' SI DICHIARA. La prima nota non esiste ancora, quindi
--     uscite e saldi non sono calcolabili: si dice, non si mostra zero.
create or replace function public.plancia_numeri()
returns table (gruppo text, voce text, valore text, dettaglio text)
language plpgsql stable security definer set search_path = public as $$
declare v_anno int := extract(year from now())::int;
begin
  if not (has_ruolo_min(auth.uid(), 50) or has_ruolo(auth.uid(), 'gestione_associativa')) then
    return;
  end if;

  -- ---- SOCI ----------------------------------------------------------------
  return query
  select 'Soci'::text, 'Compagine sociale',
         (select count(*)::text from v_associati_istituzionale),
         format('%s entrati negli ultimi 30 giorni',
                (select count(*) from domande_tesseramento d
                  where d.stato='approvata' and d.numero_socio is not null
                    and d.approvata_il > now() - interval '30 days'));

  return query
  select 'Soci', 'In regola',
         (select count(*)::text from v_soci_in_regola where posizione in ('in_regola','in_regola_per_deroga')),
         'quota versata o in deroga';

  return query
  select 'Soci', 'Posizione parziale',
         (select count(*)::text from v_soci_in_regola where posizione='parziale'),
         'hanno versato una parte';

  return query
  select 'Soci', 'Da regolarizzare',
         (select count(*)::text from v_soci_in_regola where posizione='da_regolarizzare'),
         'sono i soci del registro cartaceo: NON sono morosi, manca solo il versamento a sistema';

  return query
  select 'Soci', 'Ammessi senza incasso',
         (select count(*)::text from v_soci_in_regola where posizione='ammesso_senza_incasso'),
         'approvati ma senza nessun pagamento registrato';

  -- ---- DENARO --------------------------------------------------------------
  -- Letto da v_incassi, che unisce le fonti senza duplicare righe: quote e
  -- integrazioni da pagamenti_tesseramento, anticipi dalle iscrizioni gita.
  -- Ogni euro ha una sola casa, e questa vista e' la casa comune.
  return query
  select 'Denaro', format('Quote e integrazioni %s', v_anno),
         (select coalesce(sum(importo), 0)::text || ' euro' from v_incassi
           where anno = v_anno and stato='completato' and tipo in ('quota','integrazione')),
         (select format('%s versamenti', count(*)) from v_incassi
           where anno = v_anno and stato='completato' and tipo in ('quota','integrazione'));

  return query
  select 'Denaro', format('Anticipi gita %s', v_anno),
         (select coalesce(sum(importo), 0)::text || ' euro' from v_incassi
           where anno = v_anno and stato='completato' and tipo='anticipo_gita'),
         (select format('%s iscrizioni', count(*)) from v_incassi
           where anno = v_anno and stato='completato' and tipo='anticipo_gita');

  return query
  select 'Denaro', 'Contanti da consegnare',
         (select coalesce(sum(importo), 0)::text || ' euro' from pagamenti_tesseramento
           where metodo='contanti' and stato='completato' and annullato_il is null
             and coalesce(consegnato_tesoriere,false)=false),
         'raccolti a mano e non ancora passati al tesoriere';

  -- Cio' che non c'e': si dichiara.
  return query
  select 'Denaro', 'Uscite e saldi', 'non ancora tracciati',
         'La prima nota non esiste ancora: uscite, saldo di cassa e saldo di conto non sono calcolabili. Il saldo al 31/12/2025 era 512,70 euro.';

  -- ---- CONTENUTI -----------------------------------------------------------
  -- Per ciascuno QUANDO E' STATO PUBBLICATO L'ULTIMO: un archivio che non cresce
  -- da tre settimane e' un'informazione, e il totale da solo non la dice.
  return query
  select 'Contenuti', 'Articoli', (select count(*)::text from articolo where stato='pubblicato'),
         (select coalesce('ultimo il ' || to_char(max(pubblicato_at), 'DD/MM/YYYY'), 'nessuno')
            from articolo where stato='pubblicato');

  return query
  select 'Contenuti', 'Lemmi del glossario', (select count(*)::text from dizionario_lemma where stato='pubblicato'),
         (select string_agg(parlata || ': ' || n, ' · ' order by n desc)
            from (select parlata, count(*) n from dizionario_lemma where stato='pubblicato' group by parlata) x);

  return query
  select 'Contenuti', 'Pezzi del Museo', (select count(*)::text from museo_gg_pezzo where stato='pubblicato'),
         (select coalesce('ultimo il ' || to_char(max(updated_at), 'DD/MM/YYYY'), 'nessuno')
            from museo_gg_pezzo where stato='pubblicato');

  return query
  select 'Contenuti', 'Storie', (select count(*)::text from storia where stato='pubblicata'),
         (select coalesce('ultima il ' || to_char(max(created_at), 'DD/MM/YYYY'), 'nessuna')
            from storia where stato='pubblicata');

  return query
  select 'Contenuti', 'Registrazioni audio', (select count(*)::text from archivio_audio),
         'le voci di chi parla il nos: e la cosa che manca di piu, e ha fretta';

  -- ---- CONTRIBUTI ----------------------------------------------------------
  -- SENZA CLASSIFICA, come stabilito: e' un elenco per sapere chi ringraziare,
  -- non per stabilire chi vale di piu'. Ordinato per nome, non per quantita'.
  return query
  select 'Contributi', 'Chi ha portato qualcosa (30 giorni)',
         (select count(distinct g.nome)::text
            from dizionario_lemma l join guardiani_contributori g on g.id = l.contributore_id
           where l.created_at > now() - interval '30 days'),
         (select string_agg(x.nome || ' (' || x.n || ')', ' · ' order by x.nome)
            from (select g.nome, count(*) n
                    from dizionario_lemma l join guardiani_contributori g on g.id = l.contributore_id
                   where l.created_at > now() - interval '30 days'
                   group by g.nome) x);
end;
$$;

grant execute on function public.plancia_numeri() to authenticated;;
