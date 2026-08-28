-- Brief "Il battito dei servizi" (28/8/2026 §3): sentinella-pagine e' l'unico
-- degli otto servizi registrati a essere una funzione SQL invocata da
-- pg_cron (select public.sentinella_pagine(true)), non una edge function.
-- registra_battito() e' SECURITY DEFINER senza controllo di ruolo interno
-- (solo GRANT/REVOKE): postgres, il ruolo con cui gira pg_cron, e' superuser
-- e scavalca comunque ogni privilegio, quindi la chiamata diretta funziona
-- senza bisogno del varco service_role usato dalle edge function.
--
-- Il battito si scrive solo sul giro vero (p_esegui=true, l'unico usato dal
-- cron): la modalita' p_esegui=false resta un collaudo, come per le altre
-- funzioni di questo registro.
create or replace function public.sentinella_pagine(p_esegui boolean default true)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  SITO constant text := 'https://elbrenz.eu';
  r record;
  v_req bigint;
  n_chiuse int := 0;
  n_aperte int := 0;
  n_rotte int := 0;
  n_senza_risposta int := 0;
  v_da_controllare jsonb := '[]'::jsonb;
  v jsonb;
begin
  for r in
    select s.id, resp.status_code
    from sentinella_pagina s
    join net._http_response resp on resp.id = s.richiesta_id
    where s.esito = 'in_volo'
  loop
    update sentinella_pagina
       set status_code = r.status_code,
           esito = case when r.status_code = 200 then 'ok' else 'rotta' end
     where id = r.id;
    n_chiuse := n_chiuse + 1;
    if r.status_code is distinct from 200 then n_rotte := n_rotte + 1; end if;
  end loop;

  update sentinella_pagina
     set esito = 'senza_risposta'
   where esito = 'in_volo' and controllato_il < now() - interval '10 minutes';
  get diagnostics n_senza_risposta = row_count;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_da_controllare from (
    (select 'lemma'::text as cosa, l.slug as slug,
            SITO || '/guardiani-de-la-lenga/' || l.slug as url
       from dizionario_lemma l
      where l.stato = 'pubblicato' and coalesce(l.slug, '') <> ''
      order by coalesce(l.validato_il, l.created_at) desc limit 1)
    union all
    (select 'museo'::text, p.slug, SITO || '/non-e-sole-grande-guerra/' || p.slug
       from museo_gg_pezzo p
      where p.stato = 'pubblicato' and coalesce(p.slug, '') <> ''
      order by p.created_at desc limit 1)
    union all
    (select 'articolo'::text, a.slug, SITO || '/articoli/' || a.slug
       from v_articoli_pubblici a
      where coalesce(a.slug, '') <> ''
      limit 1)
    union all
    (select 'evento'::text, e.slug, SITO || '/eventi/' || e.slug
       from eventi_esterni_pubblici e
      where coalesce(e.slug, '') <> ''
      limit 1)
    union all
    (select 'memoria'::text as cosa, rm.chiave as slug, SITO || rm.url as url
       from (
         with rotte_memoria as (
           select 'indice-'||mf.slug_breve as chiave, '/cimiteri-di-guerra' as url
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'fondo-'||mf.slug_breve, '/cimiteri-di-guerra/'||mf.slug_breve
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'mappa-'||mf.slug_breve, '/cimiteri-di-guerra/'||mf.slug_breve||'/mappa'
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'senza-nome-'||mf.slug_breve, '/cimiteri-di-guerra/'||mf.slug_breve||'/senza-nome'
             from memoria_fondo mf where mf.stato = 'pubblicato'
           union all
           select 'persona-'||mp.id::text, '/cimiteri-di-guerra/'||mf.slug_breve||'/'||mp.slug
             from memoria_persona mp join memoria_fondo mf on mf.id = mp.fondo_id
            where mf.stato = 'pubblicato' and mp.slug is not null
              and mp.nome_completo is not null and mp.nome_completo <> 'sconosciuto'
           union all
           select 'evento-'||e.slug, '/cimiteri-di-guerra/'||e.slug
             from v_memoria_evento_pubblico e
           union all
           select 'reparto-indice', '/cimiteri-di-guerra/reparto'
           union all
           select 'reparto-'||rg.reparto_slug, '/cimiteri-di-guerra/reparto/'||rg.reparto_slug
             from (
               select regexp_replace(lower(mp.reparto), '[^a-z0-9]+', '-', 'g') as reparto_slug, count(*) as n
                 from memoria_persona mp join memoria_fondo mf on mf.id = mp.fondo_id
                where mf.stato = 'pubblicato' and mp.reparto is not null
                  and mp.nome_completo is not null and mp.nome_completo <> 'sconosciuto'
                group by 1
             ) rg where rg.n >= 3
           union all
           select 'provenienza-indice', '/cimiteri-di-guerra/provenienza'
           union all
           select 'provenienza-'||pv.reg_slug, '/cimiteri-di-guerra/provenienza/'||pv.reg_slug
             from (
               select regexp_replace(lower(mp.regione_nascita), '[^a-z0-9]+', '-', 'g') as reg_slug, count(*) as n
                 from memoria_persona mp join memoria_fondo mf on mf.id = mp.fondo_id
                where mf.stato = 'pubblicato' and mp.regione_nascita is not null
                  and mp.nome_completo is not null and mp.nome_completo <> 'sconosciuto'
                group by 1
             ) pv where pv.n >= 3
         )
         select * from rotte_memoria order by random() limit 1
       ) rm)
  ) x;

  if not p_esegui then
    return format('giro a vuoto: chiuse %s, controllerei %s indirizzi',
                  n_chiuse, jsonb_array_length(v_da_controllare));
  end if;

  for v in select * from jsonb_array_elements(v_da_controllare) loop
    v_req := net.http_get(url := v ->> 'url', timeout_milliseconds := 15000);
    insert into sentinella_pagina (cosa, slug, url, richiesta_id)
    values (v ->> 'cosa', v ->> 'slug', v ->> 'url', v_req);
    n_aperte := n_aperte + 1;
  end loop;

  delete from sentinella_pagina where controllato_il < now() - interval '30 days';

  begin
    perform registra_battito('sentinella-pagine',
      case when n_rotte > 0 or n_senza_risposta > 0 then 'errore' else 'ok' end,
      jsonb_build_object('chiuse', n_chiuse, 'aperte', n_aperte, 'rotte', n_rotte, 'senza_risposta', n_senza_risposta));
  exception when others then null; -- il battito non deve mai rompere il lavoro
  end;

  return format('chiuse %s, chieste %s', n_chiuse, n_aperte);
end;
$function$;
