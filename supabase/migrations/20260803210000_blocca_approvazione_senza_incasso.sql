-- 20260803210000 — nessuna tessera senza quota incassata, o senza una ragione scritta
--
-- GIA' APPLICATA in produzione nella notte fra il 3 e il 4 agosto 2026, via MCP,
-- e gia' collaudata li'. Qui si versiona soltanto: il repository non la
-- conosceva, e chi ricostruisse il database dalle migration si ritroverebbe
-- senza la protezione.
--
-- Perche' esiste. In tredici giorni l'Associazione ha emesso e spedito due
-- tessere a chi non aveva versato la quota, la 26 a Stefano Schwarz e la 29 a
-- Lorenzo Conci. Nessuno se n'e' accorto: la schermata di curatela prometteva
-- «verranno assegnati numero di tessera e QR» e non nominava il pagamento, e il
-- segretario ha fatto esattamente quello che gli veniva chiesto. L'errore non
-- e' stato suo, e' stato di un sistema che gli nascondeva l'unica informazione
-- che serviva per decidere.
--
-- Questo trigger e' un cerotto, non la cura: ferma il danno ma parla la lingua
-- del database, non quella di chi legge. La cura sta nell'interfaccia. Il
-- cerotto pero' NON si toglie nemmeno dopo: e' l'ultima rete se un domani
-- qualcuno arriva all'approvazione per una strada che non passa dalla pagina.
--
-- Nota su cosa NON e' un difetto: la domanda si salva PRIMA del pagamento, ed
-- e' giusto cosi'. Serve un id da mettere nel custom_id dell'ordine PayPal,
-- altrimenti gli incassi tornano orfani. Quella regola resta.

-- La deroga: approvare senza incasso si puo', ma va detto perche'. Non e'
-- burocrazia, e' la traccia che il RUNTS chiede per spiegare come mai un socio
-- risulta ammesso senza versamento a sistema.
alter table public.domande_tesseramento
  add column if not exists deroga_pagamento_motivo text;

comment on column public.domande_tesseramento.deroga_pagamento_motivo is
 'Se valorizzata, consente di approvare la domanda senza un pagamento incassato a database (contanti gia raccolti a mano, socio storico, socio onorario). Va sempre motivata: e la traccia che il RUNTS chiede.';

create or replace function public.blocca_approvazione_senza_incasso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pagamenti int;
begin
  -- Scatta solo sul PASSAGGIO a 'approvata': una domanda gia' approvata che
  -- viene aggiornata per altri motivi non deve trovarsi la strada sbarrata.
  if new.stato = 'approvata' and coalesce(old.stato,'') is distinct from 'approvata' then

    if new.deroga_pagamento_motivo is not null and btrim(new.deroga_pagamento_motivo) <> '' then
      return new;
    end if;

    select count(*) into v_pagamenti
    from public.pagamenti_tesseramento p
    where p.domanda_id = new.id
      and p.stato = 'completato'
      and p.tipo in ('quota','integrazione');

    if v_pagamenti = 0 then
      raise exception
        'Approvazione bloccata: per % non risulta nessuna quota incassata. Registra prima il pagamento, oppure indica il motivo della deroga nel campo deroga_pagamento_motivo (esempio: contanti gia raccolti).',
        new.nome
        using errcode = 'check_violation';
    end if;

  end if;
  return new;
end;
$$;

drop trigger if exists trg_blocca_approvazione_senza_incasso on public.domande_tesseramento;
create trigger trg_blocca_approvazione_senza_incasso
  before update on public.domande_tesseramento
  for each row execute function public.blocca_approvazione_senza_incasso();
