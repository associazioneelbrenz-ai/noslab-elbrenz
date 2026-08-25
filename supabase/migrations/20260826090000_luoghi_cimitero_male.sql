-- Il cimitero come luogo sulla mappa, per la sezione Cimiteri di guerra
-- (brief 26/8/2026). Il punto segna il cimitero comunale di oggi: la
-- posizione esatta del cimitero militare storico non è verificata, e questo
-- va detto nel testo, non solo saputo — vincolo esplicito del brief.
insert into public.luoghi_interesse (nome, categoria, valle, lat, lng, descrizione_breve, descrizione_estesa, url_articolo, slug, stato, geo_stato)
values (
  'Cimitero militare di Malè',
  'grande_guerra',
  'val_di_sole',
  46.3507631,
  10.9151196,
  'Registro austro-ungarico 1914-1918: 236 tombe, 118 nomi restituiti. Il punto segna il cimitero comunale di oggi; la posizione esatta del cimitero militare storico non è ancora verificata.',
  'Il registro compilato dall''amministrazione austro-ungarica durante la Grande Guerra elenca 236 sepolture a Malè, di cui 217 nel cimitero militare e 21 nel cimitero civile. Il punto sulla mappa segna il cimitero comunale attuale, dove riposano le tombe del settore civile: la collocazione esatta del cimitero militare storico, con le sue 217 tombe, non è stata ancora verificata sul terreno.',
  '/cimiteri-di-guerra/male',
  'cimitero-militare-male',
  'pubblicato',
  'manuale'
);
