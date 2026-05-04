/* =============================================================================
   andreas-chat.js
   Logica della chat /andreas. Vanilla ES6, niente framework.
   Caricato dal componente AndreasChat.astro come <script type="module">.
   ============================================================================= */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONFIG
  //
  // Override possibile in produzione tramite window.ANDREAS_CONFIG, settato
  // PRIMA del caricamento di questo script (es. nel <head> del Layout o in un
  // tag inline subito prima dell'import). Esempio:
  //
  // <script>
  //   window.ANDREAS_CONFIG = {
  //     MOCK_MODE: false,
  //     SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
  //     SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  //   };
  // </script>
  // ---------------------------------------------------------------------------

  const DEFAULT_CONFIG = {
    // true = risposte simulate (per dev locale senza chiamare edge function)
    // false = chiama davvero l'edge function andreas-chat
    MOCK_MODE: true,

    SUPABASE_URL: 'https://wacknihvdjxltiqvxtqr.supabase.co',
    SUPABASE_ANON_KEY: '', // riempi via window.ANDREAS_CONFIG in produzione

    INITIAL_QUOTA: 3,

    URL_REGISTRATI: '/registrati',
    URL_TESSERAMENTO: '/tesseramento',

    // Asset paths (relativi a /public)
    ASSET_ANDREAS_SORRISO: '/assets/branding/andreas/andreas-sorriso-bubble.png',
    ASSET_ANDREAS_PENSA: '/assets/branding/andreas/andreas-pensa-bubble.png',

    // Velocità typewriter (caratteri/sec). 0 = render istantaneo
    TYPEWRITER_CPS: 80,

    // Delay simulato modalità MOCK (ms)
    MOCK_DELAY_MIN: 1800,
    MOCK_DELAY_MAX: 3500,

    // CDN per markdown + sanitization
    CDN_MARKED: 'https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js',
    CDN_DOMPURIFY: 'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js',
  };

  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.ANDREAS_CONFIG || {});

  // ---------------------------------------------------------------------------
  // LIB LOADER (marked + DOMPurify)
  // ---------------------------------------------------------------------------

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Evita doppio caricamento
      if ([...document.scripts].some(s => s.src === src)) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureLibs() {
    if (typeof window.marked === 'undefined') {
      await loadScript(CONFIG.CDN_MARKED);
    }
    if (typeof window.DOMPurify === 'undefined') {
      await loadScript(CONFIG.CDN_DOMPURIFY);
    }
    if (window.marked && window.marked.setOptions) {
      window.marked.setOptions({ breaks: true, gfm: true });
    }
  }

  // ---------------------------------------------------------------------------
  // STATO
  // ---------------------------------------------------------------------------

  const state = {
    messages: [],
    remainingQuota: CONFIG.INITIAL_QUOTA,
    isPending: false,
    isLimitReached: false,
  };

  // ---------------------------------------------------------------------------
  // ELEMENTI DOM
  // ---------------------------------------------------------------------------

  let $messages, $textarea, $sendBtn, $form, $counter;

  function bindElements() {
    $messages = document.getElementById('andreas-messages');
    $textarea = document.getElementById('andreas-textarea');
    $sendBtn = document.getElementById('andreas-send');
    $form = document.getElementById('andreas-composer');
    $counter = document.getElementById('andreas-counter');

    if (!$messages || !$textarea || !$sendBtn || !$form || !$counter) {
      console.error('[AndreasChat] Elementi DOM non trovati. Hai inserito <AndreasChat /> nella pagina?');
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // WELCOME MESSAGE
  // ---------------------------------------------------------------------------

  function renderWelcome() {
    const welcomeContent = `<span class="ac-bondi">Bondì.</span> Sono <strong>Andreas</strong>, l'assistente digitale dell'Associazione El Brenz. Posso accompagnarti nella storia, nella lingua e nella cultura delle nostre valli — Non, Sole, Rabbi, Pejo: dai Principati Vescovili alla Contea Principesca del Tirolo, dalle Guerre Rustiche al ladino anaunico, dalle stue ai mulini.

Hai <strong>3 domande gratuite oggi</strong>. Per andare oltre, <a href="${CONFIG.URL_REGISTRATI}">registrati gratis come ospite</a> o <a href="${CONFIG.URL_TESSERAMENTO}">diventa socio</a> (10€/anno).

Da dove vuoi partire?`;

    appendMessage({
      role: 'assistant',
      content: welcomeContent,
      id: 'andreas-msg-welcome',
      skipMarkdown: true,
    });

    appendChips();
  }

  function appendChips() {
    const chips = [
      { text: 'Chi era Andreas Hofer?', q: 'Chi era Andreas Hofer?' },
      { text: 'Cosa sono state le Guerre Rustiche?', q: 'Cosa sono state le Guerre Rustiche nelle Valli del Noce?' },
      { text: "Come si dice 'casa' in nones?", q: "Come si dice 'casa' in nones?" },
      { text: "Quando nasce l'Associazione El Brenz?", q: "Quando nasce l'Associazione El Brenz?" },
    ];

    const wrapper = document.createElement('div');
    wrapper.id = 'andreas-chips';
    wrapper.className = 'andreas-chips';
    wrapper.innerHTML = `
      <div class="andreas-chips__label">DOMANDE DI ESEMPIO</div>
      <div class="andreas-chips__list">
        ${chips.map(c => `<button type="button" class="andreas-chip" data-question="${escapeHtml(c.q)}">${escapeHtml(c.text)}</button>`).join('')}
      </div>
    `;
    $messages.appendChild(wrapper);

    wrapper.querySelectorAll('.andreas-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-question');
        hideChips();
        $textarea.value = q;
        submitQuestion(q);
      });
    });
  }

  function hideChips() {
    const $chips = document.getElementById('andreas-chips');
    if ($chips) $chips.classList.add('andreas-chips--hidden');
  }

  // ---------------------------------------------------------------------------
  // MESSAGGI
  // ---------------------------------------------------------------------------

  function appendMessage({ role, content, sources, id, skipMarkdown = false }) {
    const article = document.createElement('article');
    article.className = `andreas-msg andreas-msg--${role}`;
    article.id = id || `andreas-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    article.setAttribute('role', 'article');

    let avatar;
    if (role === 'user') {
      avatar = document.createElement('div');
      avatar.className = 'andreas-msg__avatar';
      avatar.textContent = 'tu';
      avatar.setAttribute('aria-hidden', 'true');
    } else {
      avatar = document.createElement('img');
      avatar.className = 'andreas-msg__avatar';
      avatar.src = CONFIG.ASSET_ANDREAS_SORRISO;
      avatar.alt = 'Andreas';
      avatar.width = 40;
      avatar.height = 40;
      avatar.loading = 'lazy';
      avatar.decoding = 'async';
    }

    const bubble = document.createElement('div');
    bubble.className = 'andreas-msg__bubble';

    if (skipMarkdown) {
      bubble.innerHTML = renderHtmlSafe(content);
    } else if (role === 'user') {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = '';
      bubble.dataset.fullContent = content;
    }

    article.appendChild(avatar);
    article.appendChild(bubble);
    $messages.appendChild(article);

    if (sources && sources.length > 0) {
      const sourcesEl = renderSources(sources);
      bubble.appendChild(sourcesEl);
    }

    scrollToBottom();
    return article;
  }

  // ---------------------------------------------------------------------------
  // BUBBLE "STA PENSANDO"
  // ---------------------------------------------------------------------------

  function appendThinking() {
    const article = document.createElement('article');
    article.className = 'andreas-msg andreas-msg--assistant andreas-msg--thinking';
    article.id = 'andreas-msg-thinking';

    const avatar = document.createElement('img');
    avatar.className = 'andreas-msg__avatar';
    avatar.src = CONFIG.ASSET_ANDREAS_PENSA;
    avatar.alt = 'Andreas sta pensando';
    avatar.width = 40;
    avatar.height = 40;

    const bubble = document.createElement('div');
    bubble.className = 'andreas-msg__bubble';
    bubble.innerHTML = `
      <span>Andreas sta pensando</span>
      <span class="andreas-thinking-dots" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    `;

    article.appendChild(avatar);
    article.appendChild(bubble);
    $messages.appendChild(article);
    scrollToBottom();
  }

  function removeThinking() {
    const $thinking = document.getElementById('andreas-msg-thinking');
    if ($thinking) $thinking.remove();
  }

  // ---------------------------------------------------------------------------
  // FONTI
  // ---------------------------------------------------------------------------

  function renderSources(sources) {
    const wrapper = document.createElement('div');
    wrapper.className = 'andreas-msg__sources';

    const id = `andreas-sources-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'andreas-sources-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', id);
    toggle.innerHTML = `
      <span>FONTI (${sources.length})</span>
      <span class="andreas-sources-toggle__chev" aria-hidden="true">▾</span>
    `;

    const list = document.createElement('div');
    list.className = 'andreas-sources-list';
    list.id = id;
    list.hidden = true;

    sources.forEach(src => {
      const item = document.createElement('div');
      item.className = 'andreas-source-item';
      let html = `<div class="andreas-source-item__title">${escapeHtml(src.titolo || 'Sorgente')}</div>`;
      if (src.tipo) {
        html += `<div class="andreas-source-item__type">${escapeHtml(src.tipo)}</div>`;
      }
      if (src.url) {
        html += `<a class="andreas-source-item__link" href="${escapeHtml(src.url)}" target="_blank" rel="noopener">Apri sul sito ↗</a>`;
      }
      item.innerHTML = html;
      list.appendChild(item);
    });

    toggle.addEventListener('click', () => {
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isOpen));
      list.hidden = isOpen;
    });

    wrapper.appendChild(toggle);
    wrapper.appendChild(list);
    return wrapper;
  }

  // ---------------------------------------------------------------------------
  // TYPEWRITER + MARKDOWN
  // ---------------------------------------------------------------------------

  async function renderTypewriter(bubble, fullContent) {
    if (CONFIG.TYPEWRITER_CPS <= 0) {
      bubble.innerHTML = renderMarkdown(fullContent);
      return;
    }

    const charDelay = 1000 / CONFIG.TYPEWRITER_CPS;
    let i = 0;
    const batchSize = Math.max(1, Math.floor(fullContent.length / 60));

    while (i < fullContent.length) {
      const next = fullContent.slice(0, i + batchSize);
      bubble.innerHTML = renderMarkdown(next);
      i += batchSize;
      scrollToBottom();
      await sleep(charDelay * batchSize);
    }
    bubble.innerHTML = renderMarkdown(fullContent);
  }

  function renderMarkdown(text) {
    if (!window.marked || !window.DOMPurify) {
      return escapeHtml(text); // fallback se le lib non caricano
    }
    const html = window.marked.parse(text);
    return window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'h3', 'h4'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
  }

  function renderHtmlSafe(html) {
    if (!window.DOMPurify) {
      return escapeHtml(html);
    }
    return window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'span', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'class'],
    });
  }

  // ---------------------------------------------------------------------------
  // SUBMIT
  // ---------------------------------------------------------------------------

  async function submitQuestion(text) {
    text = (text || '').trim();
    if (!text || state.isPending || state.isLimitReached) return;

    state.isPending = true;
    $sendBtn.disabled = true;
    $textarea.disabled = true;
    $textarea.value = '';
    autosize();
    hideChips();

    appendMessage({ role: 'user', content: text });
    appendThinking();

    try {
      let response;
      if (CONFIG.MOCK_MODE) {
        response = await mockFetchAnswer(text);
      } else {
        response = await realFetchAnswer(text);
      }

      removeThinking();

      if (!response.ok) {
        if (response.error === 'rate_limit_daily') {
          showLimitReached();
          return;
        }
        throw new Error(response.message || 'Errore');
      }

      const article = appendMessage({
        role: 'assistant',
        content: '',
        sources: response.sourcesDedup || response.sources || [],
      });
      const bubble = article.querySelector('.andreas-msg__bubble');
      const sourcesEl = bubble.querySelector('.andreas-msg__sources');
      if (sourcesEl) sourcesEl.remove();

      await renderTypewriter(bubble, response.response);

      const sources = response.sourcesDedup || response.sources || [];
      if (sources.length > 0) {
        bubble.appendChild(renderSources(sources));
      }

      state.remainingQuota = Math.max(0, state.remainingQuota - 1);
      updateCounter();

      if (state.remainingQuota === 0) {
        setTimeout(showLimitReached, 600);
      }
    } catch (err) {
      removeThinking();
      appendMessage({
        role: 'assistant',
        content: 'Andreas è momentaneamente non disponibile. Riprova tra qualche minuto, oppure scrivi a [info@elbrenz.eu](mailto:info@elbrenz.eu).',
      });
      console.error('[AndreasChat]', err);
    } finally {
      state.isPending = false;
      if (!state.isLimitReached) {
        $sendBtn.disabled = false;
        $textarea.disabled = false;
        $textarea.focus();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // FETCH MOCK
  // ---------------------------------------------------------------------------

  async function mockFetchAnswer(question) {
    const delay = CONFIG.MOCK_DELAY_MIN + Math.random() * (CONFIG.MOCK_DELAY_MAX - CONFIG.MOCK_DELAY_MIN);
    await sleep(delay);

    const q = question.toLowerCase();

    if (q.includes('hofer')) {
      return {
        ok: true,
        response: `**Andreas Hofer** (1767–1810) fu il leader della rivolta tirolese del 1809 contro l'occupazione franco-bavarese del Tirolo storico.

Originario della Val Passiria, conduceva una locanda al *Sandhof*. Quando Napoleone cedette il Tirolo ai bavaresi, Hofer organizzò la resistenza contadina vincendo tre delle quattro battaglie del Bergisel a Innsbruck.

Le **Valli del Noce** parteciparono alla rivolta: nel Sole e nel Non si formarono compagnie di *Schützen* (tiratori scelti) che combatterono al fianco di Hofer. Dopo la sconfitta finale e il tradimento da parte di un compaesano, Hofer fu fucilato a Mantova il 20 febbraio 1810.

La sua figura è tutelata oggi come simbolo dell'autonomia del Tirolo storico, da non confondere con strumentalizzazioni politiche moderne.`,
        sourcesDedup: [
          { titolo: 'Andreas Hofer e il Tirolo storico', tipo: 'Articolo', url: 'https://www.elbrenz.eu/articoli/andreas-hofer' },
          { titolo: 'Le Valli del Noce nel 1809', tipo: 'Articolo', url: 'https://www.elbrenz.eu/articoli/valli-noce-1809' },
          { titolo: 'Schützenkompanien anauniche', tipo: 'Ricerca' },
        ],
      };
    }

    if (q.includes('guerre rustiche') || q.includes('guerra rustica')) {
      return {
        ok: true,
        response: `Le **Guerre Rustiche** del 1525 furono una rivolta contadina che attraversò il Tirolo storico, comprese le Valli del Noce.

In *Val di Sole* e *Val di Non* i contadini si sollevarono contro i privilegi del clero e della nobiltà locale, ispirati dai *12 Articoli* di Memmingen. **Michael Gaismair** divenne il leader principale.

Le valli anauniche videro:
- Assalti ai castelli dei *Thun* e degli *Spaur*
- Saccheggio del castello di *Cles*
- Repressione durissima da parte del Principe Vescovo Bernardo Clesio

La memoria delle Guerre Rustiche è ancora viva nella toponomastica e nei racconti popolari delle nostre valli.`,
        sourcesDedup: [
          { titolo: 'Le Guerre Rustiche nelle Valli del Noce', tipo: 'Articolo', url: 'https://www.elbrenz.eu/articoli/guerre-rustiche' },
          { titolo: 'Michael Gaismair', tipo: 'Articolo', url: 'https://www.elbrenz.eu/articoli/gaismair' },
          { titolo: 'Bernardo Clesio e la repressione', tipo: 'Ricerca' },
        ],
      };
    }

    if (q.includes('casa') && (q.includes('nones') || q.includes('ladino'))) {
      return {
        ok: true,
        response: `In *nones* (variante anaunica del ladino) "casa" si dice **'cèsa'** o **'ciasa'** a seconda del paese.

Esempi d'uso:
- *Vag a cèsa* — "Vado a casa"
- *La cèsa de mia nòna* — "La casa di mia nonna"

Nelle altre varianti del ladino anaunico parlato nelle Valli del Noce:
- **Solander** (Val di Sole): *cèsa*
- **Rabies** (Val di Rabbi): *ciasa*
- **Pegaes** (Val di Pejo): *ciasa*

L'etimologia risale al latino *casa*, ma con la palatalizzazione tipica del ladino della parlata C+A → C+I/E.`,
        sourcesDedup: [
          { titolo: 'Glossario del ladino anaunico', tipo: 'Risorsa' },
          { titolo: 'Le varianti del nones', tipo: 'Articolo', url: 'https://www.elbrenz.eu/articoli/varianti-nones' },
        ],
      };
    }

    if (q.includes('nasce') || q.includes('fondazione') || (q.includes('quando') && q.includes('brenz'))) {
      return {
        ok: true,
        response: `L'**Associazione Storico Culturale Linguistica El Brenz delle Valli del Noce** è stata fondata il **21 dicembre 2009** a Malè, in Val di Sole.

Lo *Statuto* attuale è stato approvato dall'Assemblea dei Soci nel **gennaio 2014**.

L'Associazione opera nell'intero territorio delle Valli del Noce (Non, Sole, Rabbi, Pejo) per la valorizzazione della **storia tirolese**, della **lingua ladino-anaunica** e della **cultura materiale** delle nostre comunità.

> *Radici profonde non gelano* — il motto dell'Associazione`,
        sourcesDedup: [
          { titolo: 'Statuto El Brenz 2014', tipo: 'Documento ufficiale' },
          { titolo: 'Atto costitutivo 21/12/2009', tipo: 'Documento ufficiale' },
        ],
      };
    }

    return {
      ok: true,
      response: `Mi spiace, in modalità MOCK posso rispondere solo alle 4 domande di esempio. Per testare la chat con risposte reali, configura l'edge function come da documentazione.

Nel frattempo prova: Chi era Andreas Hofer? · Cosa sono state le Guerre Rustiche? · Come si dice "casa" in nones? · Quando nasce l'Associazione El Brenz?`,
      sourcesDedup: [],
    };
  }

  // ---------------------------------------------------------------------------
  // FETCH REALE — chiama l'edge function andreas-chat v3
  // ---------------------------------------------------------------------------

  async function realFetchAnswer(question) {
    const url = `${CONFIG.SUPABASE_URL}/functions/v1/andreas-chat`;
    // Nota: NON inviamo Authorization né apikey header.
    // L'edge function andreas-chat v3 è pubblica (no-verify-jwt) e li
    // rifiuta con HTTP 400. Validato dal bash elbrenz_ma1_test_andreas.sh
    // che ha passato 15/15 query senza alcun header di auth.
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Contratto edge function andreas-chat v3 (validato M.A.1 15/15):
      // body field = "query", non "message".
      body: JSON.stringify({ query: question }),
    });

    if (res.status === 429) {
      return { ok: false, error: 'rate_limit_daily' };
    }
    if (!res.ok) {
      // Provo comunque a leggere il body, magari c'è un messaggio utile
      let detail = '';
      try {
        const errBody = await res.json();
        detail = errBody.error || errBody.message || '';
      } catch (_) { /* ignore */ }
      return {
        ok: false,
        error: 'server_error',
        message: `HTTP ${res.status}${detail ? ' — ' + detail : ''}`,
      };
    }

    const data = await res.json();

    // Mappa la risposta al formato che il client si aspetta.
    // Contratto edge function v3:
    // - { ok: true, risposta|messaggio|answer|text: "...", fonti|sources|citations: [...] }
    // - { ok: false, error: "..." }
    if (data.ok === false) {
      return { ok: false, error: data.error || 'server_error', message: data.error };
    }

    const responseText =
      data.risposta || data.messaggio || data.answer || data.text || '';
    const sources =
      data.fonti || data.sources || data.citations || [];

    return {
      ok: true,
      response: responseText,
      sourcesDedup: sources,
    };
  }

  // ---------------------------------------------------------------------------
  // CTA LIMITE RAGGIUNTO
  // ---------------------------------------------------------------------------

  function showLimitReached() {
    state.isLimitReached = true;
    $textarea.disabled = true;
    $sendBtn.disabled = true;
    $textarea.placeholder = 'Limite giornaliero raggiunto';
    hideChips();

    const cta = document.createElement('div');
    cta.className = 'andreas-limit-cta';
    cta.setAttribute('role', 'region');
    cta.setAttribute('aria-label', 'Limite domande raggiunto');
    cta.innerHTML = `
      <h3 class="andreas-limit-cta__title">Hai usato le 3 domande gratuite di oggi.</h3>
      <p class="andreas-limit-cta__text">
        <a href="${CONFIG.URL_REGISTRATI}">Registrati gratis come ospite</a>
        per continuare domani con più libertà, oppure
        <a href="${CONFIG.URL_TESSERAMENTO}">diventa socio</a> (10€/anno)
        per Andreas senza limiti e per sostenere <em>la nosa Sociazion</em>.
      </p>
      <div class="andreas-limit-cta__buttons">
        <a href="${CONFIG.URL_REGISTRATI}" class="andreas-limit-cta__btn andreas-limit-cta__btn--primary">Registrati gratis</a>
        <a href="${CONFIG.URL_TESSERAMENTO}" class="andreas-limit-cta__btn andreas-limit-cta__btn--secondary">Diventa socio</a>
      </div>
    `;
    $messages.appendChild(cta);
    scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // COUNTER
  // ---------------------------------------------------------------------------

  function updateCounter() {
    const n = state.remainingQuota;
    $counter.innerHTML = `<strong>${n}</strong> domand${n === 1 ? 'a rimanente' : 'e rimanenti'} oggi`;
    if (n <= 1) $counter.classList.add('andreas-chat__counter--low');
  }

  // ---------------------------------------------------------------------------
  // TEXTAREA AUTOSIZE
  // ---------------------------------------------------------------------------

  function autosize() {
    $textarea.style.height = 'auto';
    $textarea.style.height = Math.min($textarea.scrollHeight, 140) + 'px';
  }

  // ---------------------------------------------------------------------------
  // UTILS
  // ---------------------------------------------------------------------------

  function scrollToBottom() {
    // Scrolla all'ultimo messaggio aggiunto, NON al fondo del documento.
    // Così l'utente vede sempre l'inizio della risposta in arrivo e non il
    // footer disclaimer. Bug fix v0.1 → v0.2 (scroll-anchor).
    requestAnimationFrame(() => {
      const $lastMsg = $messages.lastElementChild;
      if (!$lastMsg) return;
      $lastMsg.scrollIntoView({
        behavior: 'smooth',
        block: 'end',     // ancora il fondo dell'elemento al fondo del viewport
        inline: 'nearest',
      });
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // INIT
  // ---------------------------------------------------------------------------

  async function init() {
    if (!bindElements()) return;
    await ensureLibs();

    // Eventi
    $form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitQuestion($textarea.value);
    });
    $textarea.addEventListener('input', autosize);
    $textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitQuestion($textarea.value);
      }
    });

    renderWelcome();

    // Focus su desktop solo (su mobile aprirebbe la tastiera all'arrivo)
    if (window.matchMedia('(min-width: 641px)').matches) {
      $textarea.focus();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
