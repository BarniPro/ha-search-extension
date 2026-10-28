(() => {
  const DEFAULTS = { haaiManualApiKey: "" };
  const CONFIGURED_BACKEND_ORIGIN = "http://127.0.0.1:8080";
  const ATTEMPT_TIMEOUT_MS = 30000;
  const MAX_ATTEMPTS = 2;
  const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.remove(["lastPerformance", "recentSearchDurations", "apiBaseUrl", "enableHomeMode", "haaiInstallId", "haaiGuestToken", "haaiGuestTokenExpiresAt"]);
    chrome.storage.session?.remove(["haaiAccountToken", "haaiAccountTokenExpiresAt"]);
  });

  function normalizeApiBase(value) {
    if (typeof value !== "string" || value.length > 300) throw new Error("A keresés beállításai nem érvényesek.");
    let url;
    try { url = new URL(value.trim()); }
    catch { throw new Error("A keresés beállításai nem érvényesek."); }
    const isPinnedLocalDevelopmentOrigin = url.protocol === "http:" &&
      url.origin === "http://127.0.0.1:8080";
    if (url.protocol !== "https:" && !isPinnedLocalDevelopmentOrigin) {
      throw new Error("A kereséshez biztonságos kapcsolat szükséges.");
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("A keresés beállításai nem érvényesek.");
    return url.origin;
  }

  function assertAllowedApiBase(value) {
    const base = normalizeApiBase(value);
    if (!CONFIGURED_BACKEND_ORIGIN || base !== CONFIGURED_BACKEND_ORIGIN) throw new Error("A keresés most nem érhető el. Próbáld újra később.");
    return base;
  }

  function randomId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }

  function storageGet(area, keys) {
    return new Promise(resolve => area.get(keys, value => resolve(chrome.runtime.lastError ? {} : value || {})));
  }

  function storageSet(area, values) {
    return new Promise((resolve, reject) => area.set(values, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  }

  function storageRemove(area, keys) {
    return new Promise((resolve, reject) => area.remove(keys, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  }

  function resultNoticeKey(sender) {
    const tabId = sender?.tab?.id;
    if (!Number.isSafeInteger(tabId) || tabId < 0 || !chrome.storage.session) return null;
    const senderUrls = [sender?.url, sender?.tab?.url].filter(value => typeof value === "string");
    const hasAllowedOrigin = senderUrls.some(value => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && ["www.hasznaltauto.hu", "hasznaltauto.hu"].includes(url.hostname);
      } catch { return false; }
    });
    if (!hasAllowedOrigin) return null;
    return `haaiResultNotice:${tabId}`;
  }

  async function storeResultNotice(sender, value) {
    const key = resultNoticeKey(sender);
    if (!key) throw new Error("A keresési figyelmeztetést nem tudtam biztonságosan eltárolni.");
    const omissions = Array.isArray(value) ? [...new Set(value.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean))].slice(0, 8).map(item => item.slice(0, 300)) : [];
    if (!omissions.length) await storageRemove(chrome.storage.session, key);
    else await storageSet(chrome.storage.session, { [key]: { omissions, expiresAt: Date.now() + 120000 } });
    return { ok: true };
  }

  async function consumeResultNotice(sender) {
    const key = resultNoticeKey(sender);
    if (!key) return { ok: false };
    const stored = await storageGet(chrome.storage.session, key);
    await storageRemove(chrome.storage.session, key);
    const notice = stored[key];
    if (!notice || !Number.isFinite(notice.expiresAt) || notice.expiresAt < Date.now()) return { ok: true, omissions: [] };
    const omissions = Array.isArray(notice.omissions) ? notice.omissions.filter(item => typeof item === "string").slice(0, 8) : [];
    return { ok: true, omissions };
  }

  async function getConfig() {
    const stored = await storageGet(chrome.storage.local, DEFAULTS);
    const apiBaseUrl = assertAllowedApiBase(CONFIGURED_BACKEND_ORIGIN);
    return {
      apiBaseUrl,
      backendOrigin: CONFIGURED_BACKEND_ORIGIN,
      manualKeyConfigured: typeof stored.haaiManualApiKey === "string" && stored.haaiManualApiKey.length > 0
    };
  }

  function hasOriginPermission(origin) {
    const url = new URL(origin);
    const pattern = `${url.protocol}//${url.host}/*`;
    return new Promise(resolve => chrome.permissions.contains({ origins: [pattern] }, resolve));
  }

  function normalizeManualApiKey(value) {
    if (typeof value !== "string") throw new Error("Kérj API-kulcsot a fejlesztőtől, és másold be ide.");
    const key = value.trim();
    if (key.length > 200 || !/^haai_[a-f0-9]{16}_[A-Za-z0-9_-]{32,}$/.test(key)) {
      throw new Error("Az API-kulcs formátuma érvénytelen.");
    }
    return key;
  }

  async function fetchQuota(apiBaseUrl, token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/quota`, {
        method: "GET",
        headers: { "Accept": "application/json", Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.message === "string" ? data.message : `Az API-kulcs ellenőrzése sikertelen (${response.status}).`);
      if (data?.principal_type !== "api_key" || !Number.isSafeInteger(data.remaining_requests) || data.remaining_requests < 0) {
        throw new Error("Az API-kulcshoz tartozó keresési keretet nem sikerült lekérni.");
      }
      return data;
    } finally { clearTimeout(timeout); }
  }

  function validatePayload(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.filters) || !Array.isArray(data.omissions) || !["A", "B"].includes(data.mode) || typeof data.request_id !== "string") {
      throw new Error("A keresési feltételeket nem sikerült beolvasni.");
    }
    return data;
  }

  async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function getRequiredApiKey() {
    const local = await storageGet(chrome.storage.local, { haaiManualApiKey: null });
    return normalizeManualApiKey(local.haaiManualApiKey);
  }

  async function getManualKeyQuota() {
    const stored = await storageGet(chrome.storage.local, { haaiManualApiKey: null });
    if (typeof stored.haaiManualApiKey !== "string" || !stored.haaiManualApiKey) return { configured: false };
    const config = await getConfig();
    const apiBaseUrl = assertAllowedApiBase(config.apiBaseUrl);
    if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("A kereséshez szükséges hozzáférés ki van kapcsolva a Chrome bővítménybeállításaiban.");
    return { configured: true, quota: await fetchQuota(apiBaseUrl, stored.haaiManualApiKey) };
  }

  async function saveManualApiKey(value) {
    const manualApiKey = normalizeManualApiKey(value);
    const config = await getConfig();
    const apiBaseUrl = assertAllowedApiBase(config.apiBaseUrl);
    if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("A kereséshez szükséges hozzáférés ki van kapcsolva a Chrome bővítménybeállításaiban.");
    const quota = await fetchQuota(apiBaseUrl, manualApiKey);
    await storageSet(chrome.storage.local, { haaiManualApiKey: manualApiKey });
    return quota;
  }

  async function requestOnce(url, payload, token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const headers = { "Content-Type": "application/json", "Accept": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(typeof data?.message === "string" ? data.message.slice(0, 300)
          : typeof data?.error === "string" ? data.error.slice(0, 300) : "A keresés most nem sikerült. Próbáld újra később.");
        error.status = response.status;
        throw error;
      }
      return validatePayload(data);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function interpret(message) {
    const config = await getConfig();
    const apiBaseUrl = assertAllowedApiBase(config.apiBaseUrl);
    if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("A kereséshez szükséges hozzáférés ki van kapcsolva a Chrome bővítménybeállításaiban.");
    if (typeof message.query !== "string" || message.query.trim().length < 3 || message.query.length > 500) throw new Error("A keresés szövege hiányzik vagy túl hosszú.");
    const mode = "A";
    const requestId = typeof message.client_request_id === "string" && /^[a-zA-Z0-9._:-]{8,100}$/.test(message.client_request_id) ? message.client_request_id : randomId();
    const payload = { query: message.query.trim(), mode, client_request_id: requestId };
    const apiKey = await getRequiredApiKey();
    let lastError;
    let attempts = 0;
    let transientRetries = 0;
    while (attempts < MAX_ATTEMPTS + 1) {
      attempts++;
      try {
        const data = await requestOnce(`${apiBaseUrl}/v1/interpret`, payload, apiKey);
        return { ok: true, data, attempts };
      } catch (error) {
        lastError = error;
        const retryable = error.status ? RETRYABLE_STATUS.has(error.status) : true;
        if (transientRetries >= MAX_ATTEMPTS - 1 || !retryable) break;
        transientRetries++;
        await wait(300);
      }
    }
    const timedOut = lastError?.name === "AbortError";
    return {
      ok: false,
      status: Number.isInteger(lastError?.status) ? lastError.status : 0,
      error: timedOut ? "A keresés túl sokáig tartott. Próbáld újra." : String(lastError?.message || "A keresés most nem érhető el. Próbáld újra később.").slice(0, 300),
      attempts
    };
  }

  async function consumePlan(message) {
    const token = message?.launchToken;
    if (typeof token !== "string" || token.length < 16 || token.length > 512 || !/^[A-Za-z0-9._~-]+$/.test(token)) throw new Error("A keresésindító token hiányzik vagy hibás.");
    const config = await getConfig();
    const apiBaseUrl = assertAllowedApiBase(config.apiBaseUrl);
    if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("A kereséshez szükséges hozzáférés ki van kapcsolva a Chrome bővítménybeállításaiban.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/plans/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ launch_token: token }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error.slice(0, 300) : `A keresésindító link lejárt (${response.status}).`);
      return validatePayload(data);
    } finally { clearTimeout(timeout); }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === "HAAI_STORE_RESULT_NOTICE") {
      storeResultNotice(sender, message.omissions).then(respond, error => respond({ ok: false, error: String(error.message || error) }));
      return true;
    }
    if (message?.type === "HAAI_CONSUME_RESULT_NOTICE") {
      consumeResultNotice(sender).then(respond, () => respond({ ok: false, omissions: [] }));
      return true;
    }
    if (message?.type === "HAAI_GET_CONFIG") {
      getConfig().then(config => respond({ ok: true, config }), error => respond({ ok: false, error: String(error.message || error) }));
      return true;
    }
    if (message?.type === "HAAI_SAVE_MANUAL_KEY") {
      saveManualApiKey(message.apiKey).then(quota => respond({ ok: true, quota }), error => respond({ ok: false, error: String(error.message || error) }));
      return true;
    }
    if (message?.type === "HAAI_CLEAR_MANUAL_KEY") {
      storageSet(chrome.storage.local, { haaiManualApiKey: "" }).then(() => respond({ ok: true }), error => respond({ ok: false, error: String(error.message || error) }));
      return true;
    }
    if (message?.type === "HAAI_GET_QUOTA") {
      getManualKeyQuota().then(result => respond({ ok: true, ...result }), error => respond({ ok: false, configured: true, error: String(error.message || error) }));
      return true;
    }
    if (message?.type === "HAAI_INTERPRET") {
      interpret(message).then(respond, error => respond({ ok: false, status: 0, error: String(error.message || error), attempts: 0 }));
      return true;
    }
    if (message?.type === "HAAI_CONSUME_PLAN") {
      consumePlan(message).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: String(error.message || error) }));
      return true;
    }
    return false;
  });

})();
