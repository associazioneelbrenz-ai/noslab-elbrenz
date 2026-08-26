# Report · Cimiteri di guerra, messa a punto dopo la lettura del fondo

26 agosto 2026. Segue `BRIEF_CODE_navigazione_cimiteri_2026-08-26.md`, commit `d706223`.

## La causa reale della sovrapposizione

Non era un problema di `grid-template-columns` né di `justify-content: space-between`, come
ipotizzava il brief. La barra di sezione (`src/components/memoria/BarraSezione.astro`) chiamava le
sue voci `.voce`. **`.voce` è la stessa classe che `cimiteri-di-guerra.css` usa per le righe della
ricerca**, con questa regola:

```css
.sezione-cimiteri .voce{display:grid;grid-template-columns:4.5rem 1fr auto;gap:1rem;...}
```

Entrambe le regole vivono dentro `.sezione-cimiteri`. La mia — quella della barra — aveva la stessa
specificità (due classi ciascuna: `.sezione-cimiteri .voce` contro `.voce[data-astro-cid-xxx]`, lo
scope che Astro aggiunge automaticamente) ma **non dichiarava mai la proprietà `display`**. In CSS,
quando due regole di pari specificità non si contendono la stessa proprietà, quella dichiarata vince
senza bisogno di battaglia: `display:grid` del foglio globale si applicava di default a ogni bottone
della barra, trasformando ciascuno in una griglia interna a tre colonne (`4.5rem 1fr auto`). Il testo
di ogni voce si posizionava dentro quella griglia con una larghezza che non c'entrava nulla con la
larghezza reale del bottone calcolata dal flex del contenitore genitore — da qui lo sconfinamento del
testo sopra il bottone accanto, più marcato sulle prime due voci perché erano le più lunghe.

**Correzione:** le voci della barra si chiamano ora `.scheda-nav`, un nome che non esiste da nessun'altra
parte nel sito (verificato con grep su tutto `src/`). Non è stato un aggiustamento di spaziatura: è
stato togliere la collisione di nome.

## Cosa è stato fatto

**Barra di sezione, rifatta.** Zona identità (`{fondo.titolo}`, etichetta non cliccabile, a sinistra)
+ filetto verticale + sei bottoni a pastiglia (stesso raggio, bordo, font e maiuscoletto del bottone
ACCEDI dell'header). "Planimetria" punta ora alla pagina del fondo, non più a `/mappa`: la planimetria
vive lì dalla settimana scorsa. `/mappa` resta raggiungibile (i link dalle schede persona e da
senza-nome la usano ancora), semplicemente non è più nella barra. Da 1024px in su le schede vanno a
capo; sotto, la riga scorre in orizzontale con la scheda attiva già in vista al caricamento
(`scrollIntoView`). Verificato con screenshot reali a 1440/1280/1024/768/390px (non solo lettura di
codice): nessuna sovrapposizione a nessuna larghezza.

**Tre schede nuove per le tombe ignote.** 133, 186 e 195 hanno ora una pagina propria:
`/cimiteri-di-guerra/male/133-sconosciuto` eccetera. Titolo "Tomba N, nome ignoto", corpo con il testo
esatto del brief, nessun JSON-LD `Person` con un nome che non c'è (solo il breadcrumb). Sono entrate
anche nella sequenza precedente/successivo delle altre schede e nella lista di senza-nome.astro, che
ora punta alla scheda vera invece che a un'ancora morta sulla planimetria.

**Legenda a quattro stati**, testo esatto del brief:
- *Nome noto* — oro pieno, cliccabile.
- *Nome ignoto già nel registro* — oro in tono più tenue, cliccabile (le tre tombe sopra).
- *Riquadro barrato sulla pianta del 1941* — tratto obliquo ridisegnato in CSS, non cliccabile.
- *Riquadro integro, nessun nome* — bordo tratteggiato, non cliccabile.

Sui numeri 91, 92, 93, 94, 95, 96, 125, 199, 200 (dentro il blocco 90-201, nessuna riga del registro
a quel numero) il brief non diceva esplicitamente quale dei quattro stati usare: la regola "barrato"
copre solo <90 o >201, e la lista esplicita di "integro" ne cita otto, non diciassette. Li ho resi
come "integro, nessun nome": stessa fascia 85-201 che il brief descrive come senza traccia di
tratto, stesso trattamento visivo. Verificato in build: 98 riquadri noto (96 singoli + 2 doppi), 3
ignoto, 97 barrato, 17 integro. 98+3+97+17 = 215.

**Reparti, da 10 a 55 pagine.** `src/lib/memoria.ts` non raggruppa più le persone per sigla: legge
`v_memoria_reparto_pubblico`. Titolo = denominazione (sigla se `da_verificare`), sottotitolo =
scioglimento, coda sempre con "Sigla nel registro: {sigla}". Le sei sigle `da_verificare` mostrano
solo la frase di verifica, niente denominazione né scioglimento anche quando il campo è popolato in
tabella — come chiesto, senza eccezioni. `sigla_padre` linka alla scheda del padre quando esiste.
Indice raggruppato per arma, ordinato per caduti dentro ogni gruppo. Le dieci vecchie rotte per sigla
(`/reparto/i-kschrgt` eccetera) rispondono 301 verso il nuovo slug, dichiarate in `astro.config.mjs`.

**Cronologia dei morti**, nuovo componente (`Cronologia.astro`) sulla pagina del fondo, fra la
planimetria e il racconto: istogramma SVG mese per mese da dicembre 1914 a novembre 1918 (nessuna
libreria), un clic su una barra filtra l'elenco sotto, l'elenco si ordina per tomba o per data. Giugno
1918 (16) e ottobre 1918 (49) sono leggibili senza bisogno di commentarli. Le cinque schede senza data
restano in fondo all'ordine per data, non nascoste.

**Planimetria civile**, didascalia aggiornata col testo esatto: le sei posizioni senza segno tracciato
(9, 10, 11, 13, 18, 19) sono esattamente le sei senza nome — verificato in query, coincidenza reale
non supposta.

**Il fondo è datato.** Protocollo, anno della pratica, archivio, segnatura e ritrovamento in testa
alla pagina, nella scheda della fonte. Due colonne nuove additive su `memoria_fondo`
(`protocollo`, `anno_pratica`), vista `v_memoria_fondo_pubblico` estesa in coda, non riordinata.

**Anteprima social.** `og:image:type` e `og:image:alt` aggiunti a `Layout.astro` (sitewide, non solo
per questa sezione): il tipo si calcola dall'estensione reale del file, mai dichiarato a mano. Vedi
sotto per il valore prima/dopo.

## Cosa non è stato toccato

Il muro delle tacche (236 resta bloccato in attesa della verifica 180-181/182-183 con Mariotti),
l'accorpamento `sigla_padre`, lo scioglimento delle sei sigle `da_verificare`, le pagine in tedesco,
il modulo "Conosco questa persona", l'overlay della pianta. Nessuna interpretazione storica aggiunta:
il significato del tratto obliquo resta esplicitamente "non lo sappiamo ancora", ovunque compaia.

## Le quattordici verifiche

1. **Barra di sezione senza sovrapposizioni a 1440/1280/1024/768/390px, su operazione-lawine.** Sì —
   screenshot reali con Chrome headless a tutte e cinque le larghezze, nessuna sovrapposizione;
   sotto 1024px la riga scorre in orizzontale, sopra va a capo.
2. **Scheda attiva evidente su ognuna delle sette pagine di primo livello, con `aria-current="page"`.**
   Sì, verificato nel markup: la scheda attiva ha classe `.attiva` (riempimento oro) e
   `aria-current="page"`, sempre come `<a>`, mai come elemento disabilitato.
3. **Tabulatore e contorno di fuoco.** Sì a livello di codice (`:focus-visible` con outline oro da
   2px su ogni `.scheda-nav`); non ho premuto Tab su un browser reale in questa sessione — è una
   verifica di CSS, non un test manuale di tastiera.
4. **Sotto 1024px la riga scorre e la scheda attiva è già in vista.** Sì, confermato dallo
   screenshot a 768px e 390px: la barra è scrollata mostrando "Operazione Valanga" (la pagina
   corrente) già in vista senza intervento dell'utente.
5. **`v_memoria_reparto_pubblico` risponde 55 righe impersonando `anon`.** Sì —
   `set role anon; select count(*) from v_memoria_reparto_pubblico;` → 55.
6. **Build locale: 103 riquadri cliccabili nel militare, 15 nel civile.** Parziale, con numero
   corretto invece che confermato alla lettera: i riquadri cliccabili nel militare sono 98 (96
   singoli con nome + 2 doppi), non 103 — 103 è il numero di righe del registro militare (100 nomi +
   3 ignoto), non di riquadri, perché due coppie di tombe condividono un riquadro. Nel civile sono
   15, come atteso. Non ho scritto "103" da nessuna parte pur di far tornare il numero: il conto è
   verificabile in query ed è nell'inventario del brief precedente.
7. **Le tre pagine 133, 186, 195 rispondono 200 e sono raggiungibili dalla planimetria.** Sì —
   200 confermato in produzione per tutte e tre; sono cliccabili dalla planimetria (stato "ignoto",
   oro tenue) e da senza-nome.astro.
8. **Una rotta reparto vecchia per sigla risponde 301 verso il nuovo slug.** Sì —
   `/cimiteri-di-guerra/reparto/i-kschrgt` → 301 → `/cimiteri-di-guerra/reparto/kaiserschuetzenregiment-i`,
   verificato in produzione.
9. **Una pagina reparto con `certezza='da_verificare'` non mostra nessuno scioglimento.** Sì —
   verificato su `i-schuetzenregiment`: solo sigla come titolo e la frase di verifica, anche se
   quella riga non ha comunque denominazione/scioglimento popolati; testato anche il caso in cui
   lo sono (`eisenbahn`, `1-170-landsturm-infanteriebataillon`) e restano comunque nascosti.
10. **L'istogramma mostra il picco di ottobre 1918 e il clic filtra i nomi.** Sì per il conteggio
    (49 morti in ottobre 1918, verificato nell'attributo `aria-label` della barra in produzione); il
    filtro-al-clic è verificato leggendo lo script (stesso pattern della ricerca già in uso altrove
    nella sezione), non con un clic reale su un browser.
11. **La planimetria civile disegna 21 posizioni, 15 cliccabili.** Sì, invariato dal brief
    precedente, confermato nello screenshot: 15 pallini pieni, 6 pallini vuoti (9, 10, 11, 13, 18, 19).
12. **Intestazione e footer invariati, dentro e fuori sezione.** Sì — confrontate le classi del
    footer fra `/cimiteri-di-guerra/male/` e `/storia/` in produzione: identiche (5 link social con
    le stesse classi in entrambe).
13. **Clic reale su desktop e su iPhone.** Parziale: ho verificato il desktop con screenshot reali
    a più larghezze (incluso 390px, dimensione tipica di iPhone) e il markup è identico
    indipendentemente dal dispositivo, ma non ho un iPhone fisico in questa sessione per un tocco
    vero. Stessa riserva già segnalata nel report precedente.
14. **`git log origin/main` mostra i commit, ripetuto in produzione dopo il deploy.** Sì —
    `origin/main` è a `2356632`; le verifiche 1, 2, 4, 5 (dove ripetibile), 7, 8, 9, 10, 12 sono
    state rifatte direttamente sull'HTML servito da `https://elbrenz.eu`, non solo sulla build locale.

## Il tag og:image

**Prima:** `og:image` (URL assoluto, JPEG 1200×630, 290 KB — già a posto), `og:image:width`,
`og:image:height`, `twitter:card=summary_large_image`, `twitter:image` assoluto. Mancavano
`og:image:type` e `og:image:alt`.

**Dopo:** aggiunti `<meta property="og:image:type" content="image/jpeg">` (calcolato
dall'estensione del file, non scritto a mano — funziona per qualunque immagine del sito, non solo
per questa) e `<meta property="og:image:alt" content="...">`. Il file dell'immagine non è cambiato:
era già JPEG, già 1200×630, già sotto i 300 KB, già con URL assoluto. Se WhatsApp continua a non
mostrare l'anteprima dopo questo giro, la causa probabile è la cache del suo crawler sul vecchio
stato del tag, non più il tag in sé — un nuovo tentativo di condivisione (o l'apposito debugger di
Meta, se Cristian vuole forzare la ricrawl) lo direbbe con certezza.

## Commit verificati su origin/main

- `2356632` — "cimiteri di guerra: la pratica del 1941, non il registro del 1918"
- `d706223` — "cimiteri di guerra: report della navigazione di sezione" (brief precedente)

Deploy live su `https://elbrenz.eu`.
