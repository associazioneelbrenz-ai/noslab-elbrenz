-- Le tre tombe senza nome (133, 186, 195) avevano "redento"/"esumato" in
-- luogo_nascita/regione_nascita: erano annotazioni di stato amministrativo
-- del dopoguerra copiate per errore in un campo di provenienza geografica,
-- non un luogo di nascita vero. Per una tomba senza nome comunque non c'è
-- una provenienza nota da scrivere. Rimossi entrambi i campi: il termine
-- "redento" (e derivati) non deve comparire da nessuna parte nel sito.
update public.memoria_persona
set luogo_nascita = null, regione_nascita = null
where numero in (133, 186, 195)
  and fondo_id = (select id from public.memoria_fondo where slug = 'cimitero-militare-male')
  and nome_completo = 'sconosciuto';
