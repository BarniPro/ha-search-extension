(() => {
  // SEO result pages can use arbitrary paths; identify them by their native UI.
  if (!document.querySelector('[data-testid="save-search-button"]')) return;

  const noticePromise = new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type: 'HAAI_CONSUME_RESULT_NOTICE' }, response => {
        resolve(chrome.runtime.lastError ? null : response || null);
      });
    } catch { resolve(null); }
  });

  noticePromise.then(data => {
    if (!data?.ok || !Array.isArray(data.omissions)) return;
    const omissions = [...new Set(data.omissions.filter(x => typeof x === 'string' && x.trim()))].slice(0, 8);

    const mount = () => {
      const heading = document.querySelector('h1');
      if (!heading) return false;
      if (omissions.length) {
        const box = document.createElement('div');
        box.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0;padding:12px;background:#fff8f1;border:1px solid #f0c39f;border-left:4px solid #d56a23;border-radius:4px;color:#333;font:14px/1.45 Roboto,Arial,sans-serif';

        const notice = document.createElement('div');
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'flex:1 1 300px;margin:0;color:#684126';
        const noticeHeading = document.createElement('div');
        noticeHeading.textContent = 'Ezeket a keresési feltételeket nem sikerült beállítani:';
        noticeHeading.style.cssText = 'font-weight:600;margin-bottom:3px';
        notice.append(noticeHeading);

        const list = document.createElement('ul');
        list.style.cssText = 'margin:0;padding-left:19px';
        for (const omission of omissions) {
          const item = document.createElement('li');
          item.textContent = omission;
          list.append(item);
        }
        notice.append(list);
        const explanation = document.createElement('div');
        explanation.textContent = 'A keresés a többi felismert feltétellel indult.';
        explanation.style.cssText = 'margin-top:5px;color:#555;font-size:12px';
        notice.append(explanation);
        box.append(notice);

        const back = document.createElement('button');
        back.type = 'button';
        back.textContent = 'Vissza a keresőhöz';
        back.style.cssText = 'flex:none;padding:8px 12px;border:1px solid #ff4200;border-radius:4px;background:#ff4200;color:#fff;font:500 14px Roboto,Arial,sans-serif;cursor:pointer';
        back.addEventListener('click', () => {
          sessionStorage.removeItem('haai-return-query-v3');
          sessionStorage.removeItem('haai-restore-origin-v3');
          sessionStorage.removeItem('haai-origin-state-v3');
          sessionStorage.removeItem('haai-origin-url-v3');
          location.assign('/kereso');
        });
        box.append(back);
        heading.parentElement.after(box);
      }

      // Measure only after the native results page has had time to paint.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          const trace = JSON.parse(sessionStorage.getItem('haai-performance-v1'));
          if (!Array.isArray(trace?.events) || !(trace.events.some(e => e.stage === 'results_navigation') || trace.mode === 'home' && trace.events.some(e => e.stage === 'submit')) || trace.events.some(e => e.stage === 'results_visible')) return;
          const start = Date.parse(trace.startedAt);
          if (!Number.isFinite(start)) return;
          trace.events.push({ stage: 'results_visible', elapsedMs: Date.now() - start });
          sessionStorage.setItem('haai-performance-v1', JSON.stringify(trace));
          const progress = globalThis.HAAILoadProgress;
          if (progress) {
            chrome.storage.local.get({ recentSearchDurations: null }, stored => {
              if (chrome.runtime.lastError) return;
              const recentSearchDurations = progress.appendCompletedDuration(stored.recentSearchDurations, trace);
              chrome.storage.local.set({ lastPerformance: trace, recentSearchDurations });
            });
          } else chrome.storage.local.set({ lastPerformance: trace });
        } catch {}
      }));
      return true;
    };

    if (mount()) return;
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  });
})();
