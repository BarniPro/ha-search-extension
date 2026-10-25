(() => {
  // The homepage can submit to SEO result URLs (for example /elektromos-auto/),
  // so identify a results page by its native UI rather than a path prefix.
  if (!document.querySelector('[data-testid="save-search-button"]')) return;
  const raw = sessionStorage.getItem('haai-search-result-v2');
  if (!raw) return;
  sessionStorage.removeItem('haai-search-result-v2');
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  if (typeof data.query !== 'string' && !Array.isArray(data.omissions)) return;

  const mount = () => {
    const heading = document.querySelector('h1');
    if (!heading) return false;
    const omissions = Array.isArray(data.omissions) ? [...new Set(data.omissions.filter(x => typeof x === 'string' && x.trim()))].slice(0, 8) : [];
    if (omissions.length || data.needsNotice) {
      const box = document.createElement('div');
      box.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0;padding:10px 12px;background:#fff;border:1px solid #dedede;border-radius:4px;color:#333;font:14px/1.45 Roboto,Arial,sans-serif';

      const notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'flex:1 1 300px;margin:0;color:#8b3c20';
      const noticeHeading = document.createElement('div');
      noticeHeading.textContent = 'A keresésből kimaradt:';
      noticeHeading.style.cssText = 'font-weight:600;margin-bottom:3px';
      notice.append(noticeHeading);
      const list = document.createElement('ul');
      list.style.cssText = 'margin:0;padding-left:19px';
      for (const omission of omissions) {
        const item = document.createElement('li');
        item.textContent = omission;
        list.append(item);
      }
      if (!omissions.length) {
        const item = document.createElement('li');
        item.textContent = 'A kérés egy részét nem tudtam biztosan értelmezni.';
        list.append(item);
      }
      notice.append(list);
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
    // Two animation frames let the main results page paint after navigation.
    // The iframe's route arrival is measured separately in content.js.
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
          chrome.storage.local.get({ recentSearchDurations: null }, data => {
            if (chrome.runtime.lastError) return;
            const recentSearchDurations = progress.appendCompletedDuration(data.recentSearchDurations, trace);
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
})();
