const assert = require('node:assert/strict');
const adapter = require('./native-adapter.js');

class TestEvent { constructor(type, init = {}) { this.type = type; this.bubbles = init.bubbles === true; } }
class TestInput {
  constructor(name, type, value) {
    this.name = name; this.type = type; this.value = value; this.checked = false; this.tagName = 'INPUT'; this.events = [];
    this.ownerDocument = { defaultView: { HTMLInputElement: TestInput, HTMLSelectElement: TestSelect, Event: TestEvent } };
  }
  click() { if (this.type === 'radio') { this.checked = true; return; } this.checked = !this.checked; }
  dispatchEvent(event) { this.events.push(event.type); return true; }
}
class TestSelect {
  constructor(name, value, options) {
    this.name = name; this.type = 'select-one'; this.value = value; this.tagName = 'SELECT'; this.options = options.map(option => ({ value: option })); this.events = [];
    this.ownerDocument = { defaultView: { HTMLInputElement: TestInput, HTMLSelectElement: TestSelect, Event: TestEvent } };
  }
  dispatchEvent(event) { this.events.push(event.type); return true; }
}
Object.defineProperty(TestInput.prototype, 'value', { get() { return this._value || ''; }, set(value) { this._value = String(value); } });
Object.defineProperty(TestSelect.prototype, 'value', { get() { return this._value || ''; }, set(value) { this._value = String(value); } });

const brandName = 'form[brandModel][brand][]';
const modelName = 'form[brandModel][model][]';
const fields = [
  new TestInput(brandName, 'checkbox', '122'),
  new TestInput(modelName, 'checkbox', '1392'),
  new TestSelect('form[productionYear][from]', '', ['', '2018', '2019']),
  new TestInput('form[price][to]', 'number', ''),
  new TestInput('form[transmission][transmission][]', 'radio', 'A')
];
const form = { querySelectorAll: () => fields };

const operations = adapter.validateOperations([
  { n: brandName, t: 'checkbox', v: '122' },
  { n: modelName, t: 'checkbox', v: '1392' },
  { n: 'form[productionYear][from]', t: 'option', v: '2018' },
  { n: 'form[price][to]', t: 'number', value: 4000000 },
  { n: 'form[transmission][transmission][]', t: 'radio', v: 'A' }
]);
assert.equal(operations.length, 5);
assert.throws(() => adapter.validateOperations([{ n: 'anything', t: 'selector', v: 'x' }]), /formátuma hibás/);
assert.throws(() => adapter.validateOperations([{ n: 'x', t: 'number', value: Infinity }]), /értéke hibás/);
assert.throws(() => adapter.validateOperations(Array.from({ length: 76 }, (_, i) => ({ n: `f${i}`, t: 'checkbox', v: '1' }))), /túl sok feltételt/);
assert.deepEqual(adapter.omissions([' kimaradt ', '', 'kimaradt', 12]), ['kimaradt']);

(async () => {
  await adapter.applyAdvanced(form, operations);
  assert.equal(fields[0].checked, true);
  assert.equal(fields[1].checked, true);
  assert.equal(fields[2].value, '2018');
  assert.equal(fields[3].value, '4000000');
  assert.equal(fields[4].checked, true);
  await assert.rejects(() => adapter.applyAdvanced(form, [{ n: 'form[price][to]', t: 'number', value: -1 }]), /Érvénytelen számérték/);
  await assert.rejects(() => adapter.applyAdvanced(form, [{ n: 'missing', t: 'checkbox', v: '1' }]), /Eltűnt vagy megváltozott mező/);

  class HomeInput {
    constructor(doc, name, value = '', type = 'text') { this.ownerDocument = doc; this.name = name; this.value = value; this.type = type; this.disabled = false; this.checked = false; }
    dispatchEvent() { return true; }
    focus() {}
    getBoundingClientRect() { return { width: 120, height: 24 }; }
  }
  Object.defineProperty(HomeInput.prototype, 'value', { get() { return this._value || ''; }, set(value) { this._value = String(value); } });
  class HomeSelect extends HomeInput {
    constructor(doc, name, value, values) { super(doc, name, value, 'select-one'); this.tagName = 'SELECT'; this.options = values.map(option => ({ value: option })); }
  }
  Object.defineProperty(HomeSelect.prototype, 'value', { get() { return this._value || ''; }, set(value) { this._value = String(value); } });
  class HomeOption {
    constructor(doc, label, select) { this.ownerDocument = doc; this.textContent = label; this.select = select; }
    getAttribute() { return null; }
    click() {
      this.select.input.value = this.textContent;
      if (this.select.testid === 'brand-select') this.select.model.disabled = false;
    }
    getBoundingClientRect() { return { width: 160, height: 28 }; }
  }
  const menu = (doc, trigger, labels) => {
    const items = labels.map(label => {
      const checkbox = { checked: false };
      return {
        textContent: label,
        querySelector(selector) { return selector === 'input[type="checkbox"]' ? checkbox : null; },
        getAttribute() { return null; },
        getBoundingClientRect() { return { width: 160, height: 28 }; },
        click() { checkbox.checked = !checkbox.checked; const selected = items.filter(item => item.checkbox.checked).map(item => item.textContent); trigger.textContent = selected.length ? selected.join(', ') : 'Mindegy'; }
      , checkbox };
    });
    return items;
  };
  const homeDoc = {
    activeOptions: [], activeMenu: [],
    defaultView: { HTMLInputElement: HomeInput, HTMLSelectElement: HomeSelect, Event: TestEvent, MouseEvent: TestEvent, KeyboardEvent: TestEvent, requestAnimationFrame(callback) { callback(); } },
    querySelector() { return homeForm; },
    querySelectorAll(selector) { return selector.includes('[role="option"]') ? this.activeOptions : selector.includes('li[role="menuitem"]') ? this.activeMenu : []; },
    get activeElement() { return null; }
  };
  const brand = new HomeInput(homeDoc, 'brand', '', 'text');
  const model = new HomeInput(homeDoc, 'model', '', 'text'); model.disabled = true;
  const yearFrom = new HomeSelect(homeDoc, 'yearFrom', '', ['', '2018', '2019']);
  const priceTo = new HomeInput(homeDoc, 'priceTo', '', 'number');
  const bodyTrigger = { ownerDocument: homeDoc, textContent: 'Mindegy', getBoundingClientRect() { return { width: 120, height: 24 }; }, dispatchEvent() { homeDoc.activeMenu = bodyItems; return true; } };
  const fuelTrigger = { ownerDocument: homeDoc, textContent: 'Mindegy', getBoundingClientRect() { return { width: 120, height: 24 }; }, dispatchEvent() { homeDoc.activeMenu = fuelItems; return true; } };
  const brandRoute = { input: brand, model, testid: 'brand-select' };
  const modelRoute = { input: model, model, testid: 'model-select' };
  homeDoc.activeOptions = [new HomeOption(homeDoc, 'Skoda', brandRoute), new HomeOption(homeDoc, 'Volkswagen', brandRoute)];
  brand.dispatchEvent = event => { if (event.type === 'input') homeDoc.activeOptions = [new HomeOption(homeDoc, 'Skoda', brandRoute), new HomeOption(homeDoc, 'Volkswagen', brandRoute)]; return true; };
  model.dispatchEvent = event => { if (event.type === 'input') homeDoc.activeOptions = [new HomeOption(homeDoc, 'Octavia', modelRoute), new HomeOption(homeDoc, 'Superb', modelRoute)]; return true; };
  const bodyItems = menu(homeDoc, bodyTrigger, ['Kombi', 'Sedan']);
  const fuelItems = menu(homeDoc, fuelTrigger, ['Hibrid (Benzin)', 'Dízel']);
  let submitted = 0;
  const submitButton = { disabled: false, click() { submitted++; } };
  const homeForm = {
    querySelector(selector) {
      if (selector === '[data-testid="brand-select"] input[role="combobox"]') return brand;
      if (selector === '[data-testid="model-select"] input[role="combobox"]') return model;
      if (selector === '[data-testid="body-type-select"] [role="combobox"]') return bodyTrigger;
      if (selector === '[data-testid="fuel-select"] [role="combobox"]') return fuelTrigger;
      if (selector === 'select[name="yearFrom"]') return yearFrom;
      if (selector === 'input[name="priceTo"]') return priceTo;
      if (selector === '[data-testid="submit-button"]') return submitButton;
      return null;
    }
  };
  brand.ownerDocument = model.ownerDocument = yearFrom.ownerDocument = priceTo.ownerDocument = homeDoc;
  bodyItems.forEach(item => { item.ownerDocument = homeDoc; });
  fuelItems.forEach(item => { item.ownerDocument = homeDoc; });
  const homeOperations = adapter.validateHomeOperations([
    { n: brandName, t: 'checkbox', v: 'brand-id-1', l: 'Skoda' },
    { n: modelName, t: 'checkbox', v: 'model-id-1', l: 'Octavia' },
    { n: 'form[productionYear][from]', t: 'option', v: '2018' },
    { n: 'form[price][to]', t: 'number', value: 4000000 },
    { n: 'form[bodyType][]', t: 'select', v: 'Kombi' },
    { n: 'form[fuelType][]', t: 'select', v: 'Hibrid (Benzin)' }
  ]);
  await adapter.applyHome(homeDoc, homeOperations);
  adapter.submitHome(homeDoc);
  assert.equal(brand.value, 'Skoda');
  assert.equal(model.value, 'Octavia');
  assert.equal(yearFrom.value, '2018');
  assert.equal(priceTo.value, '4000000');
  assert.equal(bodyTrigger.textContent, 'Kombi');
  assert.equal(fuelTrigger.textContent, 'Hibrid (Benzin)');
  assert.equal(submitted, 1);
  assert.throws(() => adapter.validateHomeOperations([{ n: 'form[unknown][]', t: 'select', v: 'anything' }]), /nem támogatott/);
  assert.throws(() => adapter.validateHomeOperations([{ n: modelName, t: 'checkbox', v: '1', l: 'Octavia' }]), /márkát is meg kell adni/);
  console.log('A and B native operations validate against and apply only to exact live-form controls');
})().catch(error => { console.error(error); process.exitCode = 1; });
