# Edge function sul progetto wacknihvdjxltiqvxtqr, prima del deploy del Lotto A (8/9/2026)

Snapshot preso via MCP `list_edge_functions` prima di deployare `corso-video-crea` e `corso-video-stato`.
Serve per il confronto post-deploy (regola 4 del brief: un redeploy batch puo' riabilitare `verify_jwt` in silenzio).
Il brief parla di 69 funzioni esistenti: sul progetto ne risultano 72 (alcune non hanno cartella nel repo).

| slug | verify_jwt | version |
|---|---|---|
| send-email | false | 38 |
| ingest-articoli | false | 35 |
| otp-request | true | 41 |
| otp-verify | true | 39 |
| andreas-chat | false | 49 |
| ingest-doc | false | 34 |
| contact-form | false | 51 |
| paypal-create-order | false | 27 |
| paypal-capture-order | false | 23 |
| paypal-webhook | false | 32 |
| ricevuta-ocr | false | 26 |
| scheda-domanda | false | 44 |
| convenzioni-proposta | false | 29 |
| ingest-chunks | false | 15 |
| tessera-invio | true | 22 |
| tessera-download | false | 17 |
| wallet-google | false | 15 |
| andreas-hofer | true | 15 |
| integrazione-invio | false | 17 |
| contatti-submit | false | 20 |
| solleciti-integrazione | false | 14 |
| guardiani-contributo | false | 35 |
| gita-verifica-socio | true | 19 |
| gita-crea-ordine | true | 19 |
| gita-cattura-ordine | true | 17 |
| download-lead | false | 21 |
| telegram-bot | false | 25 |
| telegram-setup | false | 16 |
| articolo-azione | true | 13 |
| newsletter-unsubscribe | false | 13 |
| newsletter-broadcast | false | 10 |
| telegram-link-token | true | 11 |
| test-search | true | 11 |
| andreas-test | true | 11 |
| museo-gg-proposta | false | 11 |
| tessera-invio-admin | true | 10 |
| avatar-upload | true | 9 |
| carica-media | true | 12 |
| push-config | true | 8 |
| invia-push | true | 9 |
| contanti-registra | true | 17 |
| solleciti-domande | false | 9 |
| museo-notifica | true | 8 |
| museo-donazioni-media | true | 8 |
| donazione-upload | false | 7 |
| radar-eventi-harvest | false | 9 |
| radar-eventi-classifica | false | 10 |
| radar-eventi-azione | true | 7 |
| tessere-qr-orfani | false | 5 |
| solleciti-quota | false | 6 |
| newsletter-gestione | false | 12 |
| guardiani-digest | false | 9 |
| link-pagamento | true | 5 |
| reazione-pubblica | false | 5 |
| lemma-correzione | false | 5 |
| lemma-commento | false | 5 |
| ocr-trascrivi | true | 6 |
| glossario-audio | false | 9 |
| libro-sociale-file | true | 5 |
| assemblea-convoca | true | 6 |
| geocodifica-luogo | true | 5 |
| lezione-firma-video | true | 5 |
| corso-video-libreria | true | 5 |
| corso-vetrina-pubblica | false | 5 |
| glossario-audio-revisione | true | 6 |
| glossario-audio-migrazione | false | 5 |
| pulizia-ricevute-prova | false | 5 |
| upload-temp-og-cimiteri | false | 12 |
| coda-ascolto-promemoria | false | 5 |
| cruscotto-digest | false | 6 |
| salvataggio-settimanale | false | 4 |
| glossario-audio-pubblica | true | 4 |

Totale: 72 funzioni, 29 con `verify_jwt = true`.
