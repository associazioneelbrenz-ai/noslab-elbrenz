# Procedura data breach e valutazione DPO — El Brenz APS

> Documento interno di governance (brief compliance B.5). Redatto il 13 luglio 2026.
> Non è un documento pubblico: resta in `docs/` a supporto del Titolare.
> Versione iniziale, da rivedere con consulente qualora l'attività cresca di scala.

**Titolare del trattamento:** Associazione Storico Culturale Linguistica "El Brenz" delle Valli del Noce · Via Trento 40, 38027 Malè (TN) · C.F. 92019480224 · info@elbrenz.eu.
**Referente interno (punto di contatto privacy):** il Presidente pro tempore / il Direttivo.

---

## Parte 1 — Procedura di gestione delle violazioni di dati personali (data breach)

Riferimenti: artt. 33 e 34 GDPR (Reg. UE 2016/679); Linee guida EDPB 9/2022 sulla notifica delle violazioni.

### 1.1 Cos'è una violazione (breach)
Qualsiasi evento di sicurezza che comporti, in modo accidentale o illecito, la **distruzione, perdita, modifica, divulgazione non autorizzata o accesso** a dati personali trattati dall'Associazione. Esempi concreti per El Brenz:
- accesso non autorizzato al database Supabase o esfiltrazione di tabelle con dati personali (`utente`, `domande_tesseramento`, `download_lead`, `iscrizioni_gita`, `guardiani_contributori`);
- compromissione di un Edge Secret (SERVICE_ROLE, RESEND_API_KEY, PAYPAL, ADMIN_ACTION_SECRET, TELEGRAM_*);
- invio massivo di email a destinatari errati o con dati altrui in chiaro;
- furto/smarrimento di un dispositivo o di credenziali con accesso ai pannelli (Supabase, Netlify, Resend, Gmail associativa);
- ricevute di bonifico (che possono contenere dati bancari) esposte per errore.

### 1.2 Chi fa cosa (ruoli)
- **Chi rileva** (socio, collaboratore, fornitore): segnala **immediatamente** a info@elbrenz.eu e al Presidente.
- **Referente privacy (Presidente/Direttivo):** coordina la risposta, decide notifica/comunicazione, tiene il registro.
- **Supporto tecnico (sviluppatore):** contiene, valuta la portata tecnica, ruota i secret, ripristina.

### 1.3 Passi operativi
1. **Contenere (subito).** Isolare la causa: revocare/ruotare i secret compromessi (Supabase → Edge Functions → Secrets; Resend; PayPal; Telegram; ADMIN_ACTION_SECRET), invalidare sessioni, chiudere l'accesso violato, mettere in pausa la funzione interessata.
2. **Valutare (entro poche ore).** Quali dati, di quante persone, quali categorie (comuni? bancari? nessuna categoria particolare art. 9 è trattata di norma), quali rischi per gli interessati (furto d'identità, contatto indesiderato, danno economico).
3. **Registrare (sempre).** Compilare la voce nel Registro delle violazioni (§1.5) **anche se si decide di non notificare**: l'obbligo di documentazione interna vale in ogni caso (art. 33.5).
4. **Notificare al Garante (se dovuto).** Se la violazione **comporta un rischio** per i diritti e le libertà degli interessati: notifica al **Garante per la protezione dei dati personali** **senza ingiustificato ritardo e, ove possibile, entro 72 ore** dalla conoscenza (art. 33). Se oltre le 72 ore, indicare le ragioni del ritardo. Canale: servizio online del Garante (www.garanteprivacy.it).
5. **Comunicare agli interessati (se alto rischio).** Se la violazione comporta un **rischio elevato**, informare **senza ingiustificato ritardo** le persone coinvolte (art. 34), con linguaggio chiaro: cosa è successo, quali dati, possibili conseguenze, misure adottate, come proteggersi, contatto (info@elbrenz.eu). Deroghe art. 34.3 (es. dati già cifrati/inintelligibili).
6. **Rimediare e prevenire.** Chiudere la vulnerabilità, aggiornare le misure, annotare le lezioni apprese.

### 1.4 Soglie di decisione (sintesi)
| Situazione | Notifica Garante (72h) | Comunicazione agli interessati |
|---|---|---|
| Nessun rischio (es. dato già cifrato/inintelligibile, nessun accesso reale) | No (ma **registrare**) | No |
| Rischio per gli interessati | Sì | Solo se rischio elevato |
| Rischio elevato (dati bancari esposti, larga scala, possibile danno) | Sì | Sì |

### 1.5 Registro delle violazioni (modello voce)
Per ogni evento annotare: data/ora della conoscenza · descrizione · categorie e numero approssimativo di interessati e di record · conseguenze probabili · misure adottate · decisione su notifica/comunicazione e relativa motivazione · esito.

### 1.6 Misure preventive già in essere (rimando all'audit)
RLS su tutte le tabelle, secret solo negli Edge Secrets (mai nel frontend), HTTPS/HSTS, edge gated (origin allowlist, HMAC, secret condivisi), rate-limit e honeypot sui form, conferme servite dal dominio proprio. Dettaglio in `docs/SECURITY_AUDIT_2026-07.md`. Miglioramenti in corso: CSP enforced, Turnstile, rotazione periodica dei secret.

---

## Parte 2 — Valutazione sulla nomina del Responsabile della Protezione dei Dati (DPO)

Riferimenti: art. 37 GDPR; Linee guida WP243 (EDPB) sul DPO.

### 2.1 Esito della valutazione
**L'Associazione NON è tenuta a nominare un DPO** e, allo stato attuale, **non lo nomina.** La presente valutazione documenta il perché (principio di accountability, art. 5.2).

### 2.2 Motivazione
La nomina è obbligatoria solo nei casi dell'art. 37.1:
- **a) autorità o organismo pubblico:** l'Associazione è un ente privato del terzo settore. **Non ricorre.**
- **b) monitoraggio regolare e sistematico su larga scala:** l'Associazione non effettua profilazione né tracciamento sistematico degli interessati; i cookie sono solo tecnici e gli embed sono a caricamento su richiesta. **Non ricorre.**
- **c) trattamento su larga scala di categorie particolari (art. 9) o dati giudiziari (art. 10):** l'Associazione tratta dati anagrafici e di contatto di soci, simpatizzanti e contributori, in numero contenuto e a fini culturali/associativi; **non tratta** su larga scala dati sensibili o giudiziari. **Non ricorre.**

Non ricorrendo alcuno dei presupposti, il DPO non è obbligatorio. Considerati la **scala ridotta**, la natura **non sensibile** dei dati e la **finalità culturale senza scopo di lucro**, non se ne ravvisa nemmeno l'opportunità su base volontaria in questa fase.

### 2.3 Presidio comunque garantito
Pur senza DPO, l'Associazione mantiene un **punto di contatto privacy** (info@elbrenz.eu, riferito al Presidente/Direttivo) per le richieste degli interessati e per i rapporti con il Garante, e adotta le misure tecniche e organizzative descritte nell'informativa e nell'audit di sicurezza.

### 2.4 Revisione
Questa valutazione va **riesaminata** se cambia la scala o la natura dei trattamenti (es. profilazione, trattamento sistematico su larga scala, dati particolari), o su indicazione di un consulente. In tal caso valutare la nomina di un DPO e aggiornare l'informativa.

---

*Documento interno. Da conservare agli atti dell'Associazione insieme all'informativa privacy e all'audit di sicurezza.*
