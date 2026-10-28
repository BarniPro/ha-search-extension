(() => {
  const marker = '[data-testid="save-search-button"]';

  function consumeNotice() {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ type: 'HAAI_CONSUME_RESULT_NOTICE' }, response => {
          resolve(chrome.runtime.lastError ? null : response || null);
        });
      } catch { resolve(null); }
    });
  }

  function waitForResultsMarker(timeoutMs = 12000) {
    if (document.querySelector(marker)) return Promise.resolve(true);
    return new Promise(resolve => {
      let finished = false;
      const observer = new MutationObserver(() => {
        if (document.querySelector(marker)) finish(true);
      });
      const timeout = setTimeout(() => finish(false), timeoutMs);
      function finish(found) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        observer.disconnect();
        resolve(found);
      }
      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  waitForResultsMarker().then(async found => {
    if (!found) return null;
    return consumeNotice();
  }).then(data => {
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
        box.append(notice);

        const back = document.createElement('button');
        back.type = 'button';
        back.textContent = 'Vissza';
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

      return true;
    };

    if (mount()) return;
    const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  });
})();
