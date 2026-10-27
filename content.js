(() => {
  if (globalThis.__HAAI_LOADED__) return;
  globalThis.__HAAI_LOADED__ = true;
  try {
    for (const key of ['haai-pending-query-v2', 'haai-return-query-v3', 'haai-restore-origin-v3', 'haai-origin-state-v3', 'haai-origin-url-v3']) sessionStorage.removeItem(key);
  } catch {}
  let pendingLaunchToken = null;
  try {
    const launchUrl = new URL(location.href);
    const fragmentParams = new URLSearchParams(launchUrl.hash.slice(1));
    pendingLaunchToken = fragmentParams.get('haai_token');
    if (pendingLaunchToken) {
      fragmentParams.delete('haai_token');
      launchUrl.hash = fragmentParams.size ? `#${fragmentParams}` : '';
      history.replaceState(history.state, '', `${launchUrl.pathname}${launchUrl.search}${launchUrl.hash}`);
    }
  } catch { pendingLaunchToken = null; }
  const CSS = globalThis.HAAIQuickSearchUI?.css;
  if (!CSS) throw new Error('A közös gyorskereső felületi stílusa nem töltődött be.');
  function runtimeMessage(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : response || { ok: false });
        });
      } catch (error) { resolve({ ok: false, error: String(error) }); }
    });
  }
  const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  function mount() {
    const target = document.querySelector('#szemelyauto');
    const native = target?.querySelector('.micro-frontend-component');
    if (!native || document.getElementById('haai-panel-host')) return;
    const host = document.createElement('div');
    host.id = 'haai-panel-host';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = CSS;
    shadow.append(style);
    const panel = document.createElement('section'); panel.className = 'panel'; panel.setAttribute('aria-label', 'Gyors keresés');
    const form = document.createElement('form');
    const field = document.createElement('div'); field.className = 'field';
    const label = document.createElement('label'); label.textContent = 'Milyen autót keresel?';
    const input = document.createElement('input'); input.className = 'query'; input.type = 'search'; input.maxLength = 500; input.required = true;
    input.id = 'haai-query'; label.htmlFor = input.id;
    const button = document.createElement('button'); button.className = 'submit'; button.type = 'submit';
    const buttonIcon = document.createElement('span'); buttonIcon.className = 'icon'; buttonIcon.setAttribute('aria-hidden', 'true'); buttonIcon.textContent = '✦';
    const buttonLabel = document.createElement('span'); buttonLabel.className = 'label'; buttonLabel.textContent = 'Keresés';
    const progressTrack = document.createElement('span'); progressTrack.className = 'progress-track'; progressTrack.hidden = true; progressTrack.setAttribute('role', 'progressbar'); progressTrack.setAttribute('aria-label', 'A keresés becsült előrehaladása'); progressTrack.setAttribute('aria-valuemin', '0'); progressTrack.setAttribute('aria-valuemax', '100'); progressTrack.setAttribute('aria-valuenow', '0'); progressTrack.setAttribute('aria-valuetext', 'Becsült előrehaladás');
    const progressFill = document.createElement('span'); progressFill.className = 'progress-fill'; progressTrack.append(progressFill);
    button.append(buttonIcon, buttonLabel, progressTrack);
    const status = document.createElement('div'); status.className = 'status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const chipsBox = document.createElement('div'); chipsBox.className = 'chips';
    const helper = document.createElement('div'); helper.className = 'helper';
    const helperText = document.createElement('span'); helperText.id = 'haai-helper'; helperText.textContent = 'Írd le, mi fontos: típus, ár, évjárat vagy extra.';
    const helpButton = document.createElement('button'); helpButton.type = 'button'; helpButton.className = 'help-button'; helpButton.setAttribute('aria-label', 'Hogyan működik a gyors keresés?'); helpButton.setAttribute('aria-haspopup', 'dialog'); helpButton.setAttribute('aria-expanded', 'false'); helpButton.setAttribute('aria-controls', 'haai-help-popup');
    const helpSymbol = document.createElement('span'); helpSymbol.className = 'help-symbol'; helpSymbol.textContent = 'i'; helpSymbol.setAttribute('aria-hidden', 'true'); helpButton.append(helpSymbol);
    const helpPopup = document.createElement('div'); helpPopup.id = 'haai-help-popup'; helpPopup.className = 'help-popup'; helpPopup.setAttribute('popover', 'auto'); helpPopup.setAttribute('role', 'dialog'); helpPopup.setAttribute('aria-labelledby', 'haai-help-title');
    const helpTop = document.createElement('div'); helpTop.className = 'help-top';
    const helpTitle = document.createElement('h2'); helpTitle.id = 'haai-help-title'; helpTitle.className = 'help-title'; helpTitle.textContent = 'Hogyan működik?';
    const helpClose = document.createElement('button'); helpClose.type = 'button'; helpClose.className = 'help-close'; helpClose.setAttribute('aria-label', 'Magyarázat bezárása'); helpClose.textContent = '×';
    helpTop.append(helpTitle, helpClose);
    const helpIntro = document.createElement('p'); helpIntro.textContent = 'Írd be, milyen autót szeretnél, majd kattints a Keresés gombra. A leírásodból beállítjuk a szűrőket, és rögtön megmutatjuk a találatokat.';
    const helpExample = document.createElement('p'); helpExample.className = 'help-example';
    const exampleLabel = document.createElement('span'); exampleLabel.textContent = 'Például így is írhatod:';
    const exampleText = document.createElement('strong'); exampleText.textContent = 'kombi leon 4mftig 14tol 180e km alatt'; helpExample.append(exampleLabel, exampleText);
    const helpUnits = document.createElement('p'); helpUnits.textContent = 'Elég azt megadnod, ami fontos. Írhatsz röviden, ékezetek nélkül is. Az árat forintban (pl. 4m), a futást kilométerben (pl. 180e km) add meg.';
    const helpNote = document.createElement('p'); helpNote.className = 'help-note'; helpNote.textContent = 'Ha egy feltételt nem tudunk beállítani, azt a találatoknál jelezzük. A többi feltétellel elindul a keresés.';
    const helpDisclaimer = document.createElement('p'); helpDisclaimer.className = 'help-disclaimer'; helpDisclaimer.textContent = 'Az AI állítja be a szűrőket, de tévedhet. A keresés szövege a Használtautó AI backendjére, onnan pedig a beállított AI-szolgáltatóhoz kerül feldolgozásra. A backend nem naplózza és nem őrzi meg nyers keresési szövegként; a szolgáltató adatkezelésére és megőrzésére annak aktuális feltételei vonatkoznak.';
    helpPopup.append(helpTop, helpIntro, helpExample, helpUnits, helpNote, helpDisclaimer); helper.append(helperText, helpButton, helpPopup);
    const positionHelp = () => {
      if (!helpPopup.matches(':popover-open')) return;
      const anchor = helpButton.getBoundingClientRect();
      const width = helpPopup.getBoundingClientRect().width;
      const height = helpPopup.getBoundingClientRect().height;
      helpPopup.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - width - 12))}px`;
      const below = anchor.bottom + 8;
      helpPopup.style.top = `${below + height <= innerHeight - 12 ? below : Math.max(12, anchor.top - height - 8)}px`;
    };
    helpButton.addEventListener('click', () => {
      if (helpPopup.matches(':popover-open')) helpPopup.hidePopover();
      else { helpPopup.showPopover(); positionHelp(); }
    });
    helpPopup.addEventListener('toggle', () => helpButton.setAttribute('aria-expanded', String(helpPopup.matches(':popover-open'))));
    helpClose.addEventListener('click', () => { helpPopup.hidePopover(); helpButton.focus({ preventScroll: true }); });
    window.addEventListener('resize', positionHelp);
    window.addEventListener('scroll', positionHelp, { passive: true });
    input.setAttribute('aria-describedby', helperText.id);
    const traditional = document.createElement('div'); traditional.className = 'traditional'; traditional.textContent = 'Hagyományos keresés';
    field.append(label, input); form.append(field, button); panel.append(form, helper, status, chipsBox); shadow.append(panel, traditional);
    target.insertBefore(host, native);
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
    const exampleQueries = globalThis.HAAIQuickSearchUI.examples;
    let exampleIndex = 0, letterIndex = 0, exampleTimer;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function typeExample() {
      if (input.value || document.hidden) return;
      const phrase = exampleQueries[exampleIndex];
      input.placeholder = `Pl. ${phrase.slice(0, ++letterIndex)}`;
      if (letterIndex < phrase.length) exampleTimer = setTimeout(typeExample, 55);
      else exampleTimer = setTimeout(() => {
        if (input.value || document.hidden) return;
        exampleIndex = (exampleIndex + 1) % exampleQueries.length;
        letterIndex = 0; input.placeholder = 'Pl. ';
        exampleTimer = setTimeout(typeExample, 350);
      }, 3800);
    }
    function holdExample() {
      clearTimeout(exampleTimer);
      letterIndex = 0; input.placeholder = `Pl. ${exampleQueries[exampleIndex]}`;
      if (reducedMotion) return;
      exampleTimer = setTimeout(() => {
        if (input.value || document.hidden) return;
        exampleIndex = (exampleIndex + 1) % exampleQueries.length;
        input.placeholder = 'Pl. ';
        exampleTimer = setTimeout(typeExample, 350);
      }, 3800);
    }
    holdExample();
    input.addEventListener('input', () => {
      clearTimeout(exampleTimer);
      if (input.value) { input.placeholder = ''; return; }
      holdExample();
    });
    document.addEventListener('visibilitychange', () => {
      if (reducedMotion || document.hidden || input.value) return;
      holdExample();
    });
    let expectedDurationMs = globalThis.HAAILoadProgress?.DEFAULT_ESTIMATE_MS || 14000;
    let loadingStartedAt = null, progressFrame = null;
    const refreshExpectedDuration = () => {
      try {
        chrome.storage.local.get({ recentSearchDurations: null, lastPerformance: null, searchMode: 'advanced' }, data => {
          if (chrome.runtime.lastError) return;
          expectedDurationMs = globalThis.HAAILoadProgress.estimateDuration(data.recentSearchDurations, data.searchMode, data.lastPerformance);
        });
      } catch {}
    };
    refreshExpectedDuration();
    chrome.storage.onChanged?.addListener(changes => {
      if (changes.recentSearchDurations || changes.lastPerformance) refreshExpectedDuration();
    });
    const paintProgress = () => {
      if (loadingStartedAt === null) return;
      const value = globalThis.HAAILoadProgress.percent(performance.now() - loadingStartedAt, expectedDurationMs);
      progressFill.style.width = `${value}%`;
      progressTrack.setAttribute('aria-valuenow', String(value));
      progressTrack.setAttribute('aria-valuetext', `Becsült előrehaladás: ${value}%`);
      progressFrame = value < 96 ? requestAnimationFrame(paintProgress) : null;
    };
    const setLoading = loading => {
      button.disabled = loading;
      input.disabled = loading;
      button.classList.toggle('loading', loading);
      button.setAttribute('aria-busy', String(loading));
      button.setAttribute('aria-label', loading ? 'Keresés folyamatban' : 'Keresés');
      buttonIcon.classList.toggle('spinner', loading);
      buttonIcon.textContent = loading ? '' : '✦';
      buttonLabel.textContent = loading ? 'Keresés…' : 'Keresés';
      if (loading) {
        loadingStartedAt = performance.now();
        progressTrack.hidden = false;
        progressFill.style.width = '0%';
        progressTrack.setAttribute('aria-valuenow', '0');
        progressTrack.setAttribute('aria-valuetext', 'A keresés becsült előrehaladása');
        progressFrame = requestAnimationFrame(paintProgress);
      } else {
        loadingStartedAt = null;
        if (progressFrame !== null) cancelAnimationFrame(progressFrame);
        progressFrame = null;
        progressFill.style.width = '0%';
        progressTrack.setAttribute('aria-valuenow', '0');
        progressTrack.setAttribute('aria-valuetext', 'Becsült előrehaladás');
        progressTrack.hidden = true;
      }
    };
    const show = (message, kind = '') => { status.textContent = message; status.className = `status ${kind}`; status.setAttribute('role', 'status'); status.removeAttribute('aria-label'); };
    async function launchHomePlan(plan, record) {
      const filters = globalThis.HAAINativeAdapter.validateHomeOperations(plan.filters);
      const omissions = globalThis.HAAINativeAdapter.omissions(plan.omissions);
      if (!filters.length) throw new Error('A B terv nem tartalmaz beállítható keresési feltételt.');
      const frame = document.createElement('iframe');
      frame.title = 'Főoldali keresési feltételek alkalmazása';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:900px;visibility:hidden;pointer-events:none';
      await new Promise((resolve, reject) => {
        let finished = false;
        let applying = false;
        let submitted = false;
        let routePoll;
        const cleanup = () => { clearTimeout(timeout); clearInterval(routePoll); frame.remove(); };
        const fail = error => {
          if (finished) return;
          finished = true; record('error'); cleanup(); reject(error);
        };
        const timeout = setTimeout(() => fail(new Error('A főoldali keresés időtúllépés miatt nem indult el. Próbáld újra.')), 100000);
        const routeChange = async () => {
          if (finished) return;
          try {
            const frameWindow = frame.contentWindow;
            const frameDocument = frame.contentDocument;
            if (!frameWindow || !frameDocument) return;
            if (frameDocument.querySelector('[data-testid="save-search-button"]')) {
              const target = frameWindow.location.href;
              finished = true; record('filters_ready'); record('results_navigation'); cleanup();
              location.assign(target); resolve(); return;
            }
            if (submitted || applying) return;
            const path = frameWindow.location.pathname;
            if (path !== '/' && !path.startsWith('/kereso')) return;
            const form = globalThis.HAAINativeAdapter.findHomeForm(frameDocument);
            if (!form) return;
            applying = true;
            record('filters_start');
            show('Beállítom a keresési szűrőket, majd megnyitom a találatokat…');
            await globalThis.HAAINativeAdapter.applyHome(frameDocument, filters);
            const stored = await runtimeMessage({ type: 'HAAI_STORE_RESULT_NOTICE', omissions });
            if (!stored.ok) throw new Error('A kihagyott feltételek jelzését nem sikerült biztonságosan átadni.');
            record('filters_ready');
            record('submit');
            submitted = true;
            globalThis.HAAINativeAdapter.submitHome(frameDocument);
          } catch (error) { fail(error); }
        };
        frame.addEventListener('load', routeChange);
        routePoll = setInterval(routeChange, 160);
        record('background_open', { directHome: true });
        show('Megnyitom a keresőt, majd beállítom a feltételeket…');
        frame.src = new URL('/kereso', location.origin).href;
        document.body.append(frame);
      });
    }

    async function launchPlan(plan, record, homeEnabled = false) {
      if (plan.mode === 'B') {
        if (!homeEnabled) throw new Error('A B mód nincs engedélyezve ebben a buildben vagy a beállításokban.');
        return launchHomePlan(plan, record);
      }
      if (plan.mode !== 'A') throw new Error('A visszaadott keresési mód nem támogatott.');
      const filters = globalThis.HAAINativeAdapter.validateOperations(plan.filters);
      const omissions = globalThis.HAAINativeAdapter.omissions(plan.omissions);
      if (!filters.length) throw new Error('Nem találtam beállítható keresési feltételt.');
      const framePlan = { filters, omissions, mode: plan.mode, request_id: plan.request_id };
      const frame = document.createElement('iframe');
      frame.title = 'Keresési feltételek alkalmazása';
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:900px;visibility:hidden;pointer-events:none';
      await new Promise((resolve, reject) => {
        let finished = false;
        let detailOpen = false;
        let accepted = false;
        let routePoll;
        const cleanup = () => { clearTimeout(timeout); clearInterval(routePoll); window.removeEventListener('message', onFrameMessage); frame.remove(); };
        const fail = error => {
          if (finished) return;
          finished = true; record('error'); cleanup(); reject(error);
        };
        const onFrameMessage = event => {
          if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.request_id !== framePlan.request_id) return;
          if (event.data.type === 'HAAI_PLAN_ACCEPTED') {
            accepted = true;
            record('filters_start');
            show('Beállítom a keresési szűrőket, majd megnyitom a találatokat…');
          } else if (event.data.type === 'HAAI_PLAN_FAILED') {
            fail(new Error(typeof event.data.error === 'string' ? event.data.error : 'A részletes kereső nem tudta alkalmazni a feltételeket.'));
          }
        };
        const timeout = setTimeout(() => fail(new Error('A keresés időtúllépés miatt nem indult el. Próbáld újra.')), 100000);
        const routeChange = () => {
          if (finished) return;
          try {
            const path = frame.contentWindow.location.pathname;
            if (path.startsWith('/talalatilista/')) {
              const target = frame.contentWindow.location.href;
              finished = true; record('filters_ready'); record('results_navigation'); cleanup();
              location.assign(target); resolve(); return;
            }
            if (path.startsWith('/bovitettkereso/')) {
              if (!detailOpen) { detailOpen = true; record('detail_open'); }
              if (!accepted) frame.contentWindow.postMessage({ type: 'HAAI_APPLY_PLAN', plan: framePlan }, location.origin);
            }
          } catch (error) { fail(error); }
        };
        window.addEventListener('message', onFrameMessage);
        frame.addEventListener('load', routeChange);
        routePoll = setInterval(routeChange, 180);
        record('background_open', { directDetail: true });
        show('Megnyitom a keresőt, majd beállítom a feltételeket…');
        frame.src = new URL('/bovitettkereso/szemelyauto', location.origin).href;
        document.body.append(frame);
      });
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled) return;
      const query = input.value.trim();
      if (query.length < 3) { show('Írj be legalább néhány szót.', 'error'); return; }
      setLoading(true); chipsBox.replaceChildren(); show('Értelmezem a keresési feltételeket… Ez eltarthat néhány másodpercig.');
      const started = performance.now();
      const trace = { version: chrome.runtime.getManifest().version, startedAt: new Date().toISOString(), events: [] };
      const record = (stage, details = {}) => {
        trace.events.push({ stage, elapsedMs: Math.round(performance.now() - started), ...details });
        try { sessionStorage.setItem('haai-performance-v1', JSON.stringify(trace)); } catch {}
        chrome.storage.local.set({ lastPerformance: trace });
      };
      record('start');
      try {
        await runtimeMessage({ type: 'HAAI_STORE_RESULT_NOTICE', omissions: [] });
        const clientConfig = await runtimeMessage({ type: 'HAAI_GET_CONFIG' });
        if (!clientConfig.ok) throw new Error('A bővítmény beállításait nem sikerült betölteni.');
        const enableHomeMode = clientConfig.config?.enableHomeMode === true;
        const requestedMode = enableHomeMode ? 'B' : 'A';
        trace.mode = enableHomeMode ? 'home' : 'advanced';
        record('mode_selected', { mode: requestedMode });
        record('interpret_start');
        const response = await runtimeMessage({ type: 'HAAI_INTERPRET', query, mode: requestedMode, client_request_id: requestId() });
        if (!response.ok) throw new Error(response.error || 'A backend nem érhető el.');
        const plan = response.data;
        if (!plan || !Array.isArray(plan.filters) || !Array.isArray(plan.omissions) || typeof plan.mode !== 'string') throw new Error('A backend válasza nem felel meg az API-szerződésnek.');
        record('interpret_end', { requestId: plan.request_id, timing: plan.timing, attempts: response.attempts });
        if (!['A', 'B'].includes(plan.mode) || plan.mode !== requestedMode) throw new Error('A backend a kért keresési módtól eltérő tervet adott vissza. A szűrőket nem módosítottam.');
        show('Értelmeztem a kérést. Beállítom a szűrőket és megnyitom a találatokat…');
        await launchPlan(plan, record, enableHomeMode);
        return;
      } catch (error) {
        show(`Nem indítottam keresést: ${error.message || String(error)}`, 'error');
      } finally { setLoading(false); }
    });

    if (pendingLaunchToken) {
      const token = pendingLaunchToken; pendingLaunchToken = null;
      setLoading(true); show('Betöltöm a megosztott keresést, majd beállítom a szűrőket…');
      const started = performance.now();
      const trace = { version: chrome.runtime.getManifest().version, startedAt: new Date().toISOString(), mode: 'advanced', events: [] };
      const record = (stage, details = {}) => {
        trace.events.push({ stage, elapsedMs: Math.round(performance.now() - started), ...details });
        try { sessionStorage.setItem('haai-performance-v1', JSON.stringify(trace)); } catch {}
        chrome.storage.local.set({ lastPerformance: trace });
      };
      record('handoff_start');
      runtimeMessage({ type: 'HAAI_CONSUME_PLAN', launchToken: token }).then(async response => {
        if (!response.ok) throw new Error(response.error || 'A keresési hivatkozás nem használható.');
        const plan = response.data;
        if (!plan || !Array.isArray(plan.filters) || !Array.isArray(plan.omissions) || !['A', 'B'].includes(plan.mode)) throw new Error('A megosztott keresés nem támogatott formátumú.');
        let homeEnabled = false;
        if (plan.mode === 'B') {
          const config = await runtimeMessage({ type: 'HAAI_GET_CONFIG' });
          homeEnabled = config.ok && config.config?.enableHomeMode === true;
          if (trace.mode !== 'home') { trace.mode = 'home'; record('mode_selected', { mode: 'B' }); }
        }
        record('handoff_consumed', { requestId: plan.request_id });
        show('Beállítom a keresési szűrőket, majd megnyitom a találatokat…');
        await launchPlan(plan, record, homeEnabled);
      }).catch(error => show(`Nem indítottam keresést: ${error.message || String(error)}`, 'error')).finally(() => setLoading(false));
    }
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled || document.getElementById('haai-panel-host')) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
