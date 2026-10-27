(() => {
  const DEFAULTS = { apiBaseUrl: "", enableHomeMode: false };
  // Build-time gate. The shipped build keeps this false; a B-capable build is
  // opt-in via ENABLE_HOME_MODE=true and still needs the popup and server gates.
  const ENABLE_HOME_MODE = false;
  const CLIENT_HOME_MODE_ENABLED = ENABLE_HOME_MODE;
  const CONFIGURED_BACKEND_ORIGIN = "";
  const ATTEMPT_TIMEOUT_MS = 45000;
  const MAX_ATTEMPTS = 2;
  const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

  function normalizeApiBase(value) {
    if (typeof value !== "string" || value.length > 300) throw new Error("Add meg a backend HTTPS-címét.");
    let url;
    try { url = new URL(value.trim()); }
    catch { throw new Error("A backend címe nem érvényes URL."); }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("A backendhez HTTPS szükséges (kivéve a localhost fejlesztői címet).");
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Csak a backend gyökércímét add meg, útvonal és belépési adat nélkül.");
    return url.origin;
  }

  function assertAllowedApiBase(value) {
    const base = normalizeApiBase(value);
    if (CONFIGURED_BACKEND_ORIGIN) {
      if (base !== CONFIGURED_BACKEND_ORIGIN) throw new Error("Ez a build csak az előre beállított backendcímmel használható.");
      return base;
    }
    const host = new URL(base).hostname;
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error("Ebben a fejlesztői buildben csak localhost backend használható. Éles buildhez add meg a BACKEND_ORIGIN beállítást.");
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
    const accountToken = await getBearerToken();
    let apiBaseUrl = CONFIGURED_BACKEND_ORIGIN || DEFAULTS.apiBaseUrl;
    try { if (typeof stored.apiBaseUrl === "string" && stored.apiBaseUrl) apiBaseUrl = assertAllowedApiBase(stored.apiBaseUrl); }
    catch {}
    return {
      apiBaseUrl,
      backendOrigin: CONFIGURED_BACKEND_ORIGIN || null,
      localBackendAllowed: !CONFIGURED_BACKEND_ORIGIN,
      enableHomeMode: CLIENT_HOME_MODE_ENABLED && stored.enableHomeMode === true,
      homeModeBuildEnabled: CLIENT_HOME_MODE_ENABLED,
      googleOAuthConfigured: Boolean(oauthClientId()),
      signedIn: Boolean(accountToken)
    };
  }

  async function getBearerToken() {
    // The optional signed-in account token is kept only for this browser session.
    if (!chrome.storage.session) return null;
    const value = await storageGet(chrome.storage.session, { haaiAccountToken: null, haaiAccountTokenExpiresAt: 0 });
    const token = value.haaiAccountToken;
    return typeof token === "string" && token.length > 0 && token.length <= 8192 && Number(value.haaiAccountTokenExpiresAt) > Date.now() + 30000 ? token : null;
  }

  function oauthClientId() {
    try { return chrome.runtime.getManifest().oauth2?.client_id || ""; }
    catch { return ""; }
  }

  async function googleLogin() {
    if (!oauthClientId()) throw new Error("A Google-belépés nincs konfigurálva ebben a buildben.");
    if (!chrome.identity?.getAuthToken) throw new Error("A Chrome Identity API nem érhető el.");
    const config = await getConfig();
    const apiBaseUrl = assertAllowedApiBase(config.apiBaseUrl);
    if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("Előbb mentsd el a backendcímet a bővítmény beállításaiban.");
    const googleToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, token => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!token) return reject(new Error("A Google-belépés nem adott tokent."));
        resolve(token);
      });
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ google_access_token: googleToken }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.access_token !== "string" || data.access_token.length > 8192 || typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer") {
        throw new Error(typeof data?.error === "string" ? data.error.slice(0, 300) : `A belépés sikertelen (${response.status}).`);
      }
      if (!chrome.storage.session) throw new Error("A biztonságos munkamenet-tároló nem érhető el.");
      const ttlSeconds = Number.isSafeInteger(data.expires_in) && data.expires_in > 0 && data.expires_in <= 31_536_000 ? data.expires_in : 3600;
      await storageSet(chrome.storage.session, { haaiAccountToken: data.access_token, haaiAccountTokenExpiresAt: Date.now() + ttlSeconds * 1000 });
      return { principalType: typeof data.principal_type === "string" ? data.principal_type : "user" };
    } finally { clearTimeout(timeout); }
  }

  async function googleLogout() {
    if (chrome.storage.session) await new Promise(resolve => chrome.storage.session.remove(["haaiAccountToken", "haaiAccountTokenExpiresAt"], resolve));
    return { signedIn: false };
  }

  function hasOriginPermission(origin) {
    const url = new URL(origin);
    const pattern = `${url.protocol}//${url.host}/*`;
    return new Promise(resolve => chrome.permissions.contains({ origins: [pattern] }, resolve));
  }

  function validatePayload(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.filters) || !Array.isArray(data.omissions) || !["A", "B"].includes(data.mode) || typeof data.request_id !== "string") {
      throw new Error("A backend válasza nem felel meg az API-szerződésnek.");
    }
    return data;
  }

  async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function issueGuestToken(apiBaseUrl, installId = null) {
    const stableInstallId = installId || randomId();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/guest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ install_id: stableInstallId }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error"
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.access_token !== "string" || data.access_token.length > 8192 || data.install_id !== stableInstallId || typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer") {
        throw new Error(typeof data?.error === "string" ? data.error.slice(0, 300) : `Vendégmunkamenet hiba (${response.status}).`);
      }
      const ttlSeconds = Number.isSafeInteger(data.expires_in) && data.expires_in > 0 && data.expires_in <= 31_536_000 ? data.expires_in : 2_592_000;
      await storageSet(chrome.storage.local, {
        haaiInstallId: data.install_id,
        haaiGuestToken: data.access_token,
        haaiGuestTokenExpiresAt: Date.now() + ttlSeconds * 1000
      });
      return { kind: "guest", token: data.access_token, installId: data.install_id };
    } finally { clearTimeout(timeout); }
  }

  async function getAuthorization(apiBaseUrl) {
    const accountToken = await getBearerToken();
    if (accountToken) return { kind: "user", token: accountToken };
    const local = await storageGet(chrome.storage.local, { haaiInstallId: null, haaiGuestToken: null, haaiGuestTokenExpiresAt: 0 });
    const installId = typeof local.haaiInstallId === "string" && local.haaiInstallId.length >= 16 ? local.haaiInstallId : randomId();
    if (typeof local.haaiGuestToken === "string" && local.haaiGuestToken.length > 0 && Number(local.haaiGuestTokenExpiresAt) > Date.now() + 60000 && installId === local.haaiInstallId) {
      return { kind: "guest", token: local.haaiGuestToken, installId };
    }
    if (installId !== local.haaiInstallId) await storageSet(chrome.storage.local, { haaiInstallId: installId });
    return issueGuestToken(apiBaseUrl, installId);
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
        const error = new Error(typeof data?.error === "string" ? data.error.slice(0, 300) : `A backend ${response.status} hibát adott.`);
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
    if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("Nincs engedély a beállított backendcímhez. Nyisd meg a bővítmény beállításait, és mentsd el újra a címet.");
    if (typeof message.query !== "string" || message.query.trim().length < 3 || message.query.length > 500) throw new Error("A keresés szövege hiányzik vagy túl hosszú.");
    const mode = message.mode === "B" && config.enableHomeMode ? "B" : "A";
    const requestId = typeof message.client_request_id === "string" && /^[a-zA-Z0-9._:-]{8,100}$/.test(message.client_request_id) ? message.client_request_id : randomId();
    const payload = { query: message.query.trim(), mode, client_request_id: requestId };
    let auth = await getAuthorization(apiBaseUrl);
    let lastError;
    let attempts = 0;
    let transientRetries = 0;
    let refreshedGuest = false;
    while (attempts < MAX_ATTEMPTS + 1) {
      attempts++;
      try {
        const data = await requestOnce(`${apiBaseUrl}/v1/interpret`, payload, auth.token);
        return { ok: true, data, attempts };
      } catch (error) {
        lastError = error;
        if (error.status === 401 && auth.kind === "guest" && !refreshedGuest) {
          refreshedGuest = true;
          auth = await issueGuestToken(apiBaseUrl, auth.installId);
          continue;
        }
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
      error: timedOut ? "A backend nem válaszolt időben. Próbáld újra." : String(lastError?.message || "A backend most nem érhető el.").slice(0, 300),
      attempts
    };
  }

  async function consumePlan(message) {
    const token = message?.launchToken;
    if (typeof token !== "string" || token.length < 16 || token.length > 512 || !/^[A-Za-z0-9._~-]+$/.test(token)) throw new Error("A keresésindító token hiányzik vagy hibás.");
    const config = await getConfig();
    const apiBaseUrl = assertAllowedApiBase(config.apiBaseUrl);
    if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("Nincs engedély a beállított backendcímhez.");
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
      getConfig().then(config => respond({ ok: true, config }), () => respond({ ok: false, config: DEFAULTS }));
      return true;
    }
    if (message?.type === "HAAI_SAVE_CONFIG") {
      (async () => {
        const apiBaseUrl = assertAllowedApiBase(message.apiBaseUrl);
        if (!(await hasOriginPermission(apiBaseUrl))) throw new Error("A backend gazdagépéhez még nincs engedély.");
        const enableHomeMode = CLIENT_HOME_MODE_ENABLED && message.enableHomeMode === true;
        await new Promise((resolve, reject) => chrome.storage.local.set({ apiBaseUrl, enableHomeMode }, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
        return { apiBaseUrl, enableHomeMode };
      })().then(config => respond({ ok: true, config }), error => respond({ ok: false, error: String(error.message || error) }));
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
    if (message?.type === "HAAI_GOOGLE_LOGIN") {
      googleLogin().then(result => respond({ ok: true, result }), error => respond({ ok: false, error: String(error.message || error) }));
      return true;
    }
    if (message?.type === "HAAI_GOOGLE_LOGOUT") {
      googleLogout().then(result => respond({ ok: true, result }), error => respond({ ok: false, error: String(error.message || error) }));
      return true;
    }
    return false;
  });

  if (typeof globalThis !== "undefined" && typeof module !== "undefined") module.exports = { normalizeApiBase, validatePayload };
})();
