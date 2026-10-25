const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const source = fs.readFileSync(require.resolve('./background.js'), 'utf8');

function createHarness(fetchImpl, local = { apiBaseUrl: 'http://localhost:8080', enableHomeMode: true }, manifest = { version: 'test' }, enableHomeBuild = false, configuredBackendOrigin = '') {
  const messages = [];
  const localData = { ...local };
  const sessionData = {};
  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => manifest,
      onMessage: { addListener: listener => messages.push(listener) }
    },
    permissions: { contains: (_permissions, callback) => callback(true) },
    storage: {
      local: {
        get: (defaults, callback) => callback({ ...(typeof defaults === 'object' ? defaults : {}), ...localData }),
        set: (value, callback) => { Object.assign(localData, value); callback?.(); }
      },
      session: {
        get: (defaults, callback) => callback({ ...(typeof defaults === 'object' ? defaults : {}), ...sessionData }),
        set: (value, callback) => { Object.assign(sessionData, value); callback?.(); },
        remove: (key, callback) => { for (const name of Array.isArray(key) ? key : [key]) delete sessionData[name]; callback?.(); }
      }
    },
    identity: {
      getAuthToken: (_options, callback) => callback('google-access-token')
    }
  };
  const context = vm.createContext({ chrome, crypto, URL, AbortController, fetch: fetchImpl, setTimeout, clearTimeout, Promise, Math, JSON, module: { exports: {} } });
  let compiledSource = enableHomeBuild ? source.replace('const ENABLE_HOME_MODE = false;', 'const ENABLE_HOME_MODE = true;') : source;
  if (configuredBackendOrigin) compiledSource = compiledSource.replace('const CONFIGURED_BACKEND_ORIGIN = "";', `const CONFIGURED_BACKEND_ORIGIN = ${JSON.stringify(configuredBackendOrigin)};`);
  vm.runInContext(compiledSource, context, { filename: 'background.js' });
  const send = message => new Promise(resolve => {
    const keepOpen = messages[0](message, {}, resolve);
    assert.equal(keepOpen, true);
  });
  return { send, localData, sessionData, api: context.module.exports };
}

function reply(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }

(async () => {
  const calls = [];
  const harness = createHarness(async (url, options) => {
    const payload = JSON.parse(options.body);
    calls.push({ url, options, payload });
    if (url.endsWith('/v1/guest')) return reply({ access_token: 'guest-1', token_type: 'bearer', expires_in: 3600, principal_type: 'guest', install_id: payload.install_id });
    if (url.endsWith('/v1/interpret') && calls.filter(call => call.url.endsWith('/v1/interpret')).length === 1) return reply({ error: 'temporary' }, 503);
    if (url.endsWith('/v1/interpret')) return reply({ filters: [], omissions: [], mode: 'A', request_id: 'request-1', timing: {} });
    if (url.endsWith('/v1/plans/consume')) return reply({ filters: [], omissions: [], mode: 'A', request_id: 'handoff-1' });
    throw new Error(`Unexpected URL ${url}`);
  });
  assert.equal(harness.api.normalizeApiBase('https://api.example.test'), 'https://api.example.test');
  assert.equal(harness.api.normalizeApiBase('http://localhost:8080'), 'http://localhost:8080');
  assert.throws(() => harness.api.normalizeApiBase('http://api.example.test'), /HTTPS szükséges/);
  assert.throws(() => harness.api.normalizeApiBase('https://api.example.test/path'), /gyökércímét/);
  const arbitraryHost = await harness.send({ type: 'HAAI_SAVE_CONFIG', apiBaseUrl: 'https://api.example.test' });
  assert.equal(arbitraryHost.ok, false, 'Development builds reject non-local backend origins before permission prompts');

  const productionOrigin = 'https://api.example.test:8443';
  const productionHarness = createHarness(async () => { throw new Error('No request expected'); }, { apiBaseUrl: productionOrigin }, { version: 'test' }, false, productionOrigin);
  assert.equal((await productionHarness.send({ type: 'HAAI_GET_CONFIG' })).config.backendOrigin, productionOrigin);
  assert.equal((await productionHarness.send({ type: 'HAAI_SAVE_CONFIG', apiBaseUrl: productionOrigin })).ok, true);
  assert.equal((await productionHarness.send({ type: 'HAAI_SAVE_CONFIG', apiBaseUrl: 'https://other.example.test' })).ok, false, 'Production builds accept only their pinned backend origin');

  const result = await harness.send({ type: 'HAAI_INTERPRET', query: 'leon 2018-tól', mode: 'B', client_request_id: 'client-request-0001' });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  const interpretationCalls = calls.filter(call => call.url.endsWith('/v1/interpret'));
  assert.equal(interpretationCalls.length, 2);
  assert.deepEqual(interpretationCalls.map(call => call.payload.client_request_id), ['client-request-0001', 'client-request-0001']);
  assert.ok(interpretationCalls.every(call => call.payload.mode === 'A'), 'B stays disabled by the client gate');
  assert.ok(interpretationCalls.every(call => call.options.headers.Authorization === 'Bearer guest-1'));
  assert.ok(interpretationCalls.every(call => Object.keys(call.payload).sort().join(',') === 'client_request_id,mode,query'));
  assert.ok(harness.localData.haaiInstallId);
  assert.equal(harness.localData.haaiGuestToken, 'guest-1');

  const handoff = await harness.send({ type: 'HAAI_CONSUME_PLAN', launchToken: 'opaque.launch-token-123456' });
  assert.equal(handoff.ok, true);
  const consumeCall = calls.find(call => call.url.endsWith('/v1/plans/consume'));
  assert.deepEqual(consumeCall.payload, { launch_token: 'opaque.launch-token-123456' });
  assert.equal(consumeCall.options.headers.Authorization, undefined, 'one-use handoffs are consumed without account or guest authorization');
  assert.equal((await harness.send({ type: 'HAAI_GET_CONFIG' })).config.googleOAuthConfigured, false);

  const homeCalls = [];
  const homeHarness = createHarness(async (url, options) => {
    homeCalls.push({ url, options, payload: JSON.parse(options.body) });
    if (url.endsWith('/v1/guest')) return reply({ access_token: 'home-guest', token_type: 'bearer', expires_in: 3600, principal_type: 'guest', install_id: JSON.parse(options.body).install_id });
    if (url.endsWith('/v1/interpret')) return reply({ filters: [{ n: 'form[bodyType][]', t: 'select', v: 'Kombi' }], omissions: [], mode: 'B', request_id: 'home-request' });
    throw new Error(`Unexpected URL ${url}`);
  }, { apiBaseUrl: 'http://localhost:8080', enableHomeMode: false }, { version: 'test' }, true);
  const homeConfig = (await homeHarness.send({ type: 'HAAI_GET_CONFIG' })).config;
  assert.equal(homeConfig.homeModeBuildEnabled, true);
  assert.equal(homeConfig.enableHomeMode, false, 'B build capability remains off until its runtime toggle is enabled');
  const savedHomeConfig = await homeHarness.send({ type: 'HAAI_SAVE_CONFIG', apiBaseUrl: 'http://localhost:8080', enableHomeMode: true });
  assert.equal(savedHomeConfig.ok, true);
  assert.equal((await homeHarness.send({ type: 'HAAI_GET_CONFIG' })).config.enableHomeMode, true);
  const homeResult = await homeHarness.send({ type: 'HAAI_INTERPRET', query: 'kombi', mode: 'B', client_request_id: 'home-client-request' });
  assert.equal(homeResult.ok, true);
  assert.equal(homeCalls.find(call => call.url.endsWith('/v1/interpret')).payload.mode, 'B');

  const googleCalls = [];
  const googleHarness = createHarness(async (url, options) => {
    googleCalls.push({ url, options, payload: JSON.parse(options.body) });
    if (url.endsWith('/v1/auth/google')) return reply({ access_token: 'account-api-token', token_type: 'bearer', expires_in: 3600, principal_type: 'user' });
    if (url.endsWith('/v1/interpret')) return reply({ filters: [{ n: 'form[price][to]', t: 'number', value: 4000000, l: '4 000 000 Ft' }], omissions: [], mode: 'A', request_id: 'google-request' });
    throw new Error(`Unexpected URL ${url}`);
  }, { apiBaseUrl: 'http://localhost:8080', enableHomeMode: false }, {
    version: 'test', oauth2: { client_id: '123456789-example.apps.googleusercontent.com' }
  });
  const login = await googleHarness.send({ type: 'HAAI_GOOGLE_LOGIN' });
  assert.equal(login.ok, true);
  assert.equal(login.result.principalType, 'user');
  assert.equal(googleHarness.sessionData.haaiAccountToken, 'account-api-token');
  assert.equal(googleHarness.localData.haaiGuestToken, undefined, 'Account auth does not issue or persist a guest token');
  assert.deepEqual(googleCalls[0].payload, { google_access_token: 'google-access-token' });
  const accountInterpretation = await googleHarness.send({ type: 'HAAI_INTERPRET', query: 'vw golf', mode: 'A' });
  assert.equal(accountInterpretation.ok, true);
  assert.equal(googleCalls[1].options.headers.Authorization, 'Bearer account-api-token');
  assert.deepEqual(googleCalls[1].payload, { query: 'vw golf', mode: 'A', client_request_id: googleCalls[1].payload.client_request_id });
  await googleHarness.send({ type: 'HAAI_GOOGLE_LOGOUT' });
  assert.equal(googleHarness.sessionData.haaiAccountToken, undefined);

  const refreshCalls = [];
  const refreshHarness = createHarness(async (url, options) => {
    const payload = JSON.parse(options.body); refreshCalls.push({ url, options, payload });
    if (url.endsWith('/v1/guest')) return reply({ access_token: `guest-${refreshCalls.filter(call => call.url.endsWith('/v1/guest')).length}`, token_type: 'bearer', expires_in: 3600, install_id: payload.install_id });
    if (refreshCalls.filter(call => call.url.endsWith('/v1/interpret')).length === 1) return reply({ error: 'expired' }, 401);
    return reply({ filters: [], omissions: [], mode: 'A', request_id: 'request-2' });
  }, { apiBaseUrl: 'http://localhost:8080', enableHomeMode: false, haaiInstallId: 'stable-install-identifier', haaiGuestToken: 'expired', haaiGuestTokenExpiresAt: Date.now() + 3600000 });
  const refreshed = await refreshHarness.send({ type: 'HAAI_INTERPRET', query: 'toyota yaris', client_request_id: 'client-request-0002' });
  assert.equal(refreshed.ok, true);
  assert.equal(refreshHarness.localData.haaiInstallId, 'stable-install-identifier');
  assert.equal(refreshHarness.localData.haaiGuestToken, 'guest-1');
  assert.deepEqual(refreshCalls.filter(call => call.url.endsWith('/v1/interpret')).map(call => call.payload.client_request_id), ['client-request-0002', 'client-request-0002']);

  const invalidHandoff = await harness.send({ type: 'HAAI_CONSUME_PLAN', launchToken: 'short' });
  assert.equal(invalidHandoff.ok, false);
  console.log('Background API client guest and Google auth, bounded retry, default-off A/B build/runtime gates, and handoff checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
