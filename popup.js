function message(payload) {
  return new Promise(resolve => chrome.runtime.sendMessage(payload, response => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : response || { ok: false })));
}

const form = document.querySelector('#apiKeyForm');
const keyInput = document.querySelector('#manualApiKey');
const keyStatus = document.querySelector('#keyStatus');
const quotaValue = document.querySelector('#quotaValue');
const quotaDescription = document.querySelector('#quotaDescription');
const refreshButton = document.querySelector('#refreshQuota');
const saveButton = document.querySelector('#saveManualKey');
const changeButton = document.querySelector('#changeManualKey');
const clearButton = document.querySelector('#clearManualKey');
const cancelButton = document.querySelector('#cancelKeyChange');
const visibilityButton = document.querySelector('#toggleKeyVisibility');
let configured = null;
let mutating = false;
let quotaLoading = false;
let quotaRequestId = 0;

function updateControls() {
  refreshButton.disabled = !configured || mutating || quotaLoading;
  [saveButton, changeButton, clearButton, cancelButton, visibilityButton, keyInput].forEach(control => { control.disabled = mutating || configured === null; });
  saveButton.textContent = mutating ? 'Ellenőrzés…' : 'Ellenőrzés és mentés';
  form.setAttribute('aria-busy', String(mutating));
}

function clearKeyInput() {
  keyInput.value = '';
  keyInput.type = 'password';
  keyInput.removeAttribute('aria-invalid');
  visibilityButton.textContent = 'Mutat';
  visibilityButton.setAttribute('aria-label', 'Megadott API-kulcs megjelenítése');
  visibilityButton.setAttribute('aria-pressed', 'false');
}

function setEditorOpen(open) {
  form.hidden = !open;
  changeButton.setAttribute('aria-expanded', String(open));
  if (!open) clearKeyInput();
}

function setConfigured(value) {
  configured = value;
  document.querySelector('#savedKeyActions').hidden = !value;
  document.querySelector('#savedKeyState').textContent = value ? 'Mentve ezen az eszközön' : 'Nincs megadva';
  document.querySelector('#savedKeyState').className = value ? 'key-state ok' : 'key-state';
  document.querySelector('#keyIntro').textContent = value
    ? 'A kulcs ezen az eszközön van elmentve. Új kulcsot a fejlesztőtől kérhetsz.'
    : 'Kérj API-kulcsot a fejlesztőtől a keresés használatához.';
  document.querySelector('label[for="manualApiKey"]').textContent = value ? 'Új API-kulcs' : 'API-kulcs';
  cancelButton.hidden = !value;
  setEditorOpen(!value);
  updateControls();
}

function setStatus(text, kind = '') {
  keyStatus.textContent = text;
  keyStatus.className = `status${kind ? ` ${kind}` : ''}`;
}

function renderQuota(quota) {
  if (!Number.isSafeInteger(quota?.remaining_requests) || quota.remaining_requests < 0) throw new Error('A keresési keretet nem sikerült lekérni.');
  quotaValue.textContent = quota.remaining_requests.toLocaleString('hu-HU');
  quotaValue.className = quota.remaining_requests === 0 ? 'quota-value empty' : 'quota-value';
  const label = typeof quota.label === 'string' && quota.label.trim() ? quota.label.trim() : '';
  quotaDescription.textContent = quota.remaining_requests > 0
    ? (label ? `API-kulcs: ${label}` : 'Ennyi keresés indítható a mentett API-kulccsal.')
    : `Elfogyott a keresési keret. Kérj bővítést a fejlesztőtől.${label ? ` API-kulcs: ${label}` : ''}`;
}

function renderNoKey() {
  quotaValue.textContent = '—';
  quotaValue.className = 'quota-value';
  quotaDescription.textContent = 'Adj meg egy API-kulcsot a kereséshez.';
}

async function refreshKeyQuota() {
  const requestId = ++quotaRequestId;
  quotaLoading = true;
  quotaValue.textContent = '—';
  quotaValue.className = 'quota-value';
  quotaDescription.textContent = 'Keret lekérése…';
  updateControls();
  try {
    const result = await message({ type: 'HAAI_GET_QUOTA' });
    if (requestId !== quotaRequestId) return;
    if (!result.ok) throw new Error(result.error || 'A keresési keretet nem sikerült lekérni.');
    if (!result.configured) {
      setConfigured(false);
      renderNoKey();
      return;
    }
    renderQuota(result.quota);
  } catch (error) {
    if (requestId !== quotaRequestId) return;
    quotaValue.textContent = '—';
    quotaDescription.textContent = error.message || 'A keresési keretet nem sikerült lekérni. Próbáld újra a Frissítés gombbal.';
  } finally {
    if (requestId === quotaRequestId) {
      quotaLoading = false;
      updateControls();
    }
  }
}

message({ type: 'HAAI_GET_CONFIG' }).then(result => {
  if (!result.ok) {
    quotaDescription.textContent = 'A keresési keretet nem sikerült lekérni.';
    document.querySelector('#savedKeyState').textContent = 'Nem elérhető';
    setStatus(result.error || 'A beállításokat nem sikerült betölteni. Nyisd meg újra a bővítményt.', 'error');
    return;
  }
  setConfigured(Boolean(result.config?.manualKeyConfigured));
  if (configured) refreshKeyQuota();
  else renderNoKey();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (mutating || configured === null) return;
  const apiKey = keyInput.value.trim();
  if (!apiKey) {
    keyInput.setAttribute('aria-invalid', 'true');
    setStatus('Másold be a fejlesztőtől kapott API-kulcsot.', 'error');
    keyInput.focus();
    return;
  }
  ++quotaRequestId;
  quotaLoading = false;
  mutating = true;
  keyInput.removeAttribute('aria-invalid');
  setStatus('API-kulcs ellenőrzése…');
  updateControls();
  try {
    const result = await message({ type: 'HAAI_SAVE_MANUAL_KEY', apiKey });
    if (!result.ok) throw new Error(result.error || 'Az API-kulcs mentése nem sikerült.');
    setConfigured(true);
    renderQuota(result.quota);
    setStatus('Az API-kulcs ellenőrizve és elmentve.', 'ok');
  } catch (error) {
    keyInput.setAttribute('aria-invalid', 'true');
    setStatus(error.message || 'Az API-kulcs ellenőrzése nem sikerült.', 'error');
  } finally {
    mutating = false;
    updateControls();
    if (form.hidden) changeButton.focus();
    if (configured && quotaValue.textContent === '—') refreshKeyQuota();
  }
});

changeButton.addEventListener('click', () => {
  setEditorOpen(form.hidden);
  setStatus('');
  if (!form.hidden) keyInput.focus();
});
cancelButton.addEventListener('click', () => {
  setEditorOpen(false);
  setStatus('');
  changeButton.focus();
});
visibilityButton.addEventListener('click', () => {
  const visible = keyInput.type === 'password';
  keyInput.type = visible ? 'text' : 'password';
  visibilityButton.textContent = visible ? 'Elrejt' : 'Mutat';
  visibilityButton.setAttribute('aria-label', visible ? 'Megadott API-kulcs elrejtése' : 'Megadott API-kulcs megjelenítése');
  visibilityButton.setAttribute('aria-pressed', String(visible));
});
keyInput.addEventListener('input', () => keyInput.removeAttribute('aria-invalid'));
refreshButton.addEventListener('click', refreshKeyQuota);

clearButton.addEventListener('click', async () => {
  if (mutating) return;
  ++quotaRequestId;
  quotaLoading = false;
  mutating = true;
  updateControls();
  setStatus('API-kulcs eltávolítása…');
  try {
    const result = await message({ type: 'HAAI_CLEAR_MANUAL_KEY' });
    if (!result.ok) throw new Error(result.error || 'Az API-kulcs eltávolítása nem sikerült.');
    clearKeyInput();
    setConfigured(false);
    renderNoKey();
    setStatus('Az API-kulcs eltávolítva erről az eszközről. A kulcs visszavonását a fejlesztőtől kérheted.', 'ok');
  } catch (error) {
    setStatus(error.message || 'Az API-kulcs eltávolítása nem sikerült.', 'error');
  } finally {
    mutating = false;
    updateControls();
    if (!configured) keyInput.focus();
    if (configured && quotaValue.textContent === '—') refreshKeyQuota();
  }
});

updateControls();
document.querySelector('#version').textContent = `Bővítmény: ${chrome.runtime.getManifest().version}`;
