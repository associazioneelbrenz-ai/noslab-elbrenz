# DB-05 — Riparazione del registro delle migrazioni (15 settembre 2026)

Ondata 2 dell'audit del 13 settembre 2026 (`AUDIT_2026-09-13.md`), voce DB-05.
Questo documento **non decide nulla e non tocca nulla**: mette in fila che cosa
c'è in `supabase/migrations/` e che cosa c'è in
`supabase_migrations.schema_migrations` sul progetto `wacknihvdjxltiqvxtqr`,
e scrive i comandi da lanciare dall'Air (o dal Mac Mini) dopo la revisione di
Cristian. La sessione cloud non ha la CLI collegata al progetto e non deve
farlo.

## Perché conta

`supabase db push` applica **tutti** i file locali la cui versione non è
registrata nel database. Oggi sono 89 file più i 5 nuovi dell'ondata 2: un
`db push` lanciato senza prima riparare il registro **rieseguirebbe 89
migrazioni già in effetto**, alcune con `create table` senza `if not exists`,
altre con dati di riferimento. La riparazione va fatta **prima** di qualunque
push.

La causa è una sola, ripetuta per due mesi: le migrazioni sono state applicate
via MCP (`apply_migration`), che registra la versione con **il proprio
timestamp** e il nome passato, mentre il file locale è stato salvato con un
altro timestamp. Stesso nome, stesso contenuto, versione diversa: il registro
e la cartella non si riconoscono. Per 68 file su 89 l'omonimo nel database
esiste e si vede a occhio; per 21 no.

## Numeri (calcolati il 15/9/2026)

| Cosa | Quanti |
|---|---|
| File `.sql` locali | 172 (171 versioni distinte: `20260802110000` è doppia) |
| Versioni registrate nel database | 314 |
| File locali **senza** versione registrata | **89** (68 con omonima nel DB, 21 senza) |
| Versioni nel DB **senza** file locale | **231** (38 fondazione, 68 omonime di file locali, 125 altre) |

Come sono stati calcolati:

```sql
select string_agg(version || ' ' || coalesce(name,''), E'\n' order by version)
  from supabase_migrations.schema_migrations;
```

```bash
ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/_.*//' | sort -u   # versioni locali
comm -23 locali db   # file senza versione
comm -13 locali db   # versioni senza file
```

L'abbinamento "omonima" è per nome esatto (la parte dopo il timestamp del file
= colonna `name` del registro).

## Due anomalie nella cartella, da sistemare a mano

1. **Versione doppia `20260802110000`**: `20260802110000_articolo_flag_archivio.sql`
   e `20260802110000_mappa_anteprima.sql`. La CLI non ammette due file con la
   stessa versione. Uno dei due va **rinominato** (solo il timestamp del nome
   file, non il contenuto), per esempio `mappa_anteprima` a `20260802110100`.
   Da decidere prima della riparazione, perché il comando `repair` prende una
   versione sola.
2. **File `.bak-ondata1` dentro `supabase/migrations/`**
   (`20260807120227_ponte_account_numero_socio.sql.bak-ondata1`,
   `20260808100000_correzioni_e_account_doppi.sql.bak-ondata1`). La CLI legge
   solo i `.sql` con nome `<timestamp>_<slug>.sql`, quindi li ignora; ma
   sporcano il confronto e vanno spostati fuori dalla cartella (regola ferrea:
   non cancellati).

## A. File locali senza versione registrata (89)

### A1. Con omonima nel database (68): il contenuto è già in effetto

Il file locale e la riga del registro descrivono la stessa migrazione, applicata
via MCP con un altro timestamp. Per ognuno: **`--status applied`** sulla
versione del file locale. La riga omonima nel DB resta (vedi B2 per come
valutarla).

| File locale | Versione omonima nel DB |
|---|---|
| `20260716111044_telegram_notifica.sql` | `20260716093126` |
| `20260716132422_custodi_tassonomia.sql` | `20260716112508` |
| `20260716134736_custodi_curatela_rls.sql` | `20260716114757` |
| `20260716174209_grande_guerra_sezione.sql` | `20260716154313` |
| `20260716181500_museo_gg_pezzo.sql` | `20260716170950` |
| `20260717120000_museo_gg_proposta.sql` | `20260717040620` |
| `20260717150000_domande_tesseramento_self_read.sql` | `20260717041836` |
| `20260717170000_storia.sql` | `20260717043252` |
| `20260717190000_museo_gg_fase_a_soci.sql` | `20260717080024` |
| `20260717210000_dashboard_admin_read_aal2.sql` | `20260717084102` |
| `20260717230000_avatar_socio_storage.sql` | `20260717093150` |
| `20260717233000_v_storia_pubblica.sql` | `20260717094315` |
| `20260718000000_donazione_materiale.sql` | `20260717101115` |
| `20260718100000_community_feed.sql` | `20260717121417` |
| `20260718110000_community_feed_fase3.sql` | `20260717124815` |
| `20260718120000_community_menzioni_rpc.sql` | `20260717125645` |
| `20260718200000_riconoscimenti.sql` | `20260717145708` |
| `20260721120000_domande_tesseramento_metodo_scelto.sql` | `20260721150554` |
| `20260731120000_radar_eventi.sql` | `20260731124323` |
| `20260801100000_museo_gg_racconto.sql` | `20260801072938` |
| `20260802090000_allineamento_audit_completo.sql` | `20260802011241` |
| `20260802093000_v_articoli_pubblici_solo_post.sql` | `20260802011303` |
| `20260802100000_v_articoli_pubblici_campi_seo.sql` | `20260802053220` |
| `20260802103000_andreas_limite_soci_100_e_policy.sql` | `20260802053654` |
| `20260802110000_articolo_flag_archivio.sql` | `20260802055440` |
| `20260802150000_kb_pulizia_pre_maffei.sql` | `20260802194755` |
| `20260802160000_pagamenti_sorgente_utm.sql` | `20260802210058` |
| `20260803213000_v_soci_in_regola.sql` | `20260803200803` |
| `20260804030000_solleciti_quota_e_viste_incassi.sql` | `20260804012010` |
| `20260804090000_cron_solleciti_quota.sql` | `20260804070358` |
| `20260804093000_lancia_solleciti_a_vuoto_per_difetto.sql` | `20260804091834` |
| `20260804140000_anagrafica_completa_socio.sql` | `20260804095023` |
| `20260804160000_config_app_chiavi_pubbliche.sql` | `20260804101146` |
| `20260804170000_newsletter_iscritti_e_campagne.sql` | `20260804101753` |
| `20260804171000_newsletter_candidati_consenso.sql` | `20260804101916` |
| `20260804172000_email_outbox_origini_newsletter.sql` | `20260804102343` |
| `20260804180000_newsletter_gruppo_tutti_i_soci.sql` | `20260804105559` |
| `20260804190000_passaggio_anno.sql` | `20260804113805` |
| `20260804200000_numero_socio.sql` | `20260804122404` |
| `20260804210000_canale_istituzionale.sql` | `20260804122900` |
| `20260804220000_compagine_sociale.sql` | `20260804125013` |
| `20260804230000_audit_db_chiusura.sql` | `20260804135618` |
| `20260808073000_plancia_misure_oneste_email_e_annunci.sql` | `20260808080157` |
| `20260808080000_punti_lemma_anche_alla_nascita.sql` | `20260808080729` |
| `20260808083000_punti_arretrati_al_primo_accesso.sql` | `20260808081740` |
| `20260808090000_reazioni_fondamenta.sql` | `20260808085746` |
| `20260808110000_guardie_che_gridano_invece_di_tacere.sql` | `20260808152021` |
| `20260808120000_commenti_ai_termini.sql` | `20260808154833` |
| `20260808130000_ocr_trascrizioni.sql` | `20260808160740` |
| `20260809020000_nome_una_fonte_sola.sql` | `20260809003948` |
| `20260823090000_luoghi_georeferenziazione_e_toponomastica.sql` | `20260823215431` |
| `20260823093000_luoghi_viste_pubbliche_gate_toponimo_validato.sql` | `20260823215806` |
| `20260823094000_geocodifica_coda_un_secondo.sql` | `20260823215825` |
| `20260824080000_luoghi_immagini.sql` | `20260824115245` |
| `20260824100000_soci_collegamento_manuale_domanda_account.sql` | `20260824114856` |
| `20260825135000_memoria_dati_fondo_male.sql` | `20260825115508` |
| `20260825160000_memoria_rimuovi_termine_redento.sql` | `20260825151014` |
| `20260825170000_memoria_fondo_slug_breve.sql` | `20260825153050` |
| `20260825171000_memoria_fondo_racconto_html.sql` | `20260825153417` |
| `20260826110000_memoria_fondo_pubblico_execute_anon.sql` | `20260825194034` |
| `20260826120000_memoria_racconto_correzione_storica_italofoni.sql` | `20260825202042` |
| `20260826140000_memoria_fondo_protocollo_anno_pratica.sql` | `20260826140518` |
| `20260828120000_salvataggio_settimanale.sql` | `20260828211421` |
| `20260830090000_socio_storico.sql` | `20260830212112` |
| `20260902120000_guardiani_marketing_invitato_il.sql` | `20260902164115` |
| `20260902130000_variante_candidate_parlata_paese.sql` | `20260902165313` |
| `20260902140000_dizionario_lemma_tipo_scotum.sql` | `20260902165855` |
| `20260915100000_priv05_informativa_versione.sql` | `20260915012305` |

Comandi (uno per file, da lanciare dall'Air dopo `gh auth status` e
`supabase login`; `--project-ref` sempre esplicito):

```bash
supabase migration repair --status applied 20260716111044 --project-ref wacknihvdjxltiqvxtqr   # telegram_notifica
supabase migration repair --status applied 20260716132422 --project-ref wacknihvdjxltiqvxtqr   # custodi_tassonomia
supabase migration repair --status applied 20260716134736 --project-ref wacknihvdjxltiqvxtqr   # custodi_curatela_rls
supabase migration repair --status applied 20260716174209 --project-ref wacknihvdjxltiqvxtqr   # grande_guerra_sezione
supabase migration repair --status applied 20260716181500 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_pezzo
supabase migration repair --status applied 20260717120000 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_proposta
supabase migration repair --status applied 20260717150000 --project-ref wacknihvdjxltiqvxtqr   # domande_tesseramento_self_read
supabase migration repair --status applied 20260717170000 --project-ref wacknihvdjxltiqvxtqr   # storia
supabase migration repair --status applied 20260717190000 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_fase_a_soci
supabase migration repair --status applied 20260717210000 --project-ref wacknihvdjxltiqvxtqr   # dashboard_admin_read_aal2
supabase migration repair --status applied 20260717230000 --project-ref wacknihvdjxltiqvxtqr   # avatar_socio_storage
supabase migration repair --status applied 20260717233000 --project-ref wacknihvdjxltiqvxtqr   # v_storia_pubblica
supabase migration repair --status applied 20260718000000 --project-ref wacknihvdjxltiqvxtqr   # donazione_materiale
supabase migration repair --status applied 20260718100000 --project-ref wacknihvdjxltiqvxtqr   # community_feed
supabase migration repair --status applied 20260718110000 --project-ref wacknihvdjxltiqvxtqr   # community_feed_fase3
supabase migration repair --status applied 20260718120000 --project-ref wacknihvdjxltiqvxtqr   # community_menzioni_rpc
supabase migration repair --status applied 20260718200000 --project-ref wacknihvdjxltiqvxtqr   # riconoscimenti
supabase migration repair --status applied 20260721120000 --project-ref wacknihvdjxltiqvxtqr   # domande_tesseramento_metodo_scelto
supabase migration repair --status applied 20260731120000 --project-ref wacknihvdjxltiqvxtqr   # radar_eventi
supabase migration repair --status applied 20260801100000 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_racconto
supabase migration repair --status applied 20260802090000 --project-ref wacknihvdjxltiqvxtqr   # allineamento_audit_completo
supabase migration repair --status applied 20260802093000 --project-ref wacknihvdjxltiqvxtqr   # v_articoli_pubblici_solo_post
supabase migration repair --status applied 20260802100000 --project-ref wacknihvdjxltiqvxtqr   # v_articoli_pubblici_campi_seo
supabase migration repair --status applied 20260802103000 --project-ref wacknihvdjxltiqvxtqr   # andreas_limite_soci_100_e_policy
supabase migration repair --status applied 20260802110000 --project-ref wacknihvdjxltiqvxtqr   # articolo_flag_archivio
supabase migration repair --status applied 20260802150000 --project-ref wacknihvdjxltiqvxtqr   # kb_pulizia_pre_maffei
supabase migration repair --status applied 20260802160000 --project-ref wacknihvdjxltiqvxtqr   # pagamenti_sorgente_utm
supabase migration repair --status applied 20260803213000 --project-ref wacknihvdjxltiqvxtqr   # v_soci_in_regola
supabase migration repair --status applied 20260804030000 --project-ref wacknihvdjxltiqvxtqr   # solleciti_quota_e_viste_incassi
supabase migration repair --status applied 20260804090000 --project-ref wacknihvdjxltiqvxtqr   # cron_solleciti_quota
supabase migration repair --status applied 20260804093000 --project-ref wacknihvdjxltiqvxtqr   # lancia_solleciti_a_vuoto_per_difetto
supabase migration repair --status applied 20260804140000 --project-ref wacknihvdjxltiqvxtqr   # anagrafica_completa_socio
supabase migration repair --status applied 20260804160000 --project-ref wacknihvdjxltiqvxtqr   # config_app_chiavi_pubbliche
supabase migration repair --status applied 20260804170000 --project-ref wacknihvdjxltiqvxtqr   # newsletter_iscritti_e_campagne
supabase migration repair --status applied 20260804171000 --project-ref wacknihvdjxltiqvxtqr   # newsletter_candidati_consenso
supabase migration repair --status applied 20260804172000 --project-ref wacknihvdjxltiqvxtqr   # email_outbox_origini_newsletter
supabase migration repair --status applied 20260804180000 --project-ref wacknihvdjxltiqvxtqr   # newsletter_gruppo_tutti_i_soci
supabase migration repair --status applied 20260804190000 --project-ref wacknihvdjxltiqvxtqr   # passaggio_anno
supabase migration repair --status applied 20260804200000 --project-ref wacknihvdjxltiqvxtqr   # numero_socio
supabase migration repair --status applied 20260804210000 --project-ref wacknihvdjxltiqvxtqr   # canale_istituzionale
supabase migration repair --status applied 20260804220000 --project-ref wacknihvdjxltiqvxtqr   # compagine_sociale
supabase migration repair --status applied 20260804230000 --project-ref wacknihvdjxltiqvxtqr   # audit_db_chiusura
supabase migration repair --status applied 20260808073000 --project-ref wacknihvdjxltiqvxtqr   # plancia_misure_oneste_email_e_annunci
supabase migration repair --status applied 20260808080000 --project-ref wacknihvdjxltiqvxtqr   # punti_lemma_anche_alla_nascita
supabase migration repair --status applied 20260808083000 --project-ref wacknihvdjxltiqvxtqr   # punti_arretrati_al_primo_accesso
supabase migration repair --status applied 20260808090000 --project-ref wacknihvdjxltiqvxtqr   # reazioni_fondamenta
supabase migration repair --status applied 20260808110000 --project-ref wacknihvdjxltiqvxtqr   # guardie_che_gridano_invece_di_tacere
supabase migration repair --status applied 20260808120000 --project-ref wacknihvdjxltiqvxtqr   # commenti_ai_termini
supabase migration repair --status applied 20260808130000 --project-ref wacknihvdjxltiqvxtqr   # ocr_trascrizioni
supabase migration repair --status applied 20260809020000 --project-ref wacknihvdjxltiqvxtqr   # nome_una_fonte_sola
supabase migration repair --status applied 20260823090000 --project-ref wacknihvdjxltiqvxtqr   # luoghi_georeferenziazione_e_toponomastica
supabase migration repair --status applied 20260823093000 --project-ref wacknihvdjxltiqvxtqr   # luoghi_viste_pubbliche_gate_toponimo_validato
supabase migration repair --status applied 20260823094000 --project-ref wacknihvdjxltiqvxtqr   # geocodifica_coda_un_secondo
supabase migration repair --status applied 20260824080000 --project-ref wacknihvdjxltiqvxtqr   # luoghi_immagini
supabase migration repair --status applied 20260824100000 --project-ref wacknihvdjxltiqvxtqr   # soci_collegamento_manuale_domanda_account
supabase migration repair --status applied 20260825135000 --project-ref wacknihvdjxltiqvxtqr   # memoria_dati_fondo_male
supabase migration repair --status applied 20260825160000 --project-ref wacknihvdjxltiqvxtqr   # memoria_rimuovi_termine_redento
supabase migration repair --status applied 20260825170000 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_slug_breve
supabase migration repair --status applied 20260825171000 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_racconto_html
supabase migration repair --status applied 20260826110000 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_pubblico_execute_anon
supabase migration repair --status applied 20260826120000 --project-ref wacknihvdjxltiqvxtqr   # memoria_racconto_correzione_storica_italofoni
supabase migration repair --status applied 20260826140000 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_protocollo_anno_pratica
supabase migration repair --status applied 20260828120000 --project-ref wacknihvdjxltiqvxtqr   # salvataggio_settimanale
supabase migration repair --status applied 20260830090000 --project-ref wacknihvdjxltiqvxtqr   # socio_storico
supabase migration repair --status applied 20260902120000 --project-ref wacknihvdjxltiqvxtqr   # guardiani_marketing_invitato_il
supabase migration repair --status applied 20260902130000 --project-ref wacknihvdjxltiqvxtqr   # variante_candidate_parlata_paese
supabase migration repair --status applied 20260902140000 --project-ref wacknihvdjxltiqvxtqr   # dizionario_lemma_tipo_scotum
supabase migration repair --status applied 20260915100000 --project-ref wacknihvdjxltiqvxtqr   # priv05_informativa_versione
```

Caso particolare, l'ultimo della lista: `20260915100000_priv05_informativa_versione.sql`
è la migrazione PRIV-05 dell'ondata 1, applicata via MCP il 15/9 come
`20260915012305`. Stessa regola degli altri.

### A2. Senza omonima nel database (21): verificate il 16/9/2026

Per questi 21 file non c'è una riga del registro con lo stesso nome. Potevano
essere stati applicati via MCP con un nome diverso, oppure a mano dallo SQL
editor, oppure **mai**. Il 16 settembre 2026 sono stati aperti uno per uno,
catalogando quello che ciascuno crea (tabelle, colonne, viste, funzioni,
trigger, policy, grant, indici, lavori pg_cron, righe di riferimento) e
confrontandolo con il database vivo.

Esito: **18 confermate**, **2 superate da una migrazione successiva senza
perdita**, **1 che nel database non ha lasciato traccia**. Venti su ventuno si
possono marcare `applied`; una sola,
`20260801090000_radar_eventi_cron.sql`, va decisa con Cristian.

Le query usate per il controllo, per chi dovesse rifarlo:

```sql
-- tabelle / viste
select table_name, table_type from information_schema.tables
 where table_schema='public' and table_name in ('...');
-- colonne
select table_name, column_name, data_type from information_schema.columns
 where table_schema='public' and table_name in ('...');
-- funzioni, con i grant residui
select proname, pg_get_function_identity_arguments(oid), prosecdef, proacl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and proname in ('...');
-- policy
select tablename, policyname, cmd, qual, with_check from pg_policies
 where schemaname='public' and tablename in ('...');
-- trigger, indici, vincoli
select tgname from pg_trigger where not tgisinternal;
select indexname from pg_indexes where schemaname='public' and indexname in ('...');
select conname, pg_get_constraintdef(oid) from pg_constraint where conname in ('...');
-- grant residui ad anon e authenticated
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated');
-- lavori pianificati
select jobid, jobname, schedule, command from cron.job order by jobid;
```

| File locale | Indizio | Verifica 16/9/2026 |
|---|---|---|
| `20260801090000_radar_eventi_cron.sql` | i 5 cron radar esistono in cron.job (jobid 15-19); vedi anche 20260828100100 | **MANCA** — `radar_chiama_edge(text,text)` non esiste in pg_proc; i tre cron `radar-harvest-notturno`, `radar-classifica-notturna`, `radar-digest-settimanale` non esistono in cron.job. Il segreto `ingest_token` nel Vault c'è. Il radar gira per altra via, con i cinque lavori `radar-eventi-*` di 20260828100100 |
| `20260801101000_museo_gg_guardia_curatore.sql` | nel DB c'è `museo_gg_guardia_riconosce_curatore` (20260801074206): probabile stesso contenuto, nome diverso | **CONFERMATA** — funzione `museo_gg_guardia_pubblicazione()` presente, corpo con `curatore_museo_gg`, `has_ruolo_min(auth.uid(), 50)` e i tre blocchi (fonte, immagini, consenso); trigger `trg_museo_gg_guardia` before insert or update su museo_gg_pezzo |
| `20260801160000_email_outbox_allineamento.sql` | confrontare con `email_outbox_invio_da_chat_e_pannello` e `email_outbox_origini_newsletter` | **CONFERMATA** — tabella `email_outbox` con tutte le colonne del file (64 righe), RLS attiva, le tre policy `email_outbox_admin_select/insert/update` con `has_ruolo_min(50)`, indice `idx_email_outbox_da_processare`, nessun TRUNCATE ad anon e authenticated. Il vincolo `email_outbox_origine_check` elenca oggi sette origini invece di tre, allargato da `email_outbox_origini_newsletter`: il file lo crea solo se manca, quindi non toglie niente |
| `20260801200000_audit_1_agosto.sql` | confrontare con `allineamento_audit_completo` (20260802011241) | **CONFERMATA** — le otto viste elencate hanno solo SELECT per anon e authenticated; `_mappa_img_wp` ha RLS attiva, anon nessun privilegio, authenticated il solo SELECT; `scadi_ordini_creato_vecchi()` ha ACL postgres e service_role; `get_mia_tessera()` non ha più anon; `cerca_soci(text)` contiene `has_ruolo_min(auth.uid(), 10)` nella WHERE; il record della gita dice «Giochi Medievali del Südtirol», luogo «Sluderno, Val Venosta (Südtirol)» |
| `20260802110000_mappa_anteprima.sql` | versione doppia con articolo_flag_archivio: rinominare prima | **CONFERMATA, ma il file va rinominato prima del repair** — colonna `luoghi_interesse.in_anteprima` presente, sei righe a true (Castel Thun, Santuario di San Romedio, Castel San Michele, Sacrario del Passo del Tonale, Segheria veneziana Bègoi, Museo di Punta Linke), vista `v_luoghi_mappa` con `in_anteprima` e solo SELECT ad anon e authenticated. Unica differenza, non sostanziale: la vista è oggi `security_invoker = true`, impostato da una migrazione successiva. La versione `20260802110000` è occupata anche da `articolo_flag_archivio`: finché il file non è rinominato (per esempio a `20260802110100`) il comando `repair` non può distinguerli |
| `20260802120000_ai_quota_atomica.sql` | nel DB ci sono `ai_consuma_quota_atomica` e `ai_somma_token` (20260802100038/101120) | **CONFERMATA** — `ai_consuma_quota(uuid, text, integer)` e `ai_somma_token(uuid, text, integer)` presenti, entrambe SECURITY DEFINER e con ACL ridotta a postgres e service_role (le revoche del file sono in effetto); riga `ai_config_ruolo` per `admin_capo` con limite_giornaliero -1 |
| `20260803090000_allineamento_schema_pagamenti.sql` | verificare colonne di pagamenti_tesseramento | **CONFERMATA** — `pagamenti_tesseramento.sorgente_utm` è jsonb; `pagamenti_tesseramento_tipo_check` elenca quota, donazione, integrazione, anticipo_gita; `domande_tesseramento_stato_check` elenca in_attesa, approvata, respinta, annullata; `domande_tesseramento.sorgente_utm` è jsonb |
| `20260803210000_blocca_approvazione_senza_incasso.sql` | cercare il trigger/funzione sulla tabella domande_tesseramento | **CONFERMATA** — colonna `domande_tesseramento.deroga_pagamento_motivo` presente; funzione `blocca_approvazione_senza_incasso()` presente, definer, con la deroga nel corpo; trigger `trg_blocca_approvazione_senza_incasso` before update su domande_tesseramento |
| `20260804034000_quota_anno_e_posizioni.sql` | nel DB c'è `quota_anno_e_posizioni_soci` (20260804013650) | **CONFERMATA** — `config_app.quota_sociale_per_anno` vale `{"2025": 10, "2026": 20}`; funzione `quota_anno(integer)` presente con ACL postgres e service_role; le quattro colonne `data_ricostruita`, `annullato_il`, `annullato_da`, `annullato_motivo` ci sono su pagamenti_tesseramento; anche `blocca_approvazione_senza_incasso()` non è più eseguibile da anon, authenticated e public |
| `20260804181000_newsletter_destinatari_dedup.sql` | nel DB c'è `newsletter_destinatari_dedup_per_indirizzo` (20260804105628) | **CONFERMATA** — vista `v_newsletter_destinatari` presente, definizione con `min(v.nome)` e i quattro gruppi, nessun grant ad anon e authenticated. Dedup verificato sul vivo: gruppo soci_tutti 31 righe e 31 indirizzi distinti |
| `20260808100000_correzioni_e_account_doppi.sql` | nel DB c'è `correzioni_ai_lemmi` (20260808135305)? confrontare | **CONFERMATA** — il file non contiene nessuna istruzione SQL, sono solo commenti: marcarlo o applicarlo per il database è lo stesso. Quello che descrive esiste: tabella `lemma_correzione` presente, con due righe |
| `20260808113000_traccia_modifiche_dopo_pubblicazione.sql` | nel DB c'è `traccia_modifiche_dopo_la_pubblicazione` (20260808152558) | **CONFERMATA** — anche qui soli commenti, nessuna istruzione SQL. Gli oggetti descritti esistono: tabella `modifica_contenuto` con 139 righe, vista `v_modifiche_recenti`, funzione `tg_traccia_modifica` con i tre trigger su articolo, dizionario_lemma e museo_gg_pezzo |
| `20260808140000_audit_profondo_fix.sql` | confrontare con `fix_audit_viste_invoker` / `audit_revoca_execute_anon` (20260808194758/194939) | **CONFERMATA** — soli commenti anche questo. Le tre correzioni descritte sono in effetto: `v_modifiche_recenti` e `v_ocr_consumo` sono `security_invoker = true`; `lancia_guardiani_digest(boolean)` e `annuncia_lemmi_pubblicati()` hanno ACL ridotta a postgres e service_role |
| `20260825150000_memoria_planimetria_geo_male.sql` | nel DB c'è `memoria_fondo_pubblico_planimetria_geo` (20260825152944) | **CONFERMATA** — `memoria_fondo.planimetria_geo` del fondo `cimitero-militare-male` contiene nove righe da ventiquattro e ventuno posizioni civili, come il file |
| `20260826090000_luoghi_cimitero_male.sql` | cercare la riga del cimitero di Malè in luoghi | **CONFERMATA** — riga `luoghi_interesse` con slug `cimitero-militare-male`: «Cimitero militare di Malè», categoria grande_guerra, valle val_di_sole, 46.3507631 / 10.9151196, stato pubblicato, geo_stato manuale |
| `20260826095000_memoria_evento_pubblico_e_persona_arricchita.sql` | nel DB c'è `memoria_evento_pubblico_e_arricchimento_persona` (20260825154918) | **SUPERATA** da `20260828100000_recupero_schema_servizi_reparti_cruscotto.sql`, senza perdita — `v_memoria_evento_pubblico` esiste, security_invoker, con SELECT ad anon e authenticated; `v_memoria_persona_pubblica` esiste, security_invoker, e ha `fondo_slug_breve` ed `evento_slug` (le aggiunte di questo file) più `relazione_registrazione`, che arriva dal 28/8 |
| `20260826100000_memoria_racconto_completo.sql` | nel DB c'è `memoria_fondo_racconto_html_completo` (20260825155143) | **CONFERMATA** — `memoria_fondo.racconto_html` del fondo `cimitero-militare-male` conta 13.638 caratteri e contiene sia il titolo di apertura sia la chiusa del file |
| `20260828100000_recupero_schema_servizi_reparti_cruscotto.sql` | recupero del 28/8 (Trappola 16): descrive oggetti già esistenti, per costruzione | **CONFERMATA** — le quattro tabelle (servizio, servizio_battito, memoria_reparto, memoria_evento_reparto) esistono con RLS attiva e le policy attese (`memoria_reparto_lettura` true, `memoria_reparto_scrittura` e `mer_scrittura` con has_ruolo_min 20); le quattro colonne aggiunte a memoria_persona e i due vincoli ci sono; le dieci funzioni ci sono con i grant dichiarati (cruscotto e ascolto ad authenticated, battito e radar al solo service_role); le sette viste ci sono, tutte security_invoker, con v_servizi_stato senza grant, v_cruscotto_code e v_cruscotto_completezza senza SELECT ad anon, v_coda_ascolto al solo authenticated |
| `20260828100100_recupero_cron_radar_eventi.sql` | recupero del 28/8 (Trappola 16): descrive oggetti già esistenti, per costruzione | **CONFERMATA** — i cinque lavori sono in cron.job con jobid 15-19, orari e comandi identici al file: radar-eventi-harvest `20 3 * * *`, radar-eventi-classifica `40 3 * * *`, radar-eventi-classifica-coda `10 4 * * *`, radar-eventi-digest `30 7 * * 1`, radar-eventi-battito `15 8 * * 1` |
| `20260828100200_recupero_dati_riferimento.sql` | recupero del 28/8 (Trappola 16): descrive oggetti già esistenti, per costruzione | **CONFERMATA** — `memoria_reparto` ha 55 righe, quante ne inserisce il file (73.FliegerKp e Russ.16.IR verificate una per una); `servizio` contiene tutti e otto i nomi del file, più `salvataggio-settimanale` che arriva da un'altra migrazione |
| `20260829084902_archivio_audio_stretta_visibilita.sql` | verificare le policy su archivio_audio (l'ondata 1 le ha poi cambiate: 20260915002255) | **SUPERATA** da `20260915002255_ondata1_push_secret_archivio_audio_revoke.sql`, senza perdita — la policy `aa_select_per_visibilita` non esiste più: l'ondata 1 l'ha eliminata e messa al suo posto `aa_select_curatori` (`for select to authenticated using has_ruolo_min(uid, 20)`). La stretta è andata oltre a quella del file: oggi un autenticato che non sia curatore non legge nemmeno le righe pubblicate. Il file non è ri-eseguibile da solo, perché un `alter policy` su una policy che non c'è fallisce: marcarlo `applied` è l'unica strada |

#### A2 verificate: si possono lanciare

Venti file su ventuno. Il commento `# verificata 16/9` sta a dire che il
contenuto è stato confrontato con il database vivo, riga per riga.

Attenzione all'ordine: `20260802110000_mappa_anteprima.sql` va **rinominato
prima**, altrimenti la versione `20260802110000` è ambigua (vedi «Due anomalie
nella cartella»). Il comando qui sotto porta già la versione nuova proposta,
`20260802110100`.

```bash
supabase migration repair --status applied 20260801101000 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_guardia_curatore  # verificata 16/9
supabase migration repair --status applied 20260801160000 --project-ref wacknihvdjxltiqvxtqr   # email_outbox_allineamento  # verificata 16/9
supabase migration repair --status applied 20260801200000 --project-ref wacknihvdjxltiqvxtqr   # audit_1_agosto  # verificata 16/9
supabase migration repair --status applied 20260802110100 --project-ref wacknihvdjxltiqvxtqr   # mappa_anteprima (DOPO la rinomina del file)  # verificata 16/9
supabase migration repair --status applied 20260802120000 --project-ref wacknihvdjxltiqvxtqr   # ai_quota_atomica  # verificata 16/9
supabase migration repair --status applied 20260803090000 --project-ref wacknihvdjxltiqvxtqr   # allineamento_schema_pagamenti  # verificata 16/9
supabase migration repair --status applied 20260803210000 --project-ref wacknihvdjxltiqvxtqr   # blocca_approvazione_senza_incasso  # verificata 16/9
supabase migration repair --status applied 20260804034000 --project-ref wacknihvdjxltiqvxtqr   # quota_anno_e_posizioni  # verificata 16/9
supabase migration repair --status applied 20260804181000 --project-ref wacknihvdjxltiqvxtqr   # newsletter_destinatari_dedup  # verificata 16/9
supabase migration repair --status applied 20260808100000 --project-ref wacknihvdjxltiqvxtqr   # correzioni_e_account_doppi (soli commenti)  # verificata 16/9
supabase migration repair --status applied 20260808113000 --project-ref wacknihvdjxltiqvxtqr   # traccia_modifiche_dopo_pubblicazione (soli commenti)  # verificata 16/9
supabase migration repair --status applied 20260808140000 --project-ref wacknihvdjxltiqvxtqr   # audit_profondo_fix (soli commenti)  # verificata 16/9
supabase migration repair --status applied 20260825150000 --project-ref wacknihvdjxltiqvxtqr   # memoria_planimetria_geo_male  # verificata 16/9
supabase migration repair --status applied 20260826090000 --project-ref wacknihvdjxltiqvxtqr   # luoghi_cimitero_male  # verificata 16/9
supabase migration repair --status applied 20260826095000 --project-ref wacknihvdjxltiqvxtqr   # memoria_evento_pubblico_e_persona_arricchita (superata da 20260828100000)  # verificata 16/9
supabase migration repair --status applied 20260826100000 --project-ref wacknihvdjxltiqvxtqr   # memoria_racconto_completo  # verificata 16/9
supabase migration repair --status applied 20260828100000 --project-ref wacknihvdjxltiqvxtqr   # recupero_schema_servizi_reparti_cruscotto  # verificata 16/9
supabase migration repair --status applied 20260828100100 --project-ref wacknihvdjxltiqvxtqr   # recupero_cron_radar_eventi  # verificata 16/9
supabase migration repair --status applied 20260828100200 --project-ref wacknihvdjxltiqvxtqr   # recupero_dati_riferimento  # verificata 16/9
supabase migration repair --status applied 20260829084902 --project-ref wacknihvdjxltiqvxtqr   # archivio_audio_stretta_visibilita (superata da 20260915002255)  # verificata 16/9
```

#### A2 da decidere con Cristian

Un file solo, e non si marca finché la decisione non è presa.

`20260801090000_radar_eventi_cron.sql`. Nel database non c'è niente di quello
che crea:

- la funzione `radar_chiama_edge(text, text)` non esiste in `pg_proc`;
- i tre lavori `radar-harvest-notturno` (`30 0 * * *`),
  `radar-classifica-notturna` (`15 1 * * *`) e `radar-digest-settimanale`
  (`0 6 * * 1`) non esistono in `cron.job`;
- il solo prerequisito che c'è è il segreto `ingest_token` nel Vault, presente.

Il radar però funziona, per un'altra strada: i cinque lavori `radar-eventi-*`
(jobid 15-19, migrazione `20260828100100`) chiamano `lancia_radar_eventi`,
`lancia_radar_classifica` e `controlla_radar_eventi`, che leggono il token dal
Vault per conto loro. Il file del 1 agosto è quindi una versione precedente e
mai applicata della stessa idea.

Le due vie:

1. **Marcarlo `applied` lo stesso**, dichiarando che il suo contenuto è stato
   superato da `20260828100100`. Il registro torna pulito, ma resta in
   `supabase/migrations/` un file che descrive oggetti che non esistono: chi
   ricostruisse il database dalle migrazioni si ritroverebbe tre cron doppioni
   e una funzione in più.
2. **Applicarlo davvero** con `db push`: crea `radar_chiama_edge` e tre cron che
   si sovrappongono ai cinque già attivi, cioè raccolta e classificazione due
   volte per notte. Non è quello che si vuole.

La strada sensata è la prima, accompagnata dallo spostamento del file fuori da
`supabase/migrations/` oppure dalla sua riscrittura come nota storica. Decide
Cristian: è una rimozione, e vale la regola ferrea.

## B. Versioni nel database senza file locale (231)

Qui **non si decide in questa sede**. Marcare una versione `reverted` toglie
solo la riga dal registro: non annulla niente nel database. Serve a far
tornare `supabase migration list` pulito, ma ogni riga tolta è una traccia in
meno di che cosa è stato fatto e quando. Il criterio di valutazione, per
ognuna:

1. **Il contenuto è in un file locale con altro nome?** Allora, una volta
   marcato `applied` il file locale (sezione A), la riga DB è un doppione e
   può andare `reverted`.
2. **Il contenuto non è in nessun file locale?** Allora è lavoro che vive solo
   nel database (Trappola 16). Prima si ricostruisce il file (dal contenuto
   della migrazione, se il dashboard lo conserva ancora, o dagli oggetti
   esistenti), lo si salva con **la stessa versione** del registro così
   combacia senza repair, e solo allora si valuta.
3. **In dubbio**: si lascia com'è. Una riga in più nel registro non rompe
   nulla; una riga in meno può nascondere una migrazione persa.

### B1. Fondazione, aprile-maggio 2026 (38)

È la fondazione del progetto che il recupero del 28/8 aveva lasciato fuori di
proposito (`REPORT_migrazioni_recupero_2026-08-28.md`): nessun file locale la
descrive, a parte `20260101000000_baseline_schema_fondativo.sql` che è
registrato e presente. Ricostruirla a ritroso è un lavoro a sé, a rischio di
sicurezza (policy e grant di partenza). **Non marcare `reverted`** finché non
è stata ricostruita o si è deciso che la baseline la copre.

| Versione | Nome |
|---|---|
| `20260421064913` | enable_citext |
| `20260421064953` | initial_schema |
| `20260421065012` | realtime_setup |
| `20260421070559` | add_collaboratore_role_and_documents |
| `20260421070856` | add_courses_gokollab_migration |
| `20260422063054` | m10_funzioni_helper |
| `20260422063111` | m11_forum_reazione_bacheca |
| `20260422063136` | m12_dizionario_audio |
| `20260422063209` | m13_sala_direttivo |
| `20260422063251` | m14_andreas_ai |
| `20260422063327` | m15_andreas_kb_pgvector |
| `20260422063359` | m16_andreas_bot_roadmap |
| `20260422090213` | m17_articolo_wp_import |
| `20260422100938` | m18_enable_http_extension |
| `20260422115031` | m19_enable_pg_net |
| `20260422115131` | m20_tmp_staging_articolo |
| `20260422152008` | m21_reclassify_pilastri |
| `20260422152131` | m22_reclassify_pilastri_v2 |
| `20260422152442` | m23_auth_otp |
| `20260422153017` | m21_classifica_pilastro_function |
| `20260422153048` | m21_classifica_pilastro_v2 |
| `20260422153156` | m21_classifica_pilastro_v3 |
| `20260422153345` | m22_auth_otp_functions |
| `20260422155952` | m23_enable_pg_cron |
| `20260422160041` | m24_rls_policies_missing_tables |
| `20260422164143` | m25_reminder_super_admin |
| `20260422164526` | m26_config_app_e_branding |
| `20260423061316` | m27_storage_assets_pubblici_policies |
| `20260501142038` | m_a_0_create_ai_rate_limit_pubblico |
| `20260501143842` | m_a_0_add_ruolo_pubblico |
| `20260513195218` | enable_rls_public_tables_security_fix |
| `20260518130328` | fix_security_definer_view_vista_ai_statistiche |
| `20260518130821` | harden_function_search_path_public_funcs |
| `20260518130904` | revoke_execute_internal_functions_from_public_anon_auth |
| `20260522061704` | add_indexes_on_unindexed_foreign_keys |
| `20260522062111` | wrap_auth_uid_in_rls_policies_for_initplan |
| `20260522064246` | rls_policies_for_orphan_tables_and_drop_tmp |
| `20260522070849` | revoke_execute_on_internal_rpcs_used_only_by_edge_functions |

### B2. Omonime di file locali (68)

Sono le righe registrate via MCP i cui file locali stanno nella sezione A1.
Dopo aver marcato `applied` i file locali, ognuna è un doppione. Candidate a
`reverted`, ma **da confermare una per una** che il file locale abbia davvero
lo stesso contenuto (il nome uguale è un indizio forte, non una prova: il file
può essere stato ritoccato dopo).

| Versione DB | Nome | File locale corrispondente |
|---|---|---|
| `20260716093126` | telegram_notifica | `20260716111044_telegram_notifica.sql` |
| `20260716112508` | custodi_tassonomia | `20260716132422_custodi_tassonomia.sql` |
| `20260716114757` | custodi_curatela_rls | `20260716134736_custodi_curatela_rls.sql` |
| `20260716154313` | grande_guerra_sezione | `20260716174209_grande_guerra_sezione.sql` |
| `20260716170950` | museo_gg_pezzo | `20260716181500_museo_gg_pezzo.sql` |
| `20260717040620` | museo_gg_proposta | `20260717120000_museo_gg_proposta.sql` |
| `20260717041836` | domande_tesseramento_self_read | `20260717150000_domande_tesseramento_self_read.sql` |
| `20260717043252` | storia | `20260717170000_storia.sql` |
| `20260717080024` | museo_gg_fase_a_soci | `20260717190000_museo_gg_fase_a_soci.sql` |
| `20260717084102` | dashboard_admin_read_aal2 | `20260717210000_dashboard_admin_read_aal2.sql` |
| `20260717093150` | avatar_socio_storage | `20260717230000_avatar_socio_storage.sql` |
| `20260717094315` | v_storia_pubblica | `20260717233000_v_storia_pubblica.sql` |
| `20260717101115` | donazione_materiale | `20260718000000_donazione_materiale.sql` |
| `20260717121417` | community_feed | `20260718100000_community_feed.sql` |
| `20260717124815` | community_feed_fase3 | `20260718110000_community_feed_fase3.sql` |
| `20260717125645` | community_menzioni_rpc | `20260718120000_community_menzioni_rpc.sql` |
| `20260717145708` | riconoscimenti | `20260718200000_riconoscimenti.sql` |
| `20260721150554` | domande_tesseramento_metodo_scelto | `20260721120000_domande_tesseramento_metodo_scelto.sql` |
| `20260731124323` | radar_eventi | `20260731120000_radar_eventi.sql` |
| `20260801072938` | museo_gg_racconto | `20260801100000_museo_gg_racconto.sql` |
| `20260802011241` | allineamento_audit_completo | `20260802090000_allineamento_audit_completo.sql` |
| `20260802011303` | v_articoli_pubblici_solo_post | `20260802093000_v_articoli_pubblici_solo_post.sql` |
| `20260802053220` | v_articoli_pubblici_campi_seo | `20260802100000_v_articoli_pubblici_campi_seo.sql` |
| `20260802053654` | andreas_limite_soci_100_e_policy | `20260802103000_andreas_limite_soci_100_e_policy.sql` |
| `20260802055440` | articolo_flag_archivio | `20260802110000_articolo_flag_archivio.sql` |
| `20260802194755` | kb_pulizia_pre_maffei | `20260802150000_kb_pulizia_pre_maffei.sql` |
| `20260802210058` | pagamenti_sorgente_utm | `20260802160000_pagamenti_sorgente_utm.sql` |
| `20260803200803` | v_soci_in_regola | `20260803213000_v_soci_in_regola.sql` |
| `20260804012010` | solleciti_quota_e_viste_incassi | `20260804030000_solleciti_quota_e_viste_incassi.sql` |
| `20260804070358` | cron_solleciti_quota | `20260804090000_cron_solleciti_quota.sql` |
| `20260804091834` | lancia_solleciti_a_vuoto_per_difetto | `20260804093000_lancia_solleciti_a_vuoto_per_difetto.sql` |
| `20260804095023` | anagrafica_completa_socio | `20260804140000_anagrafica_completa_socio.sql` |
| `20260804101146` | config_app_chiavi_pubbliche | `20260804160000_config_app_chiavi_pubbliche.sql` |
| `20260804101753` | newsletter_iscritti_e_campagne | `20260804170000_newsletter_iscritti_e_campagne.sql` |
| `20260804101916` | newsletter_candidati_consenso | `20260804171000_newsletter_candidati_consenso.sql` |
| `20260804102343` | email_outbox_origini_newsletter | `20260804172000_email_outbox_origini_newsletter.sql` |
| `20260804105559` | newsletter_gruppo_tutti_i_soci | `20260804180000_newsletter_gruppo_tutti_i_soci.sql` |
| `20260804113805` | passaggio_anno | `20260804190000_passaggio_anno.sql` |
| `20260804122404` | numero_socio | `20260804200000_numero_socio.sql` |
| `20260804122900` | canale_istituzionale | `20260804210000_canale_istituzionale.sql` |
| `20260804125013` | compagine_sociale | `20260804220000_compagine_sociale.sql` |
| `20260804135618` | audit_db_chiusura | `20260804230000_audit_db_chiusura.sql` |
| `20260808080157` | plancia_misure_oneste_email_e_annunci | `20260808073000_plancia_misure_oneste_email_e_annunci.sql` |
| `20260808080729` | punti_lemma_anche_alla_nascita | `20260808080000_punti_lemma_anche_alla_nascita.sql` |
| `20260808081740` | punti_arretrati_al_primo_accesso | `20260808083000_punti_arretrati_al_primo_accesso.sql` |
| `20260808085746` | reazioni_fondamenta | `20260808090000_reazioni_fondamenta.sql` |
| `20260808152021` | guardie_che_gridano_invece_di_tacere | `20260808110000_guardie_che_gridano_invece_di_tacere.sql` |
| `20260808154833` | commenti_ai_termini | `20260808120000_commenti_ai_termini.sql` |
| `20260808160740` | ocr_trascrizioni | `20260808130000_ocr_trascrizioni.sql` |
| `20260809003948` | nome_una_fonte_sola | `20260809020000_nome_una_fonte_sola.sql` |
| `20260823215431` | luoghi_georeferenziazione_e_toponomastica | `20260823090000_luoghi_georeferenziazione_e_toponomastica.sql` |
| `20260823215806` | luoghi_viste_pubbliche_gate_toponimo_validato | `20260823093000_luoghi_viste_pubbliche_gate_toponimo_validato.sql` |
| `20260823215825` | geocodifica_coda_un_secondo | `20260823094000_geocodifica_coda_un_secondo.sql` |
| `20260824114856` | soci_collegamento_manuale_domanda_account | `20260824100000_soci_collegamento_manuale_domanda_account.sql` |
| `20260824115245` | luoghi_immagini | `20260824080000_luoghi_immagini.sql` |
| `20260825115508` | memoria_dati_fondo_male | `20260825135000_memoria_dati_fondo_male.sql` |
| `20260825151014` | memoria_rimuovi_termine_redento | `20260825160000_memoria_rimuovi_termine_redento.sql` |
| `20260825153050` | memoria_fondo_slug_breve | `20260825170000_memoria_fondo_slug_breve.sql` |
| `20260825153417` | memoria_fondo_racconto_html | `20260825171000_memoria_fondo_racconto_html.sql` |
| `20260825194034` | memoria_fondo_pubblico_execute_anon | `20260826110000_memoria_fondo_pubblico_execute_anon.sql` |
| `20260825202042` | memoria_racconto_correzione_storica_italofoni | `20260826120000_memoria_racconto_correzione_storica_italofoni.sql` |
| `20260826140518` | memoria_fondo_protocollo_anno_pratica | `20260826140000_memoria_fondo_protocollo_anno_pratica.sql` |
| `20260828211421` | salvataggio_settimanale | `20260828120000_salvataggio_settimanale.sql` |
| `20260830212112` | socio_storico | `20260830090000_socio_storico.sql` |
| `20260902164115` | guardiani_marketing_invitato_il | `20260902120000_guardiani_marketing_invitato_il.sql` |
| `20260902165313` | variante_candidate_parlata_paese | `20260902130000_variante_candidate_parlata_paese.sql` |
| `20260902165855` | dizionario_lemma_tipo_scotum | `20260902140000_dizionario_lemma_tipo_scotum.sql` |
| `20260915012305` | priv05_informativa_versione | `20260915100000_priv05_informativa_versione.sql` |

Comandi, **solo dopo la conferma del contenuto**:

```bash
supabase migration repair --status reverted 20260716093126 --project-ref wacknihvdjxltiqvxtqr   # telegram_notifica  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260716112508 --project-ref wacknihvdjxltiqvxtqr   # custodi_tassonomia  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260716114757 --project-ref wacknihvdjxltiqvxtqr   # custodi_curatela_rls  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260716154313 --project-ref wacknihvdjxltiqvxtqr   # grande_guerra_sezione  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260716170950 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_pezzo  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717040620 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_proposta  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717041836 --project-ref wacknihvdjxltiqvxtqr   # domande_tesseramento_self_read  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717043252 --project-ref wacknihvdjxltiqvxtqr   # storia  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717080024 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_fase_a_soci  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717084102 --project-ref wacknihvdjxltiqvxtqr   # dashboard_admin_read_aal2  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717093150 --project-ref wacknihvdjxltiqvxtqr   # avatar_socio_storage  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717094315 --project-ref wacknihvdjxltiqvxtqr   # v_storia_pubblica  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717101115 --project-ref wacknihvdjxltiqvxtqr   # donazione_materiale  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717121417 --project-ref wacknihvdjxltiqvxtqr   # community_feed  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717124815 --project-ref wacknihvdjxltiqvxtqr   # community_feed_fase3  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717125645 --project-ref wacknihvdjxltiqvxtqr   # community_menzioni_rpc  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260717145708 --project-ref wacknihvdjxltiqvxtqr   # riconoscimenti  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260721150554 --project-ref wacknihvdjxltiqvxtqr   # domande_tesseramento_metodo_scelto  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260731124323 --project-ref wacknihvdjxltiqvxtqr   # radar_eventi  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260801072938 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_racconto  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260802011241 --project-ref wacknihvdjxltiqvxtqr   # allineamento_audit_completo  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260802011303 --project-ref wacknihvdjxltiqvxtqr   # v_articoli_pubblici_solo_post  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260802053220 --project-ref wacknihvdjxltiqvxtqr   # v_articoli_pubblici_campi_seo  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260802053654 --project-ref wacknihvdjxltiqvxtqr   # andreas_limite_soci_100_e_policy  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260802055440 --project-ref wacknihvdjxltiqvxtqr   # articolo_flag_archivio  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260802194755 --project-ref wacknihvdjxltiqvxtqr   # kb_pulizia_pre_maffei  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260802210058 --project-ref wacknihvdjxltiqvxtqr   # pagamenti_sorgente_utm  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260803200803 --project-ref wacknihvdjxltiqvxtqr   # v_soci_in_regola  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804012010 --project-ref wacknihvdjxltiqvxtqr   # solleciti_quota_e_viste_incassi  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804070358 --project-ref wacknihvdjxltiqvxtqr   # cron_solleciti_quota  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804091834 --project-ref wacknihvdjxltiqvxtqr   # lancia_solleciti_a_vuoto_per_difetto  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804095023 --project-ref wacknihvdjxltiqvxtqr   # anagrafica_completa_socio  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804101146 --project-ref wacknihvdjxltiqvxtqr   # config_app_chiavi_pubbliche  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804101753 --project-ref wacknihvdjxltiqvxtqr   # newsletter_iscritti_e_campagne  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804101916 --project-ref wacknihvdjxltiqvxtqr   # newsletter_candidati_consenso  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804102343 --project-ref wacknihvdjxltiqvxtqr   # email_outbox_origini_newsletter  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804105559 --project-ref wacknihvdjxltiqvxtqr   # newsletter_gruppo_tutti_i_soci  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804113805 --project-ref wacknihvdjxltiqvxtqr   # passaggio_anno  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804122404 --project-ref wacknihvdjxltiqvxtqr   # numero_socio  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804122900 --project-ref wacknihvdjxltiqvxtqr   # canale_istituzionale  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804125013 --project-ref wacknihvdjxltiqvxtqr   # compagine_sociale  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260804135618 --project-ref wacknihvdjxltiqvxtqr   # audit_db_chiusura  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260808080157 --project-ref wacknihvdjxltiqvxtqr   # plancia_misure_oneste_email_e_annunci  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260808080729 --project-ref wacknihvdjxltiqvxtqr   # punti_lemma_anche_alla_nascita  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260808081740 --project-ref wacknihvdjxltiqvxtqr   # punti_arretrati_al_primo_accesso  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260808085746 --project-ref wacknihvdjxltiqvxtqr   # reazioni_fondamenta  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260808152021 --project-ref wacknihvdjxltiqvxtqr   # guardie_che_gridano_invece_di_tacere  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260808154833 --project-ref wacknihvdjxltiqvxtqr   # commenti_ai_termini  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260808160740 --project-ref wacknihvdjxltiqvxtqr   # ocr_trascrizioni  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260809003948 --project-ref wacknihvdjxltiqvxtqr   # nome_una_fonte_sola  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260823215431 --project-ref wacknihvdjxltiqvxtqr   # luoghi_georeferenziazione_e_toponomastica  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260823215806 --project-ref wacknihvdjxltiqvxtqr   # luoghi_viste_pubbliche_gate_toponimo_validato  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260823215825 --project-ref wacknihvdjxltiqvxtqr   # geocodifica_coda_un_secondo  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260824114856 --project-ref wacknihvdjxltiqvxtqr   # soci_collegamento_manuale_domanda_account  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260824115245 --project-ref wacknihvdjxltiqvxtqr   # luoghi_immagini  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260825115508 --project-ref wacknihvdjxltiqvxtqr   # memoria_dati_fondo_male  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260825151014 --project-ref wacknihvdjxltiqvxtqr   # memoria_rimuovi_termine_redento  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260825153050 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_slug_breve  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260825153417 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_racconto_html  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260825194034 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_pubblico_execute_anon  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260825202042 --project-ref wacknihvdjxltiqvxtqr   # memoria_racconto_correzione_storica_italofoni  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260826140518 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_protocollo_anno_pratica  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260828211421 --project-ref wacknihvdjxltiqvxtqr   # salvataggio_settimanale  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260830212112 --project-ref wacknihvdjxltiqvxtqr   # socio_storico  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260902164115 --project-ref wacknihvdjxltiqvxtqr   # guardiani_marketing_invitato_il  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260902165313 --project-ref wacknihvdjxltiqvxtqr   # variante_candidate_parlata_paese  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260902165855 --project-ref wacknihvdjxltiqvxtqr   # dizionario_lemma_tipo_scotum  (SOLO DOPO CONFERMA)
supabase migration repair --status reverted 20260915012305 --project-ref wacknihvdjxltiqvxtqr   # priv05_informativa_versione  (SOLO DOPO CONFERMA)
```

### B3. Le altre (125): nessun file locale con lo stesso nome

Sono migrazioni applicate via MCP (o dallo SQL editor) fra luglio e settembre
2026 di cui il repository non ha traccia con quel nome. Per alcune il
contenuto è probabilmente in un file locale con nome diverso (sezione A2, i
21 senza omonima); per le altre è lavoro che vive solo nel database. Vanno
valutate col criterio scritto sopra, e nessuna va marcata `reverted` in questa
sede.

| Versione | Nome |
|---|---|
| `20260716164839` | forum_rls_complete_fase1 |
| `20260716164917` | corso_vetrina_ponte_noslab_learn |
| `20260717141224` | convenzioni_beneficio_sintetico |
| `20260718042409` | motore_notifiche |
| `20260718043139` | vista_classifica |
| `20260718045015` | grant_select_v_classifica_authenticated |
| `20260718064207` | webhook_notifica_invia_push |
| `20260718064417` | hardening_rpc_anonime |
| `20260718084346` | blindatura_gamification |
| `20260718091729` | pagamento_contanti |
| `20260718111906` | performance_indici_e_rls |
| `20260718111948` | campi_seo |
| `20260718113754` | pulizia_rls_doppio_annidamento |
| `20260718133603` | spunto_settimana |
| `20260718140759` | registro_consensi |
| `20260718164153` | v_luoghi_pagina |
| `20260718164417` | v_luoghi_mappa_con_slug |
| `20260718170534` | rpc_riconciliazione_contanti |
| `20260718210400` | backup_corpo_html_pre_migrazione_img |
| `20260718213257` | backup_corpo_html_pre_migrazione |
| `20260718213712` | rimuovi_backup_corpo_html |
| `20260718214358` | v_articoli_seo |
| `20260718215457` | backup_titoli_pre_riscrittura |
| `20260718221846` | v_articoli_seo_con_copertina |
| `20260719064253` | video_playlist_serie_youtube |
| `20260719141002` | quindici_luoghi_val_di_non |
| `20260720044103` | backup_meta_description_pre_riscrittura |
| `20260720044259` | drop_video_playlist_non_usata |
| `20260720222946` | pagamenti_stato_scaduto_e_igiene |
| `20260721042453` | solleciti_domande_direttivo |
| `20260721043615` | email_outbox_invio_da_chat_e_pannello |
| `20260721045454` | rls_curatore_museo_gg |
| `20260721045519` | bucket_donazioni_curatore |
| `20260721082633` | convenzioni_punti_vendita |
| `20260721083404` | convenzioni_punti_extra_grezzi |
| `20260721093949` | fix_rls_convenzioni_punti_anon |
| `20260721124958` | get_mia_tessera_rpc |
| `20260721125631` | get_mia_tessera_robustezza |
| `20260727145404` | tipo_sorgente_manuale_linguistico |
| `20260729163001` | donazione_materiale_donatori_esterni |
| `20260729170858` | donazione_materiale_donatore_id_nullable |
| `20260801074206` | museo_gg_guardia_riconosce_curatore |
| `20260801211036` | eventi_esterni_slug |
| `20260802065237` | articolo_estratto_ripiego |
| `20260802100038` | ai_consuma_quota_atomica |
| `20260802101120` | ai_somma_token |
| `20260802131155` | ai_config_admin_capo |
| `20260804013650` | quota_anno_e_posizioni_soci |
| `20260804013749` | v_soci_distingue_annullata_da_respinta |
| `20260804050712` | revoca_execute_funzioni_nuove |
| `20260804050802` | revoca_execute_da_public |
| `20260804105628` | newsletter_destinatari_dedup_per_indirizzo |
| `20260804123213` | candidati_consenso_niente_fantasmi |
| `20260806145314` | associati_identita_per_numero_socio |
| `20260806150349` | soci_senza_ruolo_controllo |
| `20260808135305` | correzioni_ai_lemmi |
| `20260808152558` | traccia_modifiche_dopo_la_pubblicazione |
| `20260808152712` | vista_modifiche_recenti |
| `20260808194758` | fix_audit_viste_invoker |
| `20260808194939` | audit_revoca_execute_anon |
| `20260810043041` | glossario_console_fondamenta |
| `20260810043140` | glossario_vocabolario_controllato |
| `20260810043310` | glossario_qualita_e_proposte_variante |
| `20260810043414` | glossario_candidate_anche_stessa_parlata |
| `20260810043725` | glossario_voce_e_punteggio |
| `20260810043850` | glossario_guardia_e_correzione_in_blocco |
| `20260810043925` | glossario_miei_lemmi |
| `20260810045919` | glossario_stato_ritirato_ammesso |
| `20260810100156` | glossario_definizione_o_esempio |
| `20260810103453` | guardiani_digest_solo_se_c_e_del_nuovo |
| `20260810104223` | guardiani_digest_destinatari_in_configurazione |
| `20260810110417` | glossario_chiudi_letture_anon |
| `20260810111020` | plancia_lemmi_portano_alla_console |
| `20260810112532` | glossario_stringi_permessi_funzioni_e_viste |
| `20260810114656` | sentinella_pagine_pubbliche |
| `20260810114806` | plancia_vede_le_pagine_rotte |
| `20260810114843` | sentinella_niente_anon |
| `20260810120107` | audit_indici_e_potatura_limiti |
| `20260811090621` | libro_adunanze_trigger_storico_e_divieto_cancellazione |
| `20260811090738` | libro_adunanze_ricerca_delibere_e_documenti_storici |
| `20260811090851` | assemblea_deleghe_presenze_quorum |
| `20260811090953` | prima_nota_e_raccolte_fondi |
| `20260811091236` | rendiconto_per_cassa_modello_d |
| `20260811091359` | convocazione_assemblea_termine_e_scadenze |
| `20260811091725` | comunicazione_stato_inviata_con_errori |
| `20260811111902` | quorum_meta_esatta_e_anzianita_tre_mesi |
| `20260811112517` | rimuovi_trigger_storico_duplicati |
| `20260811112727` | libri_sociali_permessi_di_tabella |
| `20260811133837` | rendiconto_include_donazioni_paypal |
| `20260811140700` | contanti_non_ripetibile_per_persona_non_per_email |
| `20260813093330` | ocr_trascrizioni_confermate_leggibili_in_pagina |
| `20260813093957` | ocr_policy_usa_funzione_definer |
| `20260815150858` | ocr_trascrizione_lettura_soci_storia |
| `20260817152819` | luoghi_interesse_toponimi_e_curatela |
| `20260817180501` | curatore_contenuti_e_registro_modifiche |
| `20260817180604` | registro_curatela_revoca_rpc_pubblico |
| `20260817193941` | ricerca_archivio |
| `20260819025058` | v_storia_pubblica_security_invoker |
| `20260819025621` | v_luoghi_mappa_pagina_security_invoker |
| `20260819030209` | convenzioni_viste_security_invoker |
| `20260819032040` | utente_grant_per_colonna_chiude_falla |
| `20260819033011` | utente_update_solo_mostra_livello |
| `20260819033116` | revoke_execute_from_public_otto_funzioni |
| `20260819043355` | tessera_verifica_nome_mascherato_e_validita |
| `20260819094231` | eventi_e_trascrizioni_security_invoker |
| `20260819094416` | articoli_viste_security_invoker |
| `20260819113349` | custodi_vocabolario_relazioni_security_invoker |
| `20260823163109` | contanti_cerca_socio_ricerca_direttivo |
| `20260824123242` | lezione_immagine_e_fonte |
| `20260824131215` | lezione_video_bunny |
| `20260824151042` | luoghi_gate_etimologia_toponimo_validato |
| `20260824151116` | luoghi_revoca_esecuzione_anon_funzioni |
| `20260824161813` | e_socio_in_regola_legge_fonte_autorevole |
| `20260824215531` | audit_2026_08_24_auth_rls_initplan |
| `20260824215559` | audit_2026_08_24_indici_fk_mancanti |
| `20260824215624` | audit_2026_08_24_indice_duplicato_e_funzioni_senza_guardia |
| `20260824215722` | audit_2026_08_24_correzione_guardia_cron |
| `20260825035401` | memoria_impero_fondi_e_persone |
| `20260825115108` | memoria_slug_e_viste_pubbliche |
| `20260825115854` | memoria_lettura_bozza_per_slug |
| `20260825152142` | memoria_eventi_militari |
| `20260825152944` | memoria_fondo_pubblico_planimetria_geo |
| `20260825153433` | memoria_fondo_pubblico_racconto_html |
| `20260825154918` | memoria_evento_pubblico_e_arricchimento_persona |
| `20260825155143` | memoria_fondo_racconto_html_completo |

Comandi, elencati per completezza e **da non lanciare** senza una decisione per
riga:

```bash
supabase migration repair --status reverted 20260716164839 --project-ref wacknihvdjxltiqvxtqr   # forum_rls_complete_fase1  (DA DECIDERE)
supabase migration repair --status reverted 20260716164917 --project-ref wacknihvdjxltiqvxtqr   # corso_vetrina_ponte_noslab_learn  (DA DECIDERE)
supabase migration repair --status reverted 20260717141224 --project-ref wacknihvdjxltiqvxtqr   # convenzioni_beneficio_sintetico  (DA DECIDERE)
supabase migration repair --status reverted 20260718042409 --project-ref wacknihvdjxltiqvxtqr   # motore_notifiche  (DA DECIDERE)
supabase migration repair --status reverted 20260718043139 --project-ref wacknihvdjxltiqvxtqr   # vista_classifica  (DA DECIDERE)
supabase migration repair --status reverted 20260718045015 --project-ref wacknihvdjxltiqvxtqr   # grant_select_v_classifica_authenticated  (DA DECIDERE)
supabase migration repair --status reverted 20260718064207 --project-ref wacknihvdjxltiqvxtqr   # webhook_notifica_invia_push  (DA DECIDERE)
supabase migration repair --status reverted 20260718064417 --project-ref wacknihvdjxltiqvxtqr   # hardening_rpc_anonime  (DA DECIDERE)
supabase migration repair --status reverted 20260718084346 --project-ref wacknihvdjxltiqvxtqr   # blindatura_gamification  (DA DECIDERE)
supabase migration repair --status reverted 20260718091729 --project-ref wacknihvdjxltiqvxtqr   # pagamento_contanti  (DA DECIDERE)
supabase migration repair --status reverted 20260718111906 --project-ref wacknihvdjxltiqvxtqr   # performance_indici_e_rls  (DA DECIDERE)
supabase migration repair --status reverted 20260718111948 --project-ref wacknihvdjxltiqvxtqr   # campi_seo  (DA DECIDERE)
supabase migration repair --status reverted 20260718113754 --project-ref wacknihvdjxltiqvxtqr   # pulizia_rls_doppio_annidamento  (DA DECIDERE)
supabase migration repair --status reverted 20260718133603 --project-ref wacknihvdjxltiqvxtqr   # spunto_settimana  (DA DECIDERE)
supabase migration repair --status reverted 20260718140759 --project-ref wacknihvdjxltiqvxtqr   # registro_consensi  (DA DECIDERE)
supabase migration repair --status reverted 20260718164153 --project-ref wacknihvdjxltiqvxtqr   # v_luoghi_pagina  (DA DECIDERE)
supabase migration repair --status reverted 20260718164417 --project-ref wacknihvdjxltiqvxtqr   # v_luoghi_mappa_con_slug  (DA DECIDERE)
supabase migration repair --status reverted 20260718170534 --project-ref wacknihvdjxltiqvxtqr   # rpc_riconciliazione_contanti  (DA DECIDERE)
supabase migration repair --status reverted 20260718210400 --project-ref wacknihvdjxltiqvxtqr   # backup_corpo_html_pre_migrazione_img  (DA DECIDERE)
supabase migration repair --status reverted 20260718213257 --project-ref wacknihvdjxltiqvxtqr   # backup_corpo_html_pre_migrazione  (DA DECIDERE)
supabase migration repair --status reverted 20260718213712 --project-ref wacknihvdjxltiqvxtqr   # rimuovi_backup_corpo_html  (DA DECIDERE)
supabase migration repair --status reverted 20260718214358 --project-ref wacknihvdjxltiqvxtqr   # v_articoli_seo  (DA DECIDERE)
supabase migration repair --status reverted 20260718215457 --project-ref wacknihvdjxltiqvxtqr   # backup_titoli_pre_riscrittura  (DA DECIDERE)
supabase migration repair --status reverted 20260718221846 --project-ref wacknihvdjxltiqvxtqr   # v_articoli_seo_con_copertina  (DA DECIDERE)
supabase migration repair --status reverted 20260719064253 --project-ref wacknihvdjxltiqvxtqr   # video_playlist_serie_youtube  (DA DECIDERE)
supabase migration repair --status reverted 20260719141002 --project-ref wacknihvdjxltiqvxtqr   # quindici_luoghi_val_di_non  (DA DECIDERE)
supabase migration repair --status reverted 20260720044103 --project-ref wacknihvdjxltiqvxtqr   # backup_meta_description_pre_riscrittura  (DA DECIDERE)
supabase migration repair --status reverted 20260720044259 --project-ref wacknihvdjxltiqvxtqr   # drop_video_playlist_non_usata  (DA DECIDERE)
supabase migration repair --status reverted 20260720222946 --project-ref wacknihvdjxltiqvxtqr   # pagamenti_stato_scaduto_e_igiene  (DA DECIDERE)
supabase migration repair --status reverted 20260721042453 --project-ref wacknihvdjxltiqvxtqr   # solleciti_domande_direttivo  (DA DECIDERE)
supabase migration repair --status reverted 20260721043615 --project-ref wacknihvdjxltiqvxtqr   # email_outbox_invio_da_chat_e_pannello  (DA DECIDERE)
supabase migration repair --status reverted 20260721045454 --project-ref wacknihvdjxltiqvxtqr   # rls_curatore_museo_gg  (DA DECIDERE)
supabase migration repair --status reverted 20260721045519 --project-ref wacknihvdjxltiqvxtqr   # bucket_donazioni_curatore  (DA DECIDERE)
supabase migration repair --status reverted 20260721082633 --project-ref wacknihvdjxltiqvxtqr   # convenzioni_punti_vendita  (DA DECIDERE)
supabase migration repair --status reverted 20260721083404 --project-ref wacknihvdjxltiqvxtqr   # convenzioni_punti_extra_grezzi  (DA DECIDERE)
supabase migration repair --status reverted 20260721093949 --project-ref wacknihvdjxltiqvxtqr   # fix_rls_convenzioni_punti_anon  (DA DECIDERE)
supabase migration repair --status reverted 20260721124958 --project-ref wacknihvdjxltiqvxtqr   # get_mia_tessera_rpc  (DA DECIDERE)
supabase migration repair --status reverted 20260721125631 --project-ref wacknihvdjxltiqvxtqr   # get_mia_tessera_robustezza  (DA DECIDERE)
supabase migration repair --status reverted 20260727145404 --project-ref wacknihvdjxltiqvxtqr   # tipo_sorgente_manuale_linguistico  (DA DECIDERE)
supabase migration repair --status reverted 20260729163001 --project-ref wacknihvdjxltiqvxtqr   # donazione_materiale_donatori_esterni  (DA DECIDERE)
supabase migration repair --status reverted 20260729170858 --project-ref wacknihvdjxltiqvxtqr   # donazione_materiale_donatore_id_nullable  (DA DECIDERE)
supabase migration repair --status reverted 20260801074206 --project-ref wacknihvdjxltiqvxtqr   # museo_gg_guardia_riconosce_curatore  (DA DECIDERE)
supabase migration repair --status reverted 20260801211036 --project-ref wacknihvdjxltiqvxtqr   # eventi_esterni_slug  (DA DECIDERE)
supabase migration repair --status reverted 20260802065237 --project-ref wacknihvdjxltiqvxtqr   # articolo_estratto_ripiego  (DA DECIDERE)
supabase migration repair --status reverted 20260802100038 --project-ref wacknihvdjxltiqvxtqr   # ai_consuma_quota_atomica  (DA DECIDERE)
supabase migration repair --status reverted 20260802101120 --project-ref wacknihvdjxltiqvxtqr   # ai_somma_token  (DA DECIDERE)
supabase migration repair --status reverted 20260802131155 --project-ref wacknihvdjxltiqvxtqr   # ai_config_admin_capo  (DA DECIDERE)
supabase migration repair --status reverted 20260804013650 --project-ref wacknihvdjxltiqvxtqr   # quota_anno_e_posizioni_soci  (DA DECIDERE)
supabase migration repair --status reverted 20260804013749 --project-ref wacknihvdjxltiqvxtqr   # v_soci_distingue_annullata_da_respinta  (DA DECIDERE)
supabase migration repair --status reverted 20260804050712 --project-ref wacknihvdjxltiqvxtqr   # revoca_execute_funzioni_nuove  (DA DECIDERE)
supabase migration repair --status reverted 20260804050802 --project-ref wacknihvdjxltiqvxtqr   # revoca_execute_da_public  (DA DECIDERE)
supabase migration repair --status reverted 20260804105628 --project-ref wacknihvdjxltiqvxtqr   # newsletter_destinatari_dedup_per_indirizzo  (DA DECIDERE)
supabase migration repair --status reverted 20260804123213 --project-ref wacknihvdjxltiqvxtqr   # candidati_consenso_niente_fantasmi  (DA DECIDERE)
supabase migration repair --status reverted 20260806145314 --project-ref wacknihvdjxltiqvxtqr   # associati_identita_per_numero_socio  (DA DECIDERE)
supabase migration repair --status reverted 20260806150349 --project-ref wacknihvdjxltiqvxtqr   # soci_senza_ruolo_controllo  (DA DECIDERE)
supabase migration repair --status reverted 20260808135305 --project-ref wacknihvdjxltiqvxtqr   # correzioni_ai_lemmi  (DA DECIDERE)
supabase migration repair --status reverted 20260808152558 --project-ref wacknihvdjxltiqvxtqr   # traccia_modifiche_dopo_la_pubblicazione  (DA DECIDERE)
supabase migration repair --status reverted 20260808152712 --project-ref wacknihvdjxltiqvxtqr   # vista_modifiche_recenti  (DA DECIDERE)
supabase migration repair --status reverted 20260808194758 --project-ref wacknihvdjxltiqvxtqr   # fix_audit_viste_invoker  (DA DECIDERE)
supabase migration repair --status reverted 20260808194939 --project-ref wacknihvdjxltiqvxtqr   # audit_revoca_execute_anon  (DA DECIDERE)
supabase migration repair --status reverted 20260810043041 --project-ref wacknihvdjxltiqvxtqr   # glossario_console_fondamenta  (DA DECIDERE)
supabase migration repair --status reverted 20260810043140 --project-ref wacknihvdjxltiqvxtqr   # glossario_vocabolario_controllato  (DA DECIDERE)
supabase migration repair --status reverted 20260810043310 --project-ref wacknihvdjxltiqvxtqr   # glossario_qualita_e_proposte_variante  (DA DECIDERE)
supabase migration repair --status reverted 20260810043414 --project-ref wacknihvdjxltiqvxtqr   # glossario_candidate_anche_stessa_parlata  (DA DECIDERE)
supabase migration repair --status reverted 20260810043725 --project-ref wacknihvdjxltiqvxtqr   # glossario_voce_e_punteggio  (DA DECIDERE)
supabase migration repair --status reverted 20260810043850 --project-ref wacknihvdjxltiqvxtqr   # glossario_guardia_e_correzione_in_blocco  (DA DECIDERE)
supabase migration repair --status reverted 20260810043925 --project-ref wacknihvdjxltiqvxtqr   # glossario_miei_lemmi  (DA DECIDERE)
supabase migration repair --status reverted 20260810045919 --project-ref wacknihvdjxltiqvxtqr   # glossario_stato_ritirato_ammesso  (DA DECIDERE)
supabase migration repair --status reverted 20260810100156 --project-ref wacknihvdjxltiqvxtqr   # glossario_definizione_o_esempio  (DA DECIDERE)
supabase migration repair --status reverted 20260810103453 --project-ref wacknihvdjxltiqvxtqr   # guardiani_digest_solo_se_c_e_del_nuovo  (DA DECIDERE)
supabase migration repair --status reverted 20260810104223 --project-ref wacknihvdjxltiqvxtqr   # guardiani_digest_destinatari_in_configurazione  (DA DECIDERE)
supabase migration repair --status reverted 20260810110417 --project-ref wacknihvdjxltiqvxtqr   # glossario_chiudi_letture_anon  (DA DECIDERE)
supabase migration repair --status reverted 20260810111020 --project-ref wacknihvdjxltiqvxtqr   # plancia_lemmi_portano_alla_console  (DA DECIDERE)
supabase migration repair --status reverted 20260810112532 --project-ref wacknihvdjxltiqvxtqr   # glossario_stringi_permessi_funzioni_e_viste  (DA DECIDERE)
supabase migration repair --status reverted 20260810114656 --project-ref wacknihvdjxltiqvxtqr   # sentinella_pagine_pubbliche  (DA DECIDERE)
supabase migration repair --status reverted 20260810114806 --project-ref wacknihvdjxltiqvxtqr   # plancia_vede_le_pagine_rotte  (DA DECIDERE)
supabase migration repair --status reverted 20260810114843 --project-ref wacknihvdjxltiqvxtqr   # sentinella_niente_anon  (DA DECIDERE)
supabase migration repair --status reverted 20260810120107 --project-ref wacknihvdjxltiqvxtqr   # audit_indici_e_potatura_limiti  (DA DECIDERE)
supabase migration repair --status reverted 20260811090621 --project-ref wacknihvdjxltiqvxtqr   # libro_adunanze_trigger_storico_e_divieto_cancellazione  (DA DECIDERE)
supabase migration repair --status reverted 20260811090738 --project-ref wacknihvdjxltiqvxtqr   # libro_adunanze_ricerca_delibere_e_documenti_storici  (DA DECIDERE)
supabase migration repair --status reverted 20260811090851 --project-ref wacknihvdjxltiqvxtqr   # assemblea_deleghe_presenze_quorum  (DA DECIDERE)
supabase migration repair --status reverted 20260811090953 --project-ref wacknihvdjxltiqvxtqr   # prima_nota_e_raccolte_fondi  (DA DECIDERE)
supabase migration repair --status reverted 20260811091236 --project-ref wacknihvdjxltiqvxtqr   # rendiconto_per_cassa_modello_d  (DA DECIDERE)
supabase migration repair --status reverted 20260811091359 --project-ref wacknihvdjxltiqvxtqr   # convocazione_assemblea_termine_e_scadenze  (DA DECIDERE)
supabase migration repair --status reverted 20260811091725 --project-ref wacknihvdjxltiqvxtqr   # comunicazione_stato_inviata_con_errori  (DA DECIDERE)
supabase migration repair --status reverted 20260811111902 --project-ref wacknihvdjxltiqvxtqr   # quorum_meta_esatta_e_anzianita_tre_mesi  (DA DECIDERE)
supabase migration repair --status reverted 20260811112517 --project-ref wacknihvdjxltiqvxtqr   # rimuovi_trigger_storico_duplicati  (DA DECIDERE)
supabase migration repair --status reverted 20260811112727 --project-ref wacknihvdjxltiqvxtqr   # libri_sociali_permessi_di_tabella  (DA DECIDERE)
supabase migration repair --status reverted 20260811133837 --project-ref wacknihvdjxltiqvxtqr   # rendiconto_include_donazioni_paypal  (DA DECIDERE)
supabase migration repair --status reverted 20260811140700 --project-ref wacknihvdjxltiqvxtqr   # contanti_non_ripetibile_per_persona_non_per_email  (DA DECIDERE)
supabase migration repair --status reverted 20260813093330 --project-ref wacknihvdjxltiqvxtqr   # ocr_trascrizioni_confermate_leggibili_in_pagina  (DA DECIDERE)
supabase migration repair --status reverted 20260813093957 --project-ref wacknihvdjxltiqvxtqr   # ocr_policy_usa_funzione_definer  (DA DECIDERE)
supabase migration repair --status reverted 20260815150858 --project-ref wacknihvdjxltiqvxtqr   # ocr_trascrizione_lettura_soci_storia  (DA DECIDERE)
supabase migration repair --status reverted 20260817152819 --project-ref wacknihvdjxltiqvxtqr   # luoghi_interesse_toponimi_e_curatela  (DA DECIDERE)
supabase migration repair --status reverted 20260817180501 --project-ref wacknihvdjxltiqvxtqr   # curatore_contenuti_e_registro_modifiche  (DA DECIDERE)
supabase migration repair --status reverted 20260817180604 --project-ref wacknihvdjxltiqvxtqr   # registro_curatela_revoca_rpc_pubblico  (DA DECIDERE)
supabase migration repair --status reverted 20260817193941 --project-ref wacknihvdjxltiqvxtqr   # ricerca_archivio  (DA DECIDERE)
supabase migration repair --status reverted 20260819025058 --project-ref wacknihvdjxltiqvxtqr   # v_storia_pubblica_security_invoker  (DA DECIDERE)
supabase migration repair --status reverted 20260819025621 --project-ref wacknihvdjxltiqvxtqr   # v_luoghi_mappa_pagina_security_invoker  (DA DECIDERE)
supabase migration repair --status reverted 20260819030209 --project-ref wacknihvdjxltiqvxtqr   # convenzioni_viste_security_invoker  (DA DECIDERE)
supabase migration repair --status reverted 20260819032040 --project-ref wacknihvdjxltiqvxtqr   # utente_grant_per_colonna_chiude_falla  (DA DECIDERE)
supabase migration repair --status reverted 20260819033011 --project-ref wacknihvdjxltiqvxtqr   # utente_update_solo_mostra_livello  (DA DECIDERE)
supabase migration repair --status reverted 20260819033116 --project-ref wacknihvdjxltiqvxtqr   # revoke_execute_from_public_otto_funzioni  (DA DECIDERE)
supabase migration repair --status reverted 20260819043355 --project-ref wacknihvdjxltiqvxtqr   # tessera_verifica_nome_mascherato_e_validita  (DA DECIDERE)
supabase migration repair --status reverted 20260819094231 --project-ref wacknihvdjxltiqvxtqr   # eventi_e_trascrizioni_security_invoker  (DA DECIDERE)
supabase migration repair --status reverted 20260819094416 --project-ref wacknihvdjxltiqvxtqr   # articoli_viste_security_invoker  (DA DECIDERE)
supabase migration repair --status reverted 20260819113349 --project-ref wacknihvdjxltiqvxtqr   # custodi_vocabolario_relazioni_security_invoker  (DA DECIDERE)
supabase migration repair --status reverted 20260823163109 --project-ref wacknihvdjxltiqvxtqr   # contanti_cerca_socio_ricerca_direttivo  (DA DECIDERE)
supabase migration repair --status reverted 20260824123242 --project-ref wacknihvdjxltiqvxtqr   # lezione_immagine_e_fonte  (DA DECIDERE)
supabase migration repair --status reverted 20260824131215 --project-ref wacknihvdjxltiqvxtqr   # lezione_video_bunny  (DA DECIDERE)
supabase migration repair --status reverted 20260824151042 --project-ref wacknihvdjxltiqvxtqr   # luoghi_gate_etimologia_toponimo_validato  (DA DECIDERE)
supabase migration repair --status reverted 20260824151116 --project-ref wacknihvdjxltiqvxtqr   # luoghi_revoca_esecuzione_anon_funzioni  (DA DECIDERE)
supabase migration repair --status reverted 20260824161813 --project-ref wacknihvdjxltiqvxtqr   # e_socio_in_regola_legge_fonte_autorevole  (DA DECIDERE)
supabase migration repair --status reverted 20260824215531 --project-ref wacknihvdjxltiqvxtqr   # audit_2026_08_24_auth_rls_initplan  (DA DECIDERE)
supabase migration repair --status reverted 20260824215559 --project-ref wacknihvdjxltiqvxtqr   # audit_2026_08_24_indici_fk_mancanti  (DA DECIDERE)
supabase migration repair --status reverted 20260824215624 --project-ref wacknihvdjxltiqvxtqr   # audit_2026_08_24_indice_duplicato_e_funzioni_senza_guardia  (DA DECIDERE)
supabase migration repair --status reverted 20260824215722 --project-ref wacknihvdjxltiqvxtqr   # audit_2026_08_24_correzione_guardia_cron  (DA DECIDERE)
supabase migration repair --status reverted 20260825035401 --project-ref wacknihvdjxltiqvxtqr   # memoria_impero_fondi_e_persone  (DA DECIDERE)
supabase migration repair --status reverted 20260825115108 --project-ref wacknihvdjxltiqvxtqr   # memoria_slug_e_viste_pubbliche  (DA DECIDERE)
supabase migration repair --status reverted 20260825115854 --project-ref wacknihvdjxltiqvxtqr   # memoria_lettura_bozza_per_slug  (DA DECIDERE)
supabase migration repair --status reverted 20260825152142 --project-ref wacknihvdjxltiqvxtqr   # memoria_eventi_militari  (DA DECIDERE)
supabase migration repair --status reverted 20260825152944 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_pubblico_planimetria_geo  (DA DECIDERE)
supabase migration repair --status reverted 20260825153433 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_pubblico_racconto_html  (DA DECIDERE)
supabase migration repair --status reverted 20260825154918 --project-ref wacknihvdjxltiqvxtqr   # memoria_evento_pubblico_e_arricchimento_persona  (DA DECIDERE)
supabase migration repair --status reverted 20260825155143 --project-ref wacknihvdjxltiqvxtqr   # memoria_fondo_racconto_html_completo  (DA DECIDERE)
```

## C. Ordine consigliato dall'Air

1. `git pull`, `gh auth status` (account `associazioneelbrenz-ai`), `supabase login`.
2. Sistemare le due anomalie della cartella (versione doppia, file `.bak`).
3. Lanciare i 68 `--status applied` della sezione A1.
4. I 21 della sezione A2 sono già stati verificati uno per uno il 16/9/2026:
   18 confermate, 2 superate senza perdita, 1 senza traccia nel database.
   Lanciare i 20 `--status applied` del blocco «A2 verificate: si possono
   lanciare», dopo aver rinominato `20260802110000_mappa_anteprima.sql` come
   dice il punto 2. Il ventunesimo, `20260801090000_radar_eventi_cron.sql`,
   resta fermo finché Cristian non decide (blocco «A2 da decidere con
   Cristian»).
5. `supabase migration list --project-ref wacknihvdjxltiqvxtqr`: i file
   locali devono risultare tutti "applied", compresi i 5 dell'ondata 2
   (`20260915142252` … `20260915142339`, vedi nota sotto), tranne gli
   eventuali A2 non confermati.
6. `supabase db push --dry-run --project-ref wacknihvdjxltiqvxtqr`: non deve
   elencare **niente**. Se elenca qualcosa, fermarsi e capire perché.
7. Le sezioni B1-B3 restano aperte: si valutano con calma, una riga alla volta.

Nota sui 5 dell'ondata 2 (aggiornata il 15/9/2026, sera): sono stati
applicati via MCP nella stessa sessione, e i file locali sono stati subito
rinominati con la versione assegnata dal registro
(`20260915142252_db04_eventi_esterni_colonne_anon`,
`20260915142255_db06_revoke_truncate_authenticated`,
`20260915142301_db07_assets_pubblici_prefissi_riservati`,
`20260915142333_priv06_pulizia_conservazione`,
`20260915142339_db05_cron_recupero_quattro_lavori`). Per loro non serve né
`db push` né `repair`: file e registro combaciano già.

Da oggi in poi: le migrazioni si applicano con `supabase db push` dal
repository, non con `apply_migration` via MCP. Se proprio si applica via MCP
(diagnosi urgente), si salva il file locale con **la stessa versione** che il
registro ha assegnato, letta subito dopo con
`select version, name from supabase_migrations.schema_migrations order by version desc limit 1`.
