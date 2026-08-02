# I valori di `stato` di museo, donazioni e storie

**3 agosto 2026 · censimento, non intervento.**

Questo documento fotografa i valori che il campo `stato` assume oggi per quattro
entità. Non propone vincoli e non ne applica: serve a decidere con i dati in
mano, perché nessuna delle quattro ha oggi un `CHECK` e il set dei valori
ammessi vive solo nei commenti del DDL.

Sorgente: `src/**`, `supabase/functions/**`, `supabase/migrations/**` del repo
`noslab-elbrenz`. Fuori dal censimento restano la PWA `elbrenz-community`, che
per due entità su quattro è l'unica superficie che scrive davvero: dove è così,
è detto.

---

## In breve

| entità | default DDL | valori nel DDL | valori davvero scritti qui | `CHECK` |
|---|---|---|---|---|
| `museo_gg_pezzo` | `in_attesa` | `in_attesa`, `pubblicato` | `in_attesa`, `pubblicato`, **`rifiutato`** | no |
| `museo_gg_proposta` | `nuova` | `nuova`, `gestita`, `archiviata` | tutti e tre | no |
| `donazione_materiale` | `in_attesa` | `in_attesa`, `presa_in_carico`, `catalogata`, `respinta` | solo `in_attesa` | no |
| `storia` | `pubblicata` | `pubblicata`, `nascosta` | nessuno (nessuna scrittura qui) | no |

Le entità sorelle dello stesso dominio un `CHECK` ce l'hanno: `dizionario_lemma`
(`supabase/migrations/20260712090000_guardiani_de_la_lenga.sql:29`), `articolo`
(`supabase/migrations/20260712142752_articolo_stati_editor.sql:3`),
`radar_eventi` (`supabase/migrations/20260731120000_radar_eventi.sql:50`).
L'asimmetria è nota e aperta.

---

## 1. `museo_gg_pezzo`

**Default DDL:** `'in_attesa'` — `supabase/migrations/20260716181500_museo_gg_pezzo.sql:26`
(commento: `in_attesa|pubblicato`). Nessun `CHECK`.

| valore | dove compare |
|---|---|
| `in_attesa` | `20260716181500_museo_gg_pezzo.sql:26` (default) · `20260717190000_museo_gg_fase_a_soci.sql:16,30,31,36,51` (RLS socio e guardia) · `20260801101000_museo_gg_guardia_curatore.sql:32` · `src/pages/museo-gg-curatela.astro:273,292,294,374` |
| `pubblicato` | `20260716181500_museo_gg_pezzo.sql:37,56` · `20260717190000_museo_gg_fase_a_soci.sql:23,55` · `20260801101000_museo_gg_guardia_curatore.sql:37` · `20260718200000_riconoscimenti.sql:226` (trigger punti) · `src/pages/non-e-sole-grande-guerra.astro:35` · `src/pages/museo-gg-curatela.astro:273,282,334,374` |
| `rifiutato` | **solo codice**: `src/pages/museo-gg-curatela.astro:311` (scrittura), `:273` (ordinamento), `:284-285` (badge «Non pubblicato») |

**Default de facto:** il pannello scrive sempre lo stato esplicitamente —
`src/pages/museo-gg-curatela.astro:374`, `stato: pubblica ? 'pubblicato' : 'in_attesa'`.
Il default del DB non viene mai esercitato da questa superficie.
`supabase/functions/museo-donazioni-media/index.ts:109` aggiorna solo
`immagini_urls`, non lo stato.

**Da guardare prima di decidere.** `rifiutato` esiste nel codice e in nessuna
policy. Le regole RLS che permettono al socio di correggere o ritirare il
proprio pezzo sono agganciate a `stato = 'in_attesa'`
(`20260717190000_museo_gg_fase_a_soci.sql:30-31` e `:36`): dopo un rifiuto il
socio vede ancora il pezzo ma non può più toccarlo, mentre il messaggio di
conferma del curatore (`src/pages/museo-gg-curatela.astro:310`) gli promette che
resta suo. Non è una svista di grafia: è un pezzo di ciclo di vita che sta metà
nel codice e metà da nessuna parte.

---

## 2. `museo_gg_proposta`

**Default DDL:** `'nuova'` — `supabase/migrations/20260717120000_museo_gg_proposta.sql:15`
(commento: `nuova | gestita | archiviata`). Nessun `CHECK`.

| valore | dove compare |
|---|---|
| `nuova` | migration `:15` · `src/pages/museo-gg-curatela.astro:401,409,412,432,448` |
| `gestita` | migration `:15` · `src/pages/museo-gg-curatela.astro:401,430` |
| `archiviata` | migration `:15` · `src/pages/museo-gg-curatela.astro:401,431` |

Il valore scritto arriva da `el.dataset.propAzione`
(`src/pages/museo-gg-curatela.astro:446-447`): i tre bottoni sono l'insieme
completo di ciò che il front-end può scrivere.

**Default de facto:** `supabase/functions/museo-gg-proposta/index.ts:116-117`
inserisce senza specificare `stato`, quindi la riga nasce `'nuova'` dal default
del DB. È l'unica delle quattro in cui DDL, edge e interfaccia dicono
esattamente la stessa cosa.

Una nota di fragilità, non un'incoerenza: `src/pages/museo-gg-curatela.astro:406`
ordina per `stato` alfabetico e poi corregge in JavaScript a `:409` per rimettere
in cima le proposte nuove. Il criterio regge finché i valori sono questi tre.

---

## 3. `donazione_materiale`

**Default DDL:** `'in_attesa'` — `supabase/migrations/20260718000000_donazione_materiale.sql:19`
(commento: `in_attesa | presa_in_carico | catalogata | respinta`). Nessun `CHECK`.

| valore | dove compare |
|---|---|
| `in_attesa` | migration `:19` (default), `:37-38` (policy update del donatore), `:56` (guardia che lo forza sugli insert non-admin) · `supabase/functions/donazione-upload/index.ts:174` |
| `presa_in_carico` | **solo il commento** alla migration `:19` |
| `catalogata` | **solo il commento** alla migration `:19` |
| `respinta` | **solo il commento** alla migration `:19` |

**Default de facto:** l'edge scrive `'in_attesa'` esplicito
(`supabase/functions/donazione-upload/index.ts:162,174`), e il trigger lo
riforza comunque per i non-admin.

**Attenzione a non sbagliare entità.** Le occorrenze di `'respinta'` in
`supabase/functions/scheda-domanda/index.ts:162` e in
`supabase/migrations/20260707200000_domande_tesseramento.sql:25` sono di
`domande_tesseramento`, non di qui.

**Da guardare prima di decidere.** Tre stati su quattro non sono mai scritti né
letti in questo repo. Non vuol dire che siano morti: la curatela delle donazioni
vive nella PWA. Un `CHECK` scritto guardando solo questo repo taglierebbe fuori
il flusso vero.

---

## 4. `storia`

**Default DDL:** `'pubblicata'` — `supabase/migrations/20260717170000_storia.sql:14`
(commento: `pubblicata | nascosta`). Nessun `CHECK`.

| valore | dove compare |
|---|---|
| `pubblicata` | migration `:14` (default), `:30` e `:34` (policy di lettura), `:74` (guardia sugli insert non-admin) · `20260717233000_v_storia_pubblica.sql:14` |
| `nascosta` | **solo il commento** alla migration `:14` |

**Default de facto:** nessuna superficie di questo repo scrive righe `storia`.
Le pagine pubbliche leggono solo la vista già filtrata
(`src/pages/storie/index.astro:24`, `src/pages/storie/[id].astro:24`). La
creazione e la moderazione stanno nella PWA.

Due cose da non confondere. La visibilità pubblica **non** dipende da `stato` ma
dal booleano `pubblica` (`20260717170000_storia.sql:15`), ed è su quello che
reagisce il trigger dei riconoscimenti
(`20260718200000_riconoscimenti.sql:252-253`). E le occorrenze di `'pubblicata'`
in `src/data/video.ts:32,65,83,103` e `src/pages/os-dal-nos.astro:57` sono lo
stato delle edizioni video, un'altra cosa.

---

## Una rettifica al registro

`docs/REGISTRO_LAVORI.md:104` dice che `museo_gg_pezzo` userebbe anche
`bozza`, `validato` e `catalogata`. Verificato: non è così. `bozza` e `validato`
sono stati di `articolo`
(`src/pages/redazione.astro:310`, `supabase/functions/articolo-azione/index.ts:132`,
`20260712142752_articolo_stati_editor.sql:3`) e di `dizionario_lemma`;
`catalogata` è di `donazione_materiale`. Su `museo_gg_pezzo` gli stati sono
tre: `in_attesa`, `pubblicato`, `rifiutato`. In
`src/pages/museo-gg-curatela.astro:376` compaiono `validato_da` e `validato_il`,
ma sono nomi di colonna, non valori di stato.

---

## Cosa resta da decidere

Nessuna di queste è una domanda tecnica: sono scelte di Cristian.

1. `rifiutato` va portato nel DDL e nelle policy (col socio che può ancora
   ritirare il pezzo), oppure il pannello deve smettere di scriverlo?
2. Gli stati del ciclo donazioni vanno censiti anche nella PWA prima di
   fissare qualunque vincolo.
3. Se e quando mettere i `CHECK`: farlo adesso, con metà del ciclo di vita
   fuori repo, congelerebbe uno stato dei fatti incompleto.
