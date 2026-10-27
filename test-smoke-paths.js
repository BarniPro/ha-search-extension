'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const content = read('content.js');
const background = read('background.js');
const advanced = read('advanced.js');
const adapter = read('native-adapter.js');
const popup = read('popup.js');
const manifest = JSON.parse(read('manifest.json'));

assert.match(background, /\/v1\/guest/);
assert.match(background, /\/v1\/interpret/);
assert.match(background, /\/v1\/auth\/google/);
assert.match(background, /\/v1\/plans\/consume/);
assert.match(background, /const mode = message\.mode === "B" && config\.enableHomeMode \? "B" : "A"/);
assert.match(background, /\["A", "B"\]\.includes\(data\.mode\)/);
assert.match(background, /apiBaseUrl: "http:\/\/localhost:8080"/);
assert.doesNotMatch(background, /const CONFIGURED_BACKEND_ORIGIN = "https?:\/\/(?:localhost|127\.0\.0\.1):\d+"/);

assert.match(content, /fragmentParams\.get\('haai_token'\)/);
assert.match(content, /fragmentParams\.delete\('haai_token'\)/);
assert.match(content, /HAAIQuickSearchUI\?\.css/);
assert.doesNotMatch(content, /searchParams\.(?:get|delete)\(['"]haai_token['"]\)/);
assert.match(content, /history\.replaceState/);
assert.match(content, /\/bovitettkereso\/szemelyauto/);
assert.match(content, /path\.startsWith\('\/talalatilista\/'\)/);
assert.match(content, /plan\.mode !== 'A'/);
assert.match(content, /plan\.mode === 'B'/);
assert.match(content, /launchHomePlan/);
assert.doesNotMatch(content, /sessionStorage\.setItem\([^,]+,[^\n]*query/);
assert.match(advanced, /plan\?\.mode !== "A"/);
assert.match(advanced, /JSON\.stringify\(\{ omissions \}\)/);
assert.doesNotMatch(advanced, /JSON\.stringify\(\{[^}]*query/);
assert.match(adapter, /controls\(form, name\)/);
assert.match(adapter, /Eltűnt vagy megváltozott mező/);

const allScripts = manifest.content_scripts.flatMap(entry => entry.js || []);
assert.ok(allScripts.includes('content.js'));
assert.ok(allScripts.includes('quick-search-ui.js'));
assert.ok(allScripts.includes('advanced.js'));
assert.ok(allScripts.includes('native-adapter.js'));
assert.ok(manifest.content_scripts.every(entry => entry.matches.every(match => match.startsWith('https://www.hasznaltauto.hu/'))));
const detailedSearchScript = manifest.content_scripts.find(entry => entry.matches.some(match => match.includes('/bovitettkereso/')));
assert.equal(detailedSearchScript?.all_frames, true, 'Detailed-search adapter must run inside the hidden same-origin iframe');
assert.ok(manifest.content_scripts[0].js.indexOf('quick-search-ui.js') < manifest.content_scripts[0].js.indexOf('content.js'));
assert.deepEqual(manifest.optional_host_permissions, [
  'http://localhost/*', 'http://127.0.0.1/*'
]);
assert.match(adapter, /validateHomeOperations/);
assert.match(adapter, /applyHomeSelect/);
assert.match(adapter, /applyHomeAutocomplete/);
assert.match(popup, /url\.origin !== config\.backendOrigin/);
assert.match(popup, /!localhost/);
assert.match(popup, /http:\/\/localhost:8080/);
assert.match(popup, /modeEvent\?\.mode/);
console.log('Thin extension smoke checks passed: hosted API, fragment handoff, origin allowlist, A/B adapters, and no raw query persistence');
