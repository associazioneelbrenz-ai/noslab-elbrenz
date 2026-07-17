#!/usr/bin/env node
// send_integrazione.mjs — runner per il reinvio tessera + LINK INTEGRAZIONE
// PERSONALE ai 16 soci storici (+ Giorgia n.22 senza integrazione).
//
// Il link integrazione e' PERSONALE: lo genera l'edge tessera-invio dal codice
// del singolo socio (/integrazione/{codice}). Qui NON si passa nessun token:
// si manda solo { numero, integrazione:true } e l'edge cuce il link giusto.
//
// SICUREZZA: l'INGEST_TOKEN non e' nel codice. Si legge da:
//   1) variabile d'ambiente INGEST_TOKEN (se impostata), altrimenti
//   2) Keychain: security find-generic-password -w -s 'INGEST_TOKEN'
// (override nome voce con --keychain=NOME). Se vuoto -> esce.
//
// USO (Cristian):
//   node send_integrazione.mjs --test        # solo n.4, con integrazione (verifica consegna+link)
//   node send_integrazione.mjs               # batch reale: i 16 soci, con integrazione
//   node send_integrazione.mjs --giorgia     # solo n.22, SENZA integrazione
//   node send_integrazione.mjs --only=7,11   # ri-esegue solo i numeri indicati (falliti)
//   INGEST_TOKEN=xxxx node send_integrazione.mjs --test   # token via env (se il Keychain e' stale)

import { execFileSync } from 'node:child_process'

const SUPABASE_URL = 'https://wacknihvdjxltiqvxtqr.supabase.co'
const ENDPOINT = `${SUPABASE_URL}/functions/v1/tessera-invio`
const NUMERI_16 = [1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
const PAUSA_MS = 2000

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (p) => { const a = args.find((x) => x.startsWith(p)); return a ? a.slice(p.length) : null }

function leggiToken() {
  if (process.env.INGEST_TOKEN && process.env.INGEST_TOKEN.trim()) {
    return { token: process.env.INGEST_TOKEN.trim(), fonte: 'env INGEST_TOKEN' }
  }
  const voce = val('--keychain=') || 'INGEST_TOKEN'
  try {
    const t = execFileSync('security', ['find-generic-password', '-w', '-s', voce], { encoding: 'utf8' }).trim()
    if (t) return { token: t, fonte: `Keychain «${voce}»` }
  } catch { /* voce assente */ }
  return { token: '', fonte: `Keychain «${voce}»` }
}

async function invia(numero, integrazione) {
  const body = integrazione ? { numero, integrazione: true } : { numero }
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ingest-token': TOKEN },
    body: JSON.stringify(body),
  })
  let d = {}
  try { d = await r.json() } catch { /* non-JSON */ }
  return { status: r.status, ok: r.ok && d?.ok === true, d }
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

// --- token ---
const { token: TOKEN, fonte } = leggiToken()
if (!TOKEN) {
  console.error(`✗ INGEST_TOKEN non trovato (${fonte}).`)
  console.error(`  Imposta la voce nel Keychain, oppure lancia:  INGEST_TOKEN=xxxx node send_integrazione.mjs ...`)
  process.exit(1)
}
console.log(`Token letto da: ${fonte}`)

// --- selezione modalita' ---
let numeri, conIntegrazione, etichetta
if (has('--giorgia')) {
  numeri = [22]; conIntegrazione = false; etichetta = 'Giorgia n.22 (senza integrazione)'
} else if (has('--test')) {
  numeri = [4]; conIntegrazione = true; etichetta = 'TEST n.4 (con integrazione)'
} else if (val('--only=')) {
  numeri = val('--only=').split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isInteger)
  conIntegrazione = true; etichetta = `SOLO ${numeri.join(', ')} (con integrazione)`
} else {
  numeri = NUMERI_16; conIntegrazione = true; etichetta = `BATCH 16 soci (con integrazione)`
}

console.log(`\n→ ${etichetta}\n`)
const esiti = []
for (const n of numeri) {
  try {
    const { status, ok, d } = await invia(n, conIntegrazione)
    esiti.push({ n, ok, status, msg: d?.error, link: d?.url_integrazione })
    console.log(ok
      ? `✓ n.${n} · inviata a ${d.inviato_a}${d.url_integrazione ? ` · link: ${d.url_integrazione}` : ''}`
      : `✗ n.${n} · HTTP ${status} · ${d?.error ?? 'errore'}`)
  } catch (e) {
    esiti.push({ n, ok: false, status: 0, msg: String(e) })
    console.log(`✗ n.${n} · eccezione · ${e}`)
  }
  if (numeri.length > 1) await sleep(PAUSA_MS)
}

const ok = esiti.filter((e) => e.ok).map((e) => e.n)
const ko = esiti.filter((e) => !e.ok).map((e) => e.n)
console.log(`\n── Riepilogo ──`)
console.log(`OK (${ok.length}): ${ok.join(', ') || '-'}`)
console.log(`FALLITI (${ko.length}): ${ko.join(', ') || '-'}`)
if (ko.length) console.log(`Ri-esegui i falliti:  node send_integrazione.mjs --only=${ko.join(',')}`)
