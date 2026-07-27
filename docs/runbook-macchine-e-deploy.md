# Runbook: due macchine, un solo stato

> Scritto il 27 luglio 2026, prima sessione con MacBook Air + Mac Mini M4 in
> parallelo. Obiettivo: che il sito si comporti allo stesso modo da qualunque
> macchina si parta, e che nessuna build possa finire in produzione monca.

---

## Regola zero: prima di tutto, su che macchina siamo

Le postazioni sono tre e **non sono equivalenti**:

| Postazione | Quando | Puo' deployare? |
|---|---|---|
| **MacBook Air** | uso principale, in settimana | Si, se ha i secret (vedi sotto) |
| **Mac Mini M4** | nel fine settimana | Si, se ha i secret (vedi sotto) |
| **Sessione cloud** (Claude Code sul web) | quando si apre una sessione da browser o telefono | **No** |

Claude deve **chiedere all'inizio di ogni sessione su quale macchina si sta
lavorando**, e non deve darlo per scontato: i comandi di deploy sono identici,
ma il rischio no.

### Perche' la sessione cloud non puo' deployare

Verificato il 27/7/2026, non e' una cautela teorica:

1. **`elbrenz.eu` e `*.netlify.app` sono bloccati** dalla policy di rete
   dell'ambiente cloud (il proxy risponde `403` alla CONNECT). Quindi da li'
   non si puo' fare ne' lo smoke test ne' il collaudo cliccando dal browser.
2. **I secret di build non ci sono**: `.env.local` e' giustamente in
   `.gitignore`, quindi un clone fresco non ce l'ha. Una build fatta li'
   parte lo stesso, ma esce monca (vedi la sezione seguente).

Dalla sessione cloud si fanno benissimo: diagnosi, lettura del DB e delle edge
via MCP, modifiche al codice, commit, push, PR. **Non** il deploy del sito.

---

## Il punto piu' delicato: i secret sono congelati nella build

Questa e' la lezione del 27/7 e vale la pena scriverla per esteso, perche' il
sintomo inganna esattamente come la trappola 12.

Le variabili `PUBLIC_*` **non vengono lette a runtime**: Astro le **incolla
dentro il bundle al momento della build**. Verifica fatta sul chunk generato:

```
SUPABASE_ANON = ""          <- il valore, gia' inlined
PUBLIC_SUPABASE_ANON_KEY    <- 0 occorrenze: a runtime non si legge nulla
```

Conseguenza: **se si builda su una macchina senza `.env.local`, la build
riesce lo stesso** (nessun errore fatale, exit 0) ma esce con l'anon key
vuota. Il deploy va a buon fine, il sito risponde 200, e i danni sono
silenziosi:

- **verifica socio della gita**: la fetch parte con `apikey: ""`, il gateway
  Supabase risponde **401**, `out.socio` resta `undefined` e il codice cade nel
  ramo `else`, che mostra l'upsell **"non sei socio"**. Il socio in regola si
  vede dire che non e' socio, senza nessun messaggio di errore.
- **marquee convenzioni** in home: in build compare
  `lettura fallita: Error: supabaseUrl is required` e la sezione resta vuota.
- **posti gita, popup locandina, chat Andreas**: stessa sorte, tutti passano
  dal client Supabase.

E i flag di funzionalita' si comportano allo stesso modo: assenti valgono
`false`, quindi una build senza `.env.local` **spegne** le pagine DE ed EN, il
bottone Google Wallet e la sezione Guardiani de la lenga.

### Cosa deve contenere `.env.local` (su ENTRAMBE le macchine)

```
PUBLIC_SUPABASE_URL=https://wacknihvdjxltiqvxtqr.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon key del progetto>
TRADUZIONI_DE_LIVE=<true|false>
TRADUZIONI_EN_LIVE=<true|false>
WALLET_GOOGLE_LIVE=<true|false>
GUARDIANI_LIVE=<true|false>
```

I valori dei quattro flag **vanno copiati dalla macchina che ha fatto
l'ultimo deploy andato bene**, non scelti a intuito: sono loro a decidere che
cosa e' pubblicato in questo momento. L'anon key sta in Keychain o Bitwarden,
**mai** in Notes (trappola 1).

---

## Gate pre-deploy: due secondi che evitano un disservizio

Da eseguire **sempre**, dopo `npm run build` e **prima** di `netlify deploy`.

```bash
grep -o 'SUPABASE_ANON = "[^"]\{0,12\}' .netlify/build/chunks/iscrizione_*.mjs
```

- Se stampa `SUPABASE_ANON = "eyJ...` la build ha i secret: si puo' deployare.
- Se stampa `SUPABASE_ANON = ""` **fermarsi**: manca `.env.local`. Deployare
  quella build significa rompere verifica socio, convenzioni, posti gita e
  chat Andreas tutti insieme.

Controllo veloce dei flag nello stesso momento:

```bash
grep -c 'guardiani-de-la-lenga' dist/index.html    # 0 = sezione Guardiani spenta
ls dist/de/index.html dist/en/index.html           # devono esistere se DE/EN sono live
```

---

## Sequenza di deploy del sito (da MacBook Air o Mac Mini)

```bash
cd ~/Sviluppo/noslab-elbrenz        # su MacBook Air adattare il percorso
git status                          # atteso: working tree clean
git pull origin main
npm run build

# GATE (vedi sopra): non proseguire se l anon key e vuota
grep -o 'SUPABASE_ANON = "[^"]\{0,12\}' .netlify/build/chunks/iscrizione_*.mjs

netlify deploy --prod --dir=dist --site=a8922ddb-53ec-4541-ac15-99570b61a1b2
curl -I https://elbrenz.eu
```

Nota: Netlify **non** builda da git. Il deploy corrente risulta
`deploy_source: cli`, quindi la produzione si aggiorna **solo** quando qualcuno
lancia il comando da una macchina con i secret. Un push su `main`, da solo,
non cambia nulla di quello che vedono i visitatori.

---

## Checklist di allineamento di una macchina

Da spuntare su MacBook Air e su Mac Mini M4, cosi' che siano intercambiabili.

- [ ] `git clone` del repo e branch `main` aggiornato
- [ ] `npm install` eseguito
- [ ] `.env.local` presente e completo (sei variabili, valori dalla macchina di riferimento)
- [ ] `gh auth status` mostra `associazioneelbrenz-ai` come account attivo
- [ ] `netlify status` mostra il login corretto
- [ ] `supabase` CLI installata e collegata al progetto `wacknihvdjxltiqvxtqr`
- [ ] `npm run build` verde **e** gate anon key superato
- [ ] stessa versione di Node (v24.x) su entrambe

Prova finale dell'allineamento: la stessa `npm run build` sulle due macchine
deve superare il gate su entrambe. Se una passa e l'altra no, la differenza e'
quasi sempre `.env.local`.

---

## Invio tessere dal pannello

L'edge `tessera-invio-admin` pretende, nell'ordine: sessione valida, **AAL2**
(verifica in due passaggi effettuata), ruolo maggiore o uguale a 50. Quindi
l'invio si fa **dal pannello admin dell'app con il 2FA sbloccato**, e non e'
riproducibile da una sessione senza credenziali.

Verifica dell'esito a DB, che e' l'unica prova che vale:

```sql
select numero_tessera, nome, tessera_inviata
from domande_tesseramento
where numero_tessera = <n>;
```

`tessera_inviata = true` significa spedita davvero. Il messaggio di conferma a
schermo, da solo, non basta.
