-- Museo Grande Guerra: spazio di narrazione lungo per il curatore.
-- Richiesta di Michele Corradini (1/8/2026): «come per le storie, un ricco
-- spazio per la narrazione piu' il caricamento di 2/3 immagini».
--
-- PERCHE' UN CAMPO NUOVO E NON UNA TEXTAREA PIU' GRANDE SU descrizione:
-- `descrizione` e' la didascalia di catalogo, e la galleria pubblica la rende
-- come UN SOLO paragrafo dentro il lightbox (textContent, senza a capo).
-- Infilarci un racconto di quindici righe darebbe un muro di testo senza
-- respiro. Sono due cose diverse e restano due campi diversi, come in `storia`
-- il titolo e' separato da `contenuto`.
--
-- Additiva e retrocompatibile: i pezzi esistenti restano identici, racconto null.

alter table public.museo_gg_pezzo
  add column if not exists racconto text;

comment on column public.museo_gg_pezzo.racconto is
  'Narrazione estesa del pezzo, a capo significativi. Distinta da descrizione, che resta la didascalia breve di catalogo.';
