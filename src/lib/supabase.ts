// src/lib/supabase.ts
//
// Singleton Supabase client per uso browser-side.
// Usato dalle pagine pubbliche (es. /registrati, /login) per gestire
// auth, sessioni utente e chiamate alle Edge Functions.
//
// Le credenziali vengono dalle env VITE_* in .env.local (visibili al client by design).
// Solo la publishable key qui — la service_role vive solo nelle Edge Function Secrets.

import { createClient } from '@supabase/supabase-js';
import { sessioneCondivisa, CHIAVE_SESSIONE } from './sessione-condivisa';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variabili PUBLIC_SUPABASE_URL e/o PUBLIC_SUPABASE_ANON_KEY mancanti. Verifica il file .env.local.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // niente magic link in URL: auth è gestita da OTP custom
    storageKey: CHIAVE_SESSIONE,
    // [10/8/2026] La sessione vive in un cookie su .elbrenz.eu, che il sito e
    // l'app dei soci vedono tutti e due. Il localStorage continua a essere
    // scritto come prima: se i cookie fossero bloccati non cambia niente.
    storage: sessioneCondivisa(),
  },
});
