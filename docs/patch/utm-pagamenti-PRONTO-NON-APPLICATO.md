# Cablaggio UTM sui pagamenti: codice pronto, NON applicato

**3 agosto 2026.** Il brief chiede di preparare il codice e tenerlo fermo
finché non arriva il via, perché è un flusso di denaro vero e va collaudato con
una transazione vera, con il segretario alla tastiera.

Per questo il codice sta qui e **non** nel sorgente: se stesse in `src/` e in
`supabase/functions/`, il primo deploy lo pubblicherebbe senza che nessuno
abbia detto di sì. Qui non può succedere per distrazione.

Banco di prova: **tesseramento o donazione**. La gita non è più utilizzabile.

Ora che tutte e cinque le colonne `sorgente_utm` sono `jsonb`, la forma da
propagare è una sola.

---

## 0. Un modulo nuovo: `src/lib/utm.ts`

Serve perché la sorgente va ricordata **fra le pagine**. Chi arriva su
`/andreas?utm_source=facebook`, legge, e solo dopo va a `/tesseramento`,
altrimenti risulta arrivato da nessuna parte. La prima sorgente vince: è quella
che ha portato la persona, non l'ultima pagina che ha visto.

```ts
/**
 * utm — la provenienza della visita, ricordata per la durata della sessione.
 *
 * Perche' non basta leggere location.search al momento del pagamento: nessuno
 * arriva su /tesseramento direttamente da Facebook. Ci arriva dopo aver letto
 * un articolo, e a quel punto la querystring d'origine non c'e' piu'.
 *
 * La PRIMA sorgente vince: e' quella che ha portato la persona. Sovrascriverla
 * a ogni pagina significherebbe attribuire ogni iscrizione alla home.
 */
const CHIAVE = 'eb-utm';

export type Utm = { source: string; medium: string; campaign: string };

/** Da chiamare una volta per pagina, il prima possibile. */
export function ricordaUtm(): void {
  try {
    if (sessionStorage.getItem(CHIAVE)) return; // la prima vince
    const q = new URLSearchParams(location.search);
    const pulisci = (v: string | null) => (v ? v.trim().slice(0, 100) : '');
    const cand: Utm = {
      source: pulisci(q.get('utm_source')),
      medium: pulisci(q.get('utm_medium')),
      campaign: pulisci(q.get('utm_campaign')),
    };
    if (cand.source || cand.medium || cand.campaign) {
      sessionStorage.setItem(CHIAVE, JSON.stringify(cand));
    }
  } catch (_) {
    // sessionStorage negato (navigazione privata su qualche browser): pazienza,
    // si perde la provenienza, non il pagamento.
  }
}

/**
 * La sorgente da mandare al server. Mai null: 'diretto' e' un'informazione,
 * un campo vuoto no. Un rapporto in cui meta' delle righe sono vuote non
 * distingue "e' arrivato digitando l'indirizzo" da "non l'abbiamo tracciato".
 */
export function leggiUtm(): Utm {
  try {
    const raw = sessionStorage.getItem(CHIAVE);
    if (raw) return JSON.parse(raw) as Utm;
  } catch (_) { /* vedi sopra */ }
  return { source: 'diretto', medium: '', campaign: '' };
}
```

---

## 1. Le tre pagine che chiamano `paypal-create-order`

`src/pages/tesseramento.astro`, `src/pages/dona.astro`,
`src/pages/integrazione/[codice].astro`.

In ciascuna, nello script che già c'è, aggiungere la chiamata a `ricordaUtm()`
all'avvio, e il campo nel corpo della `fetch` verso `createOrder`. Il modulo
va importato nel frontmatter (in testa, mai con un commento attaccato sopra:
vedi Trappola 11).

**`tesseramento.astro`, riga 669.** Da:

```js
body: JSON.stringify({ tipo: 'quota', nome: nomeVal, email: emailVal, consenso_privacy: consenso, domanda_id: (scelta && scelta.dataset.domandaId) || undefined }),
```

a:

```js
body: JSON.stringify({ tipo: 'quota', nome: nomeVal, email: emailVal, consenso_privacy: consenso, domanda_id: (scelta && scelta.dataset.domandaId) || undefined, sorgente_utm: leggiUtm() }),
```

**`dona.astro`, riga 250** e **`integrazione/[codice].astro`, riga 120**:
stessa aggiunta, `sorgente_utm: leggiUtm()` in fondo all'oggetto.

E, una volta sola per pagina, subito dentro l'IIFE dello script:

```js
ricordaUtm();
```

---

## 2. `supabase/functions/paypal-create-order/index.ts`

Due punti, nient'altro. Il resto della funzione sono `update`, e gli UTM si
fissano alla partenza: al momento della cattura l'utente è già passato da
PayPal e la provenienza non esiste più.

**a) lettura del corpo**, accanto agli altri campi (riga ~46-60). Stessa
pulizia di `contact-form:332-340`, non una nuova:

```ts
// Provenienza della visita: solo i tre campi che servono, ripuliti. Se non
// resta niente di utile si scrive null invece di un oggetto vuoto, che
// sarebbe rumore travestito da dato.
let sorgenteUtm: Record<string, string> | null = null;
if (body.sorgente_utm && typeof body.sorgente_utm === 'object') {
  const u = body.sorgente_utm as Record<string, unknown>;
  const pulisci = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');
  const cand = { source: pulisci(u.source), medium: pulisci(u.medium), campaign: pulisci(u.campaign) };
  if (cand.source || cand.medium || cand.campaign) sorgenteUtm = cand;
}
```

**b) la `insert`, riga 154.** È l'unica riga che scrive davvero:

```ts
.insert({ tipo, anonimo, nome, cognome, email, anno: ANNO_QUOTA, importo, stato: 'creato', domanda_id: domandaId, sorgente_utm: sorgenteUtm })
```

Nient'altro. `paypal-capture-order:84-94` non si tocca.

---

## 3. Collaudo, con il segretario alla tastiera

1. aprire `/tesseramento?utm_source=collaudo&utm_medium=manuale&utm_campaign=utm-pagamenti`;
2. **navigare su un'altra pagina del sito e tornare** a `/tesseramento`: è il
   pezzo che il collaudo di ieri non prevedeva ed è quello che rompe più
   spesso, perché la querystring sparisce al primo clic;
3. completare un pagamento reale;
4. leggere la riga in `pagamenti_tesseramento`: i tre valori ci devono essere e
   devono essere quelli, anche dopo il passaggio dal punto 2;
5. ripetere senza querystring: deve comparire `{"source":"diretto",...}`, non
   un campo vuoto;
6. `supabase functions list` e controllare `verify_jwt` di
   `paypal-create-order` contro l'atteso, che è `false` (Trappola 12).

---

## Una cosa da decidere prima, che non è tecnica

`contact-form` e il codice qui sopra usano le chiavi `source`, `medium`,
`campaign`. `contanti-registra`, dopo la correzione di oggi, usa `utm_source` e
`utm_medium`, perché così le prescriveva il brief alla lettera.

Sono due vocabolari nella stessa colonna, e il conteggio che il blocco 5
voleva rendere possibile resta impossibile finché sono due. Vanno unificati:
è una riga di codice, ma è una decisione di chi poi leggerà quei numeri.
