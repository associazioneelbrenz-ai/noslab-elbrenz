-- BRIEF CD 1/9/2026, punto 6: scotum come quarto valore di dizionario_lemma.tipo,
-- non come tabella separata (il lemma "Scotum" nel glossario dice gia' cosa
-- e': "soprannome di famiglia" -- e' una voce del glossario con la sua natura,
-- non un archivio a parte).
alter table public.dizionario_lemma drop constraint dizionario_lemma_tipo_check;
alter table public.dizionario_lemma add constraint dizionario_lemma_tipo_check
  check (tipo = ANY (ARRAY['parola'::text, 'frase'::text, 'espressione'::text, 'scotum'::text]));
