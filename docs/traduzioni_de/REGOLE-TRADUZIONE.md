# Regole di traduzione DE/EN — El Brenz (i18n Fase 1b)

Riferimento operativo per ogni subagent traduttore. Pagina pilota di esempio già
fatta: `src/pages/de/gita-giochi-medievali-2026.astro` e `.../en/...` — imitane
struttura e stile.

## Come tradurre un file .astro
- Copia la struttura ESATTA della sorgente IT: frontmatter (import di Layout e
  componenti, costanti), tutti i tag, le classi Tailwind, gli attributi, gli id,
  e ogni blocco `<script>`. NON cambiare markup, classi, id, logica JS, colori.
- Traduci SOLO il testo leggibile: contenuto dei tag; `title=` e `description=`
  del `<Layout>`; attributi con testo umano (`alt=`, `aria-label=`, `title=`,
  `<figcaption>`, `placeholder=`); stringhe di testo dentro gli `<script>`.
- Aggiungi `lang="de"` (o `lang="en"`) come PRIMO attributo del `<Layout ...>`.
- Import di Layout/componenti: correggi il path relativo. Le pagine sotto
  `src/pages/de/` e `src/pages/en/` sono a profondità +1, quindi
  `../layouts/Layout.astro` diventa `../../layouts/Layout.astro`, e
  `../components/...` diventa `../../components/...`. (Confronta con la pilota.)
- Link interni alla stessa lingua: nella pagina DE i link `/qualcosa` diventano
  `/de/qualcosa`; nella EN `/en/qualcosa`. ECCEZIONI che restano IT (senza
  prefisso): pagine legali `/privacy`, `/cookie-policy`, `/statuto`, `/termini`,
  `/crediti-e-licenze`, e `/redazione`. `mailto:` e `tel:` invariati. Link
  esterni (http…) invariati.
- Sostituisci il commento JSDoc in cima con uno breve, es.:
  `/* /de/<slug> — traduzione DE (Fase 1b). Revisione Brunella Bonapace in corso. */`

## Regole identitarie NON NEGOZIABILI (DE e EN)
1. IL MOTTO NON SI TRADUCE MAI: «Raìs fonde no le 'nglacia» resta in ladino, con
   `lang="lld-anau"`. Glossa piccola sotto/accanto tra parentesi: DE «Tiefe
   Wurzeln erfrieren nicht», EN «Deep roots do not freeze». Il gloss non
   sostituisce il motto.
2. Frasi identitarie in ladino restano in ladino, con glossa alla PRIMA
   occorrenza nella pagina: "El Brenz da le Val del Nos", "nosa storia"/"nosa
   lenga"/"nose valli", "Os dal Nos", "Fiöi dal Nos", "Guardiani de la lenga",
   "migole de storia". Glossa DE tra parentesi (es. "nose valli (unsere Täler)"),
   EN (es. "nose valli (our valleys)").
3. MAI "dialetto" in senso riduttivo. DE: «keine bloße Mundart, sondern eine
   Sprache». EN: «not a mere dialect, but a language». La lingua si chiama DE
   «Anaunisches Ladinisch», EN «Anaunian Ladin». Riconoscimento: gruppo
   ladino-retico → DE «ladinisch-rätische Sprachgruppe», EN «Ladin-Rhaetian
   language group».
4. ESONIMI delle Valli del Noce — SOLO in DE: Val di Non→Nonsberg, Val di
   Sole→Sulzberg, Val di Rabbi→Rabbital, Val di Pejo→Pejotal, Valli del Noce→
   "die Täler des Noce" (o "Nonsberg und Sulzberg" secondo contesto). IN INGLESE
   si tengono i nomi ITALIANI (Val di Non, Val di Sole, Val di Rabbi, Val di
   Pejo, Valli del Noce). Altra geografia sudtirolese in DE con esonimo standard
   (Val Venosta→Vinschgau, Alto Adige→Südtirol, Sluderno→Schluderns, Castel
   Coira→Churburg); in EN nomi italiani + eventuale esonimo tra parentesi 1a volta.
5. Giochi Medievali: DE «Südtiroler Ritterspiele» (poi «Ritterspiele»); EN «the
   Südtiroler Ritterspiele (South Tyrolean Medieval Games)» 1a volta, poi
   «Ritterspiele».
6. Tirolo storico ≠ Tirol attuale: DE «das historische Tirol» vs «das heutige
   Land Tirol»; EN «historical Tyrol» vs «the present-day Austrian state of
   Tyrol». La distinzione non deve mai sfumare.
7. NIENTE EM-DASH (—) nel testo pubblico. Usa · oppure due punti/virgole.
   Trattino – solo in intervalli numerici (es. 10.00–24.00). (Gli em-dash nei
   COMMENTI di codice copiati dalla sorgente vanno bene, non sono testo pubblico.)
8. Registro: caldo, comunitario, documentato, divulgativo. Traduci il SENSO, mai
   calchi letterali. DE e EN devono suonare NATIVI ed ELEGANTI.
9. Date: DE «22. August 2026» / «Samstag, 22. August 2026»; EN «22 August 2026»
   / «Saturday, 22 August 2026». Euro: «20 €». Nomi storici in grafia originale
   (Clesio, Gaismair, Andreas Hofer, Maria Theresia, Karl von Habsburg).

## File JSON per il .docx (solo IT/DE)
Crea `docs/traduzioni_de/data/<slug>.json`:
```
{ "pagina": "<slug>", "titolo": "<titolo breve leggibile>",
  "url_de": "/de/<slug>",
  "righe": [ { "it": "<paragrafo IT>", "de": "<traduzione DE>" }, ... ] }
```
Una riga per ogni blocco significativo (titoli, paragrafi, item lista, didascalie,
CTA, meta title, meta description). Testo semplice, NIENTE tag HTML nelle stringhe.

## Non fare
- Non tradurre slug/route. Non toccare la pagina IT sorgente. Non tradurre il
  motto. Non tradurre le pagine legali. Non lanciare build né git.
