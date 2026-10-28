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
    balance.textContent = 'Nincs beállított API-kulcs.';
    balance.className = 'status';
    return;
  }
  const quota = result.quota;
  if (!Number.isSafeInteger(quota?.remaining_requests) || quota.remaining_requests < 0) {
    balance.textContent = 'A keresési keretet nem sikerült lekérni.';
    balance.className = 'status error';
    return;
  }
  balance.textContent = `${quota.label ? `${quota.label} · ` : ''}${quota.remaining_requests} keresés maradt.`;
  balance.className = quota.remaining_requests > 0 ? 'status ok' : 'status error';
}

message({ type: 'HAAI_GET_CONFIG' }).then(result => {
  if (!result.ok || !result.config?.backendOrigin) return;
  refreshKeyQuota();
  document.querySelector('#clearManualKey').hidden = !result.config.manualKeyConfigured;
  const keyStatus = document.querySelector('#keyStatus');
  keyStatus.textContent = result.config.manualKeyConfigured ? 'Van mentett API-kulcs ezen az eszközön.' : 'Kérj API-kulcsot a fejlesztőtől, majd add meg itt a kereséshez.';
});

document.querySelector('#saveManualKey').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('#keyStatus');
  const apiKey = document.querySelector('#manualApiKey').value;
  if (!apiKey.trim()) {
    status.textContent = 'Kérj API-kulcsot a fejlesztőtől, és másold be ide.'; status.className = 'status error'; return;
  }
  button.disabled = true; status.textContent = 'API-kulcs ellenőrzése…'; status.className = 'status';
  try {
    const result = await message({ type: 'HAAI_SAVE_MANUAL_KEY', apiKey });
    if (!result.ok) throw new Error(result.error || 'Az API-kulcs mentése nem sikerült.');
    document.querySelector('#manualApiKey').value = '';
    document.querySelector('#clearManualKey').hidden = false;
    status.textContent = 'Az API-kulcs ellenőrizve és elmentve.'; status.className = 'status ok';
    await refreshKeyQuota();
  } catch (error) {
    status.textContent = error.message || 'Az API-kulcs ellenőrzése nem sikerült.'; status.className = 'status error';
  } finally { button.disabled = false; }
});

document.querySelector('#clearManualKey').addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('#keyStatus');
  button.disabled = true;
  try {
    const result = await message({ type: 'HAAI_CLEAR_MANUAL_KEY' });
    if (!result.ok) throw new Error(result.error || 'Az API-kulcs törlése nem sikerült.');
    button.hidden = true;
    status.textContent = 'Az API-kulcs törölve erről az eszközről. A hozzáférés megszüntetéséhez kérd a fejlesztőt a kulcs visszavonására.';
    status.className = 'status ok';
    await refreshKeyQuota();
  } catch (error) {
    status.textContent = error.message || 'Az API-kulcs törlése nem sikerült.'; status.className = 'status error';
  } finally { button.disabled = false; }
});

document.querySelector('#version').textContent = `Bővítmény: ${chrome.runtime.getManifest().version}`;
