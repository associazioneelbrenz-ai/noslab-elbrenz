# Advisors Supabase — output sintetico
_9 luglio 2026 · progetto wacknihvdjxltiqvxtqr · via Management API_

## Security advisors

| Livello | Nome | Oggetto | Note |
|---|---|---|---|
| INFO | `rls_enabled_no_policy` | `ai_rate_limit_pubblico`, `auth_otp`, `domande_tesseramento`, `pagamenti_tesseramento` | RLS on senza policy = **deny-by-default** (anon non legge nulla). Scrittura solo via service_role nelle edge function. **Postura sicura**, non un difetto. |
| WARN | `extension_in_public` | `citext`, `vector` | Estensioni in schema public. Spostamento richiede superuser (non disponibile) → **DEBT-010**, accettato. |
| WARN | `anon_security_definer_function_executable` | `has_ruolo`, `has_ruolo_min`, `e_socio_in_regola`, `peso_ruolo` | Funzioni SECURITY DEFINER invocabili da `anon`. **AUD-B4a** (MEDIO): revoke dove non necessario. |
| WARN | `authenticated_security_definer_function_executable` | idem + `ai_messaggi_rimanenti_oggi` | come sopra per ruolo authenticated. |
| WARN | `auth_leaked_password_protection` | Auth | HaveIBeenPwned check disabilitato. **DEBT-009**, feature Pro-only → bloccato. |

## Performance advisors

| Livello | Nome | Note |
|---|---|---|
| INFO | `unindexed_foreign_keys` | `pagamenti_tesseramento_domanda_id_fkey` senza indice di copertura. Tabella minuscola → impatto nullo ora. |
| INFO | `unused_index` (~80 occorrenze) | Molti indici mai usati (DB giovane, poche query). Cleanup opportunistico → **AUD-B4c** (BASSO). |
| WARN | `multiple_permissive_policies` (molte tabelle) | Policy permissive ridondanti per stesso ruolo/azione. Consolidamento → **DEBT-011 / AUD-B4c** (BASSO). |

**Sintesi**: nessun advisor di livello ERROR. Gli INFO su RLS-no-policy sono in realtà la **conferma** che le tabelle sensibili sono chiuse all'accesso pubblico. I WARN sono cleanup pianificabili, nessuna urgenza.
