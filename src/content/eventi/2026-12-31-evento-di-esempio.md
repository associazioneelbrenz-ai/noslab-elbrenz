---
titolo: "Evento di esempio — non pubblicare"
data: 2026-12-31
luogo: "Malè"
descrizioneBreve: "File di esempio per la struttura della collection eventi."
bozza: true
---
Questo file documenta la struttura di un evento. Duplicarlo e compilare i campi per creare eventi reali.

Campi disponibili nel frontmatter:

- `titolo` (obbligatorio)
- `data` (obbligatorio, formato YYYY-MM-DD)
- `oraInizio` (opzionale, es. "20:30")
- `luogo` (opzionale, es. "Malè, Sala civica")
- `descrizioneBreve` (opzionale, mostrata nella card in home)
- `link` (opzionale, URL a pagina o locandina)
- `immagine` (opzionale)
- `annullato` (default false)
- `bozza` (default false — questo file resta true apposta)

Il corpo del file è la descrizione estesa dell'evento: per ora non è
renderizzata in home, servirà per le future pagine evento.
