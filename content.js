(() => {
  if (globalThis.__HAAI_LOADED__) return;
  globalThis.__HAAI_LOADED__ = true;
  try {
    for (const key of ['haai-pending-query-v2', 'haai-return-query-v3', 'haai-restore-origin-v3', 'haai-origin-state-v3', 'haai-origin-url-v3', 'haai-performance-v1']) sessionStorage.removeItem(key);
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
    button.append(buttonIcon, buttonLabel);
    const submitWrap = document.createElement('div'); submitWrap.className = 'submit-wrap';
    const progress = document.createElement('div'); progress.className = 'progress'; progress.hidden = true; progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', 'Keresés folyamatban'); progress.setAttribute('aria-valuetext', 'A keresés folyamatban van');
    const progressFill = document.createElement('div'); progressFill.className = 'progress-fill'; progressFill.setAttribute('aria-hidden', 'true'); progress.append(progressFill);
    submitWrap.append(button, progress);
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
    const helpIntro = document.createElement('p'); helpIntro.textContent = 'Írd le, milyen autót keresel, majd kattints a Keresés gombra. A szűrők beállítása után megnyílnak a találatok.';
    const helpExample = document.createElement('p'); helpExample.className = 'help-example';
    const exampleLabel = document.createElement('span'); exampleLabel.textContent = 'Például így is írhatod:';
    const exampleText = document.createElement('strong'); exampleText.textContent = 'automata Honda HR-V 7 millióig, 2019-től'; helpExample.append(exampleLabel, exampleText);
    const helpUnits = document.createElement('p'); helpUnits.textContent = 'Elég azt megadnod, ami fontos. Röviden, ékezetek nélkül is írhatsz. Az árat forintban, a futást kilométerben add meg.';
    const helpNote = document.createElement('p'); helpNote.className = 'help-note'; helpNote.textContent = 'Ha egy feltételt nem sikerült beállítani, arról a találati oldalon jelzést kapsz.';
    const helpDisclaimer = document.createElement('p'); helpDisclaimer.className = 'help-disclaimer'; helpDisclaimer.textContent = 'A keresés szövegét külső AI-szolgáltató dolgozza fel. Az AI tévedhet, ezért ellenőrizd a beállított szűrőket és a találatokat.';
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
    field.append(label, input); form.append(field, submitWrap); panel.append(form, helper, status, chipsBox); shadow.append(panel, traditional);
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
    let isLoading = false;
    const setLoading = loading => {
      button.disabled = loading;
      input.disabled = loading;
      button.classList.toggle('loading', loading);
      button.setAttribute('aria-busy', String(loading));
      button.setAttribute('aria-label', loading ? 'Keresés folyamatban' : 'Keresés');
      buttonIcon.classList.toggle('spinner', loading);
      buttonIcon.textContent = loading ? '' : '✦';
      buttonLabel.textContent = loading ? 'Keresés…' : 'Keresés';
      progress.hidden = !loading;
      isLoading = loading;
    };
    const show = (message, kind = '') => {
      status.textContent = message;
      status.className = `status ${kind}`;
      status.hidden = isLoading && kind !== 'error';
      status.setAttribute('role', 'status');
      status.removeAttribute('aria-label');
    };
    async function launchPlan(plan) {
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
        let accepted = false;
        let routePoll;
        const cleanup = () => { clearTimeout(timeout); clearInterval(routePoll); window.removeEventListener('message', onFrameMessage); frame.remove(); };
        const fail = error => {
          if (finished) return;
          finished = true; cleanup(); reject(error);
        };
        const onFrameMessage = event => {
          if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.request_id !== framePlan.request_id) return;
          if (event.data.type === 'HAAI_PLAN_ACCEPTED') {
            accepted = true;
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
            if (path.startsWith('/talalatilista/') || frame.contentDocument?.querySelector('[data-testid="save-search-button"]')) {
              const target = frame.contentWindow.location.href;
              finished = true; cleanup();
              location.assign(target); resolve(); return;
            }
            if (path.startsWith('/bovitettkereso/')) {
              if (!accepted) frame.contentWindow.postMessage({ type: 'HAAI_APPLY_PLAN', plan: framePlan }, location.origin);
            }
          } catch (error) { fail(error); }
        };
        window.addEventListener('message', onFrameMessage);
        frame.addEventListener('load', routeChange);
        routePoll = setInterval(routeChange, 180);
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
      try {
        await runtimeMessage({ type: 'HAAI_STORE_RESULT_NOTICE', omissions: [] });
        const requestedMode = 'A';
        const response = await runtimeMessage({ type: 'HAAI_INTERPRET', query, mode: requestedMode, client_request_id: requestId() });
        if (!response.ok) throw new Error(response.error || 'A keresés most nem érhető el. Próbáld újra később.');
        const plan = response.data;
        if (!plan || !Array.isArray(plan.filters) || !Array.isArray(plan.omissions) || typeof plan.mode !== 'string') throw new Error('A keresési feltételeket nem sikerült beolvasni.');
        if (plan.mode !== requestedMode) throw new Error('A keresési feltételeket nem sikerült beállítani. Próbáld újra.');
        show('Értelmeztem a kérést. Beállítom a szűrőket és megnyitom a találatokat…');
        await launchPlan(plan);
        return;
      } catch (error) {
        show(`Nem sikerült elindítani a keresést: ${error.message || String(error)}`, 'error');
      } finally { setLoading(false); }
    });

    if (pendingLaunchToken) {
      const token = pendingLaunchToken; pendingLaunchToken = null;
      setLoading(true); show('Betöltöm a megosztott keresést, majd beállítom a szűrőket…');
      runtimeMessage({ type: 'HAAI_CONSUME_PLAN', launchToken: token }).then(async response => {
        if (!response.ok) throw new Error(response.error || 'A keresési hivatkozás nem használható.');
        const plan = response.data;
        if (!plan || !Array.isArray(plan.filters) || !Array.isArray(plan.omissions) || plan.mode !== 'A') throw new Error('A megosztott keresés nem támogatott formátumú.');
        show('Beállítom a keresési szűrőket, majd megnyitom a találatokat…');
        await launchPlan(plan);
      }).catch(error => show(`Nem sikerült elindítani a keresést: ${error.message || String(error)}`, 'error')).finally(() => setLoading(false));
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
