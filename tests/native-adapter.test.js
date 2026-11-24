const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const adapterSource = readFileSync(path.join(__dirname, "..", "native-adapter.js"), "utf8");

class FakeControl {
  constructor(form, { name, type, value, checked = false }) {
    Object.assign(this, { form, name, type, value, checked });
  }

  click() {
    if (this.type === "radio") {
      for (const peer of this.form.elements.filter(element => element.name === this.name)) peer.checked = false;
      this.checked = true;
      this.form.onRadioClick?.(this);
    } else if (this.type === "checkbox") {
      this.checked = !this.checked;
    }
  }

  dispatchEvent() {}
}

class FakeSelect extends FakeControl {
  constructor(form, { name, value = "", options = [] }) {
    super(form, { name, type: "select-one", value });
    this.tagName = "SELECT";
    this.options = options.map(option => ({ value: option }));
    this.ownerDocument = { defaultView: { HTMLSelectElement: FakeSelect, Event: class {} } };
  }

  get value() { return this._value; }
  set value(value) { this._value = String(value); }
}

class FakeInput extends FakeControl {
  get value() { return this._value; }
  set value(value) { this._value = String(value); }
}

function loadAdapter() {
  const context = { setTimeout };
  vm.runInNewContext(adapterSource, context, { filename: "native-adapter.js" });
  return context.HAAINativeAdapter;
}

test("applies legacy brand/model operations to the current row-based radio controls", async () => {
  const form = { elements: [], querySelectorAll() { return this.elements; } };
  const addRadio = (name, value, checked = false) => {
    const control = new FakeControl(form, { name, type: "radio", value, checked });
    form.elements.push(control);
    return control;
  };

  const brandName = "form[brandModelRows][0][brand]";
  const modelName = "form[brandModelRows][0][model]";
  addRadio(brandName, "");
  addRadio(brandName, "2269");
  addRadio(modelName, "", true);
  form.onRadioClick = control => {
    if (control.name !== brandName) return;
    setTimeout(() => {
      form.elements = form.elements.filter(element => element.name !== modelName);
      addRadio(modelName, "");
      addRadio(modelName, "25794");
    }, 0);
  };
  const year = new FakeSelect(form, {
    name: "form[productionYear][from]",
    options: ["", "2022", "2023", "2024"]
  });
  form.elements.push(year);

  const adapter = loadAdapter();
  await adapter.applyAdvanced(form, [
    { n: "form[brandModel][brand][]", t: "checkbox", v: "2269" },
    { n: "form[brandModel][model][]", t: "checkbox", v: "25794" },
    { n: "form[productionYear][from]", t: "option", v: "2023" }
  ]);

  assert.equal(form.elements.find(element => element.name === brandName && element.value === "2269").checked, true);
  assert.equal(form.elements.find(element => element.name === modelName && element.value === "25794").checked, true);
  assert.equal(year.value, "2023");
});

test("continues to apply legacy checkbox brand/model controls", async () => {
  const form = { elements: [], querySelectorAll() { return this.elements; } };
  for (const [name, value] of [
    ["form[brandModel][brand][]", "2269"],
    ["form[brandModel][model][]", "25794"]
  ]) {
    form.elements.push(new FakeControl(form, { name, type: "checkbox", value }));
  }

  const adapter = loadAdapter();
  await adapter.applyAdvanced(form, [
    { n: "form[brandModel][brand][]", t: "checkbox", v: "2269" },
    { n: "form[brandModel][model][]", t: "checkbox", v: "25794" }
  ]);

  assert.deepEqual(form.elements.map(element => element.checked), [true, true]);
});

test("waits for the postcode suggestion before selecting it", async () => {
  let suggestions = [];
  let selected = 0;
  const form = { elements: [], querySelectorAll() { return this.elements; } };
  const input = new FakeInput(form, { name: "", type: "text", value: "" });
  input.dispatchEvent = () => {
    if (input.value !== "1024") return;
    setTimeout(() => { suggestions = [button]; }, 10);
  };
  const button = {
    dataset: { postalCode: "1024" },
    click() { selected += 1; }
  };
  form.querySelector = selector => selector === "#settlementSelect" ? input : null;
  form.ownerDocument = {
    defaultView: {
      HTMLInputElement: FakeInput,
      HTMLSelectElement: FakeSelect,
      Event: class {}
    },
    querySelectorAll: selector => selector === "button[data-postal-code]" ? suggestions : []
  };
  input.ownerDocument = form.ownerDocument;

  const adapter = loadAdapter();
  await adapter.applyAdvanced(form, [
    { n: "form[location][settlement]", t: "postcode", value: 1024 }
  ]);

  assert.equal(input.value, "1024");
  assert.equal(selected, 1);
});
