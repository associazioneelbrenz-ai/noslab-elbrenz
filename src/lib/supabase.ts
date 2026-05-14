// src/lib/supabase.ts
//
// Singleton Supabase client per uso browser-side.
// Usato dalle pagine pubbliche (es. /registrati, /login) per gestire
// auth, sessioni utente e chiamate alle Edge Functions.
//
// Le credenziali vengono dalle env VITE_* in .env.local (visibili al client by design).
// Solo la publishable key qui — la service_role vive solo nelle Edge Function Secrets.

import { createClient } from '@supabase/supabase-js';

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
    storageKey: 'elbrenz-auth',
  },
});
