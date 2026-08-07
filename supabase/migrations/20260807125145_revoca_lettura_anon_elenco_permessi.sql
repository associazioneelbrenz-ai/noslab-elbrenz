-- [7/8/2026] L'elenco dei permessi non e' materiale pubblico: dice a chiunque
-- quali tabelle esistono e quali sono considerate riservate. Il controllo l'ha
-- pescata da sola un minuto dopo averla creata, ed e' esattamente il motivo per
-- cui il controllo esiste: i privilegi predefiniti continuano a dare la lettura
-- a ogni tabella nuova, quindi la prossima nascera' aperta come questa.
revoke select on table permesso_anon_lettura_attesa from anon;
