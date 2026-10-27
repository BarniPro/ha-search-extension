let trace;
function render(data) {
  trace = data;
  const host = document.querySelector('#measurement'); host.replaceChildren();
  if (!data?.events?.length) { host.textContent = 'Még nincs mérés.'; return; }
  const modeEvent = [...data.events].reverse().find(event => event.stage === 'mode_selected' && ['A', 'B'].includes(event.mode));
  const mode = modeEvent?.mode || (data.mode === 'home' ? 'B' : 'A');
  const title = document.createElement('p'); title.textContent = `${mode} · ${new Date(data.startedAt).toLocaleTimeString('hu-HU')}`; host.append(title);
  const events = new Map(data.events.map(e => [e.stage, e]));
  const rows = [['Backend értelmezés', events.get('interpret_end')?.elapsedMs], ['Szűrők beállítása', events.get('filters_ready')?.elapsedMs], ['Találatok megjelenése', events.get('results_visible')?.elapsedMs]];
  const table = document.createElement('table');
  for (const [label, value] of rows) { const row = table.insertRow(); row.insertCell().textContent = label; row.insertCell().textContent = typeof value === 'number' ? `${value} ms` : '—'; if (label === 'Találatok megjelenése') row.className = 'total'; }
  host.append(table);
}

function message(payload) {
  return new Promise(resolve => chrome.runtime.sendMessage(payload, response => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : response || { ok: false })));
}

async function refreshKeyQuota() {
  const balance = document.querySelector('#keyBalance');
  const result = await message({ type: 'HAAI_GET_QUOTA' });
  if (!result.ok) {
    balance.textContent = result.error || 'A kéréskeretet nem sikerült lekérni.';
    balance.className = 'status error';
    return;
  }
  if (!result.configured) {
    balance.textContent = 'Nincs beállított hozzáférési kulcs.';
    balance.className = 'status';
    return;
  }
  const quota = result.quota;
  if (!Number.isSafeInteger(quota?.remaining_requests) || quota.remaining_requests < 0) {
    balance.textContent = 'A backend nem adott vissza érvényes kéréskeretet.';
    balance.className = 'status error';
    return;
  }
  balance.textContent = `${quota.label ? `${quota.label} · ` : ''}${quota.remaining_requests} keresés maradt.`;
  balance.className = quota.remaining_requests > 0 ? 'status ok' : 'status error';
}

chrome.storage.local.get({ lastPerformance: null }, data => {
  render(data.lastPerformance);
});

message({ type: 'HAAI_GET_CONFIG' }).then(result => {
  if (!result.ok) return;
  const apiInput = document.querySelector('#apiBaseUrl');
  apiInput.value = result.config.backendOrigin || result.config.apiBaseUrl || '';
  apiInput.readOnly = Boolean(result.config.backendOrigin);
  apiInput.placeholder = result.config.backendOrigin || 'http://localhost:8080';
  document.querySelector('#apiHelp').textContent = result.config.backendOrigin
    ? 'Ehhez a kiadáshoz a backend címe buildkor rögzített; a beállított origin nem módosítható.'
    : 'Alapértelmezett helyi cím: http://localhost:8080. A mezőben másik HTTP localhost vagy 127.0.0.1 cím is megadható. Éles buildhez BACKEND_ORIGIN szükséges.';
  const toggle = document.querySelector('#enableHomeMode');
  const buildEnabled = result.config?.homeModeBuildEnabled === true;
  toggle.disabled = !buildEnabled;
  toggle.checked = buildEnabled && result.config?.enableHomeMode === true;
  document.querySelector('#homeModeHelp').textContent = buildEnabled
    ? 'Ez a build tartalmazza a B adaptert. A szerver ENABLE_HOME_MODE beállításának is aktívnak kell lennie; élő HAHU ellenőrzés nélkül ne használd élesben.'
    : 'Az alapértelmezett buildben ki van kapcsolva. A B mód csak külön engedélyezett builddel, ezzel a kapcsolóval és a backend beállításával használható. Élesítés előtt élő HAHU űrlapon kell ellenőrizni.';
  document.querySelector('#clearManualKey').hidden = result.config.manualKeyConfigured !== true;
  document.querySelector('#keyStatus').textContent = result.config.manualKeyConfigured ? 'Van mentett hozzáférési kulcs ezen az eszközön.' : 'Még nincs mentett hozzáférési kulcs.';
  refreshKeyQuota();
  if (!result.config?.googleOAuthConfigured) return;
  document.querySelector('#googleAuth').hidden = false;
  document.querySelector('#googleLogin').hidden = result.config.signedIn === true;
  document.querySelector('#googleLogout').hidden = result.config.signedIn !== true;
  document.querySelector('#authStatus').textContent = result.config.signedIn ? 'Google-fiókkal bejelentkezve.' : 'A belépés opcionális; vendégként is kereshetsz.';
});

document.querySelector('#save').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('#saved');
  const input = document.querySelector('#apiBaseUrl');
  let config;
  let url;
  try {
    const configured = await message({ type: 'HAAI_GET_CONFIG' });
    if (!configured.ok) throw new Error('A bővítmény beállításait nem sikerült betölteni.');
    config = configured.config;
    url = new URL(input.value.trim());
    const localhost = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(localhost && url.protocol === 'http:')) throw new Error('HTTPS szükséges; fejlesztéshez HTTP localhost vagy 127.0.0.1 használható.');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Csak a backend gyökércímét add meg.');
    if (config.backendOrigin ? url.origin !== config.backendOrigin : !config.localBackendAllowed || !localhost || url.protocol !== 'http:') throw new Error(config.backendOrigin ? 'Ez a build csak az előre beállított backendcímmel használható.' : 'Ebben a fejlesztői buildben csak HTTP localhost backend használható.');
  } catch (error) {
    status.textContent = error.message || 'Érvénytelen backendcím.'; status.className = 'status error'; return;
  }
  button.disabled = true; status.textContent = 'Backend engedélyének ellenőrzése…'; status.className = 'status';
  try {
    const originPattern = `${url.protocol}//${url.host}/*`;
    const granted = await new Promise(resolve => chrome.permissions.request({ origins: [originPattern] }, resolve));
    if (!granted) throw new Error('A backend hozzáférését nem engedélyezted.');
    const result = await message({ type: 'HAAI_SAVE_CONFIG', apiBaseUrl: url.origin, enableHomeMode: document.querySelector('#enableHomeMode').checked });
    if (!result.ok) throw new Error(result.error || 'A beállítás mentése nem sikerült.');
    status.textContent = 'A backend címe elmentve.'; status.className = 'status ok';
    refreshKeyQuota();
  } catch (error) {
    status.textContent = error.message || 'A backend beállítása nem sikerült.'; status.className = 'status error';
  } finally { button.disabled = false; }
});

document.querySelector('#saveManualKey').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('#keyStatus');
  const apiKey = document.querySelector('#manualApiKey').value;
  if (!apiKey.trim()) {
    status.textContent = 'Másold be az üzemeltetőtől kapott kulcsot.'; status.className = 'status error'; return;
  }
  button.disabled = true; status.textContent = 'Kulcs ellenőrzése a backenddel…'; status.className = 'status';
  try {
    const result = await message({ type: 'HAAI_SAVE_MANUAL_KEY', apiKey });
    if (!result.ok) throw new Error(result.error || 'A kulcs mentése nem sikerült.');
    document.querySelector('#manualApiKey').value = '';
    document.querySelector('#clearManualKey').hidden = false;
    status.textContent = 'A kulcs ellenőrizve és elmentve.'; status.className = 'status ok';
    await refreshKeyQuota();
  } catch (error) {
    status.textContent = error.message || 'A kulcs ellenőrzése nem sikerült.'; status.className = 'status error';
  } finally { button.disabled = false; }
});

document.querySelector('#clearManualKey').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('#keyStatus');
  button.disabled = true;
  try {
    const result = await message({ type: 'HAAI_CLEAR_MANUAL_KEY' });
    if (!result.ok) throw new Error(result.error || 'A kulcs törlése nem sikerült.');
    button.hidden = true;
    status.textContent = 'A kulcs törölve erről az eszközről. A backendkulcs ettől még aktív marad; a visszavonást az üzemeltető végzi.';
    status.className = 'status ok';
    await refreshKeyQuota();
  } catch (error) {
    status.textContent = error.message || 'A kulcs törlése nem sikerült.'; status.className = 'status error';
  } finally { button.disabled = false; }
});

document.querySelector('#googleLogin').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  const status = document.querySelector('#authStatus'); status.textContent = 'Google-belépés…'; status.className = 'status';
  try {
    const result = await message({ type: 'HAAI_GOOGLE_LOGIN' });
    if (!result.ok) throw new Error(result.error || 'A belépés nem sikerült.');
    button.hidden = true; document.querySelector('#googleLogout').hidden = false;
    status.textContent = 'Google-fiókkal bejelentkezve. A munkamenet végén a token törlődik.'; status.className = 'status ok';
  } catch (error) { status.textContent = error.message || 'A belépés nem sikerült.'; status.className = 'status error'; }
  finally { button.disabled = false; }
});

document.querySelector('#googleLogout').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  const result = await message({ type: 'HAAI_GOOGLE_LOGOUT' });
  button.hidden = true; button.disabled = false; document.querySelector('#googleLogin').hidden = false;
  document.querySelector('#authStatus').textContent = result.ok ? 'Kijelentkeztél. Vendégként továbbra is kereshetsz.' : result.error || 'A kijelentkezés nem sikerült.';
});

chrome.storage.onChanged.addListener(changes => { if (changes.lastPerformance) render(changes.lastPerformance.newValue); });
document.querySelector('#version').textContent = `Bővítmény: ${chrome.runtime.getManifest().version}`;
document.querySelector('#export').addEventListener('click', () => {
  if (!trace) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = `haai-${Date.parse(trace.startedAt)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
