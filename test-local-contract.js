'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;

const apiBaseUrl = process.argv[2];
const useIpc = process.argv[3] === '--ipc';
const manualApiKey = process.argv[4];
const extensionOrigin = process.env.HAAI_EXTENSION_ORIGIN || 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const contractQuery = process.env.HAAI_TEST_QUERY || 'kombi 2018-tól';
const expectedFilters = JSON.parse(process.env.HAAI_EXPECTED_FILTERS_JSON || '[{"n":"form[bodyType][]","v":"70"}]');
if (!apiBaseUrl || !useIpc || !manualApiKey) throw new Error('Run this check through the workspace-root verify-repositories.py harness.');
if (!Array.isArray(expectedFilters)) throw new Error('HAAI_EXPECTED_FILTERS_JSON must be an array.');
const parsedBase = new URL(apiBaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsedBase.hostname) || parsedBase.protocol !== 'http:') {
  throw new Error('This test is restricted to a local HTTP backend.');
}

const messages = [];
const localData = { apiBaseUrl, enableHomeMode: false };
const sessionData = {};
const chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: 'integration-test' }),
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
      remove: (keys, callback) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete sessionData[key]; callback?.(); }
    }
  }
};

function readLineSync() {
  let line = '';
  const byte = Buffer.alloc(1);
  while (true) {
    const count = fs.readSync(0, byte, 0, 1, null);
    if (count === 0) throw new Error('Integration bridge closed before replying.');
    if (byte[0] === 10) return line;
    line += byte.toString('utf8');
  }
}

async function nativeFetch(url, options = {}) {
  const requestId = `${Date.now()}-${Math.random()}`;
  process.stdout.write(JSON.stringify({
    id: requestId,
    url: String(url),
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || null
  }) + '\n');
  const response = JSON.parse(readLineSync());
  if (response.id !== requestId) throw new Error('Integration bridge response ID mismatch.');
  const headers = Object.fromEntries(Object.entries(response.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    ok: response.ok,
    status: response.status,
    headers: { get: name => headers[String(name).toLowerCase()] || null },
    json: async () => response.body
  };
}

const extensionFetch = (url, options = {}) => nativeFetch(url, {
  ...options,
  headers: { ...(options.headers || {}), Origin: extensionOrigin }
});
const context = vm.createContext({
  chrome, crypto, URL, AbortController, fetch: extensionFetch,
  setTimeout, clearTimeout, Promise, Math, JSON, Date, module: { exports: {} }
});
vm.runInContext(fs.readFileSync(require.resolve('./background.js'), 'utf8'), context, { filename: 'background.js' });
const send = message => new Promise(resolve => {
  const keepOpen = messages[0](message, {}, resolve);
  assert.equal(keepOpen, true);
});

(async () => {
  const preflight = await nativeFetch(`${apiBaseUrl}/v1/guest`, {
    method: 'OPTIONS',
    headers: {
      Origin: extensionOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type'
    }
  });
  assert.equal(preflight.status, 200, 'backend permits extension CORS preflight');
  assert.equal(preflight.headers.get('access-control-allow-origin'), extensionOrigin);

  const interpreted = await send({
    type: 'HAAI_INTERPRET',
    query: contractQuery,
    mode: 'A',
    client_request_id: 'local-contract-check-001'
  });
  assert.equal(interpreted.ok, true, `extension client calls the backend: ${interpreted.error || ''}`);
  assert.equal(interpreted.data.mode, 'A');
  assert.ok(interpreted.data.request_id);
  for (const expected of expectedFilters) {
    assert.ok(interpreted.data.filters.some(filter =>
      filter.n === expected.n && (expected.v === undefined || filter.v === expected.v) &&
      (expected.value === undefined || filter.value === expected.value)
    ), `expected live operation ${JSON.stringify(expected)}`);
  }
  assert.ok(localData.haaiGuestToken, 'extension received and stored the guest bearer');

  const planResponse = await extensionFetch(`${apiBaseUrl}/v1/plans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localData.haaiGuestToken}`
    },
    body: JSON.stringify({ request_id: interpreted.data.request_id })
  });
  assert.equal(planResponse.status, 200, 'backend creates the one-use handoff for the extension result');
  const { launch_token: launchToken } = await planResponse.json();
  assert.ok(typeof launchToken === 'string' && launchToken.length >= 16);

  const consumed = await send({ type: 'HAAI_CONSUME_PLAN', launchToken });
  assert.equal(consumed.ok, true, `extension consumes the backend plan: ${consumed.error || ''}`);
  for (const expected of expectedFilters) {
    assert.ok(consumed.data.filters.some(filter =>
      filter.n === expected.n && (expected.v === undefined || filter.v === expected.v) &&
      (expected.value === undefined || filter.value === expected.value)
    ), `expected handed-off operation ${JSON.stringify(expected)}`);
  }

  const keySaved = await send({ type: 'HAAI_SAVE_MANUAL_KEY', apiKey: manualApiKey });
  assert.equal(keySaved.ok, true, `extension validates and stores a manually issued API key: ${keySaved.error || ''}`);
  assert.equal(keySaved.quota.remaining_requests, 1);
  const keyQuota = await send({ type: 'HAAI_GET_QUOTA' });
  assert.equal(keyQuota.ok, true);
  assert.equal(keyQuota.quota.remaining_requests, 1);
  const keySearch = await send({
    type: 'HAAI_INTERPRET',
    query: 'kombi 2018-tól',
    mode: 'A',
    client_request_id: 'manual-key-contract-001'
  });
  assert.equal(keySearch.ok, true, `extension calls the backend with its manual key: ${keySearch.error || ''}`);
  const spentQuota = await send({ type: 'HAAI_GET_QUOTA' });
  assert.equal(spentQuota.quota.remaining_requests, 0);

  console.error('Local extension ↔ backend contract passed: CORS, guest auth, interpretation, one-use handoff, manual API-key auth, and remaining balance.');
})().catch(error => { console.error(error); process.exitCode = 1; });
