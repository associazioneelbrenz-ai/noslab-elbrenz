-- Recepimento nel repo (git = fonte di verità) della migration applicata al DB
-- il 21/7/2026 dalla chat via MCP. `add column if not exists` è idempotente:
-- questo file non riapplica nulla a caldo, allinea solo la storia in git.
--
-- Traccia il metodo di pagamento scelto dal richiedente al momento della
-- domanda di tesseramento. Prima di questa colonna la domanda n.26 (21/7) è
-- arrivata senza alcuna traccia del metodo: notifica al direttivo muta e
-- approvazione "al buio". La scelta è persistita nel ramo di ciascun metodo
-- (PASSO 2 del form): PayPal, bonifico o contanti.

alter table public.domande_tesseramento
  add column if not exists metodo_scelto text
  check (metodo_scelto is null or metodo_scelto in ('paypal','bonifico','contanti'));

comment on column public.domande_tesseramento.metodo_scelto is
  'Metodo di pagamento scelto dal richiedente al momento della domanda (paypal|bonifico|contanti). NULL per domande antecedenti al 21/7/2026.';
