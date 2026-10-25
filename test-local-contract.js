'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;

const apiBaseUrl = process.argv[2];
const useIpc = process.argv[3] === '--ipc';
const extensionOrigin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
if (!apiBaseUrl || !useIpc) throw new Error('Run this check through the workspace-root verify-repositories.py harness.');
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
    query: 'kombi 2018-tól',
    mode: 'A',
    client_request_id: 'local-contract-check-001'
  });
  assert.equal(interpreted.ok, true, `extension client calls the backend: ${interpreted.error || ''}`);
  assert.equal(interpreted.data.mode, 'A');
  assert.ok(interpreted.data.request_id);
  assert.ok(interpreted.data.filters.some(filter => filter.n === 'form[bodyType][]' && filter.v === '70'));
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
  assert.ok(consumed.data.filters.some(filter => filter.n === 'form[bodyType][]' && filter.v === '70'));

  console.error('Local extension ↔ backend contract passed: CORS, guest auth, interpretation payload/response, and one-use plan handoff.');
})().catch(error => { console.error(error); process.exitCode = 1; });
