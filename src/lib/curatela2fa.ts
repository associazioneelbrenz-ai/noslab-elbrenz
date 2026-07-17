// AAL2 sulle pagine di curatela del sito. I fattori TOTP sono server-side per
// utente (condivisi con l'app soci, dove avviene l'enrollment). Politica soft:
// - admin CON fattore TOTP -> deve superare la sfida 2FA (AAL2) per procedere;
// - admin SENZA fattore -> procede (l'obbligo di attivazione e' guidato nell'app);
// - MFA non disponibile / errore -> non blocca (fail-safe, niente lock-out).
// Ritorna true se si puo' procedere.
import { supabase } from './supabase';

export async function proteggiCuratela2fa(): Promise<boolean> {
  let factorId: string | null = null;
  try {
    const { data: fs } = await supabase.auth.mfa.listFactors();
    const factor = ((fs?.totp ?? []) as any[]).find((f) => f.status === 'verified') ?? null;
    if (!factor) return true; // nessun 2FA attivo: procede (soft)
    factorId = factor.id;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') return true; // gia' verificato
  } catch {
    return true; // MFA non disponibile: non bloccare
  }

  // Ha un fattore ma non e' AAL2: mostra la sfida.
  return await sfida(factorId!);
}

function sfida(factorId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(30,46,38,.8);padding:16px;font-family:Inter,system-ui,sans-serif;';
    wrap.innerHTML = `
      <div style="background:#F8F1E4;max-width:420px;width:100%;border-radius:12px;padding:26px;border-top:4px solid #C8923E;">
        <h2 style="font-family:'Playfair Display',Georgia,serif;font-size:20px;color:#1E2E26;margin:0 0 6px;">Verifica in due passaggi</h2>
        <p style="font-size:14px;color:#1E2E26;opacity:.75;margin:0 0 16px;">Inserisci il codice a 6 cifre della tua app di autenticazione per accedere alla curatela.</p>
        <input id="c2fa-code" inputmode="numeric" maxlength="6" placeholder="000000" style="width:100%;border:2px solid #E5DFCF;background:#fff;border-radius:8px;padding:12px;font-size:22px;letter-spacing:.4em;text-align:center;color:#1E2E26;" />
        <div id="c2fa-err" style="display:none;background:#fbecec;color:#1E2E26;border-radius:8px;padding:8px 10px;font-size:13px;margin-top:10px;"></div>
        <button id="c2fa-ok" style="margin-top:14px;width:100%;background:#C8923E;color:#1E2E26;border:0;border-radius:8px;padding:13px;font-weight:600;font-size:15px;cursor:pointer;">Verifica</button>
        <button id="c2fa-esci" style="margin-top:10px;width:100%;background:none;border:0;color:#8a6215;text-decoration:underline;cursor:pointer;font-size:14px;">Esci</button>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('#c2fa-code') as HTMLInputElement;
    const errBox = wrap.querySelector('#c2fa-err') as HTMLElement;
    const btn = wrap.querySelector('#c2fa-ok') as HTMLButtonElement;
    input.focus();

    async function verifica() {
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) return;
      btn.disabled = true; btn.textContent = 'Verifico…'; errBox.style.display = 'none';
      try {
        const ch = await supabase.auth.mfa.challenge({ factorId });
        if (ch.error) throw ch.error;
        const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
        if (v.error) throw v.error;
        wrap.remove();
        resolve(true);
      } catch {
        btn.disabled = false; btn.textContent = 'Verifica';
        errBox.textContent = 'Codice non valido. Riprova.'; errBox.style.display = 'block';
      }
    }
    btn.addEventListener('click', verifica);
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') verifica(); });
    (wrap.querySelector('#c2fa-esci') as HTMLButtonElement).addEventListener('click', async () => {
      await supabase.auth.signOut(); wrap.remove(); resolve(false);
    });
  });
}
