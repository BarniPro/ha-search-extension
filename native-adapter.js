(() => {
  const ALLOWED_TYPES = new Set(["checkbox", "radio", "option", "number", "postcode", "select", "autocomplete"]);
  const BRAND_NAME = "form[brandModel][brand][]";
  const MODEL_NAME = "form[brandModel][model][]";
  const HOME_FORM = '#szemelyauto .micro-frontend-component[data-mfc-component-name="PersonalVehicleSearchBox"] form';
  // This is only the mapping from backend native names to actual live form
  // controls. It contains no option IDs, labels, or catalog values.
  const HOME_AUTOCOMPLETE_TESTIDS = Object.freeze({
    [BRAND_NAME]: "brand-select",
    [MODEL_NAME]: "model-select"
  });
  const HOME_SELECT_TESTIDS = Object.freeze({
    "form[bodyType][]": "body-type-select",
    "form[fuelType][]": "fuel-select"
  });
  const HOME_YEAR_NAMES = Object.freeze({
    "form[productionYear][from]": "yearFrom",
    "form[productionYear][to]": "yearTo"
  });
  const HOME_NUMBER_NAMES = Object.freeze({
    "form[price][from]": "priceFrom",
    "form[price][to]": "priceTo",
    "form[mileage][from]": "mileageFrom",
    "form[mileage][to]": "mileageTo"
  });
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  function validateOperations(filters) {
    if (!Array.isArray(filters) || filters.length > 75) throw new Error("A backend válasza hibás vagy túl sok feltételt tartalmaz.");
    const seen = new Set();
    const result = [];
    for (const item of filters) {
      if (!item || typeof item !== "object" || typeof item.n !== "string" || !item.n.length || item.n.length > 160 || !ALLOWED_TYPES.has(item.t)) throw new Error("Egy backend-feltétel formátuma hibás.");
      if (item.v !== undefined && (typeof item.v !== "string" || item.v.length > 300)) throw new Error("Egy backend-feltétel értéke hibás.");
      if (item.value !== undefined && !(typeof item.value === "string" && item.value.length <= 300) && !(Number.isSafeInteger(item.value) && item.value >= 0 && item.value <= 1_000_000_000)) throw new Error("Egy backend-feltétel értéke hibás.");
      if (item.e !== undefined && (typeof item.e !== "string" || item.e.length > 300)) throw new Error("Egy backend-feltétel szövegrésze hibás.");
      if (item.l !== undefined && (typeof item.l !== "string" || item.l.length > 200)) throw new Error("Egy backend-feltétel címkéje hibás.");
      if (["checkbox", "radio", "option", "select", "autocomplete"].includes(item.t) && typeof item.v !== "string") throw new Error("Egy backend-feltételből hiányzik a kiválasztási érték.");
      if (["number", "postcode"].includes(item.t) && item.value === undefined) throw new Error("Egy backend-feltételből hiányzik a számérték.");
      const key = `${item.n}\u0000${item.t}\u0000${item.v ?? item.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...item });
    }
    return result;
  }

  function omissions(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(item => typeof item === "string").map(item => item.trim()).filter(Boolean))].slice(0, 8).map(item => item.slice(0, 300));
  }

  function validateHomeOperations(filters) {
    const operations = validateOperations(filters);
    const groups = new Map();
    for (const operation of operations) {
      const type = HOME_AUTOCOMPLETE_TESTIDS[operation.n] ? "checkbox"
        : HOME_SELECT_TESTIDS[operation.n] ? "select"
          : HOME_YEAR_NAMES[operation.n] ? "option"
            : HOME_NUMBER_NAMES[operation.n] ? "number" : null;
      if (!type || operation.t !== type) throw new Error(`A B művelet nem támogatott ezen a keresőűrlapon: ${operation.n}`);
      if (!groups.has(operation.n)) groups.set(operation.n, []);
      groups.get(operation.n).push(operation);
      if (type === "checkbox" && (typeof operation.v !== "string" || !operation.v || typeof operation.l !== "string" || !operation.l.trim())) throw new Error("A márka- vagy modellválasztáshoz natív ID és megjelenített címke szükséges.");
      if (type === "option" && !/^\d{4}$/.test(operation.v)) throw new Error("Az évjárat formátuma hibás.");
      if (type === "number" && (typeof operation.value !== "number" || !Number.isSafeInteger(operation.value) || operation.value < 0 || operation.value > 1_000_000_000)) throw new Error("A főoldali számmező értéke hibás.");
    }
    for (const [name, group] of groups) {
      if (HOME_AUTOCOMPLETE_TESTIDS[name] && group.length !== 1) throw new Error(`A B művelet csak egy értéket enged ehhez a mezőhöz: ${name}`);
      if ((HOME_YEAR_NAMES[name] || HOME_NUMBER_NAMES[name]) && group.length !== 1) throw new Error(`A B művelet csak egy értéket enged ehhez a mezőhöz: ${name}`);
    }
    if (groups.has(MODEL_NAME) && !groups.has(BRAND_NAME)) throw new Error("A B modellválasztáshoz márkát is meg kell adni.");
    return operations;
  }

  function controls(form, name) {
    return [...form.querySelectorAll("input[name],select[name]")].filter(element => element.name === name);
  }

  function setValue(element, value) {
    const view = element.ownerDocument.defaultView;
    const proto = element instanceof view.HTMLSelectElement ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(element, String(value));
    element.dispatchEvent(new view.Event("input", { bubbles: true }));
    element.dispatchEvent(new view.Event("change", { bubbles: true }));
  }

  async function until(test, timeout = 6000, interval = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await wait(interval);
    }
    return null;
  }

  async function applyAdvanced(form, filters) {
    const groups = new Map();
    for (const operation of filters) {
      if (!groups.has(operation.n)) groups.set(operation.n, []);
      groups.get(operation.n).push(operation);
    }
    const ordered = [...groups.entries()].sort(([left], [right]) => {
      const rank = name => name === BRAND_NAME ? 0 : name === MODEL_NAME ? 1 : 2;
      return rank(left) - rank(right);
    });
    for (const [name, group] of ordered) {
      const type = group[0].t;
      if (!group.every(operation => operation.t === type)) throw new Error(`Eltérő művelettípus ugyanahhoz a mezőhöz: ${name}`);
      if (type === "checkbox") {
        let elements = controls(form, name);
        if (name === MODEL_NAME && group.some(operation => !elements.some(element => element.value === operation.v))) {
          elements = await until(() => {
            const current = controls(form, name);
            return group.every(operation => current.some(element => element.value === operation.v)) ? current : null;
          }, 15000, 120) || [];
          for (const operation of group) if (!elements.some(element => element.value === operation.v)) throw new Error(`A kért modell nem szerepel a márkához tartozó mezőben: ${operation.v}`);
        }
        if (!elements.length || elements.some(element => element.type !== "checkbox")) throw new Error(`Eltűnt vagy megváltozott mező: ${name}`);
        for (const element of elements) if (element.checked) element.click();
        for (const operation of group) {
          const element = controls(form, name).find(candidate => candidate.value === operation.v);
          if (!element) throw new Error(`Eltűnt választható érték: ${operation.v}`);
          if (!element.checked) element.click();
        }
        for (const operation of group) if (!controls(form, name).some(element => element.value === operation.v && element.checked)) throw new Error(`Nem sikerült beállítani: ${operation.v}`);
      } else if (type === "radio") {
        const elements = controls(form, name);
        if (group.length !== 1 || !elements.length || elements.some(element => element.type !== "radio")) throw new Error(`Nem alkalmazható rádiómező: ${name}`);
        const selected = elements.find(element => element.value === group[0].v);
        if (!selected) throw new Error(`Hiányzó opció: ${group[0].v}`);
        selected.click();
        if (!selected.checked) throw new Error(`Nem sikerült beállítani: ${group[0].v}`);
      } else if (type === "option") {
        const elements = controls(form, name);
        if (group.length !== 1 || elements.length !== 1 || elements[0].tagName !== "SELECT") throw new Error(`Nem alkalmazható választómező: ${name}`);
        const select = elements[0];
        if (![...select.options].some(option => option.value === group[0].v)) throw new Error(`Hiányzó opció: ${group[0].v}`);
        setValue(select, group[0].v);
        if (select.value !== group[0].v) throw new Error(`Nem sikerült beállítani: ${group[0].v}`);
      } else if (type === "number") {
        if (group.length !== 1 || typeof group[0].value !== "number" || !Number.isSafeInteger(group[0].value) || group[0].value < 0 || group[0].value > 1_000_000_000) throw new Error(`Érvénytelen számérték: ${name}`);
        const elements = controls(form, name);
        if (elements.length !== 1 || !["number", "text", "hidden"].includes(elements[0].type)) throw new Error(`Eltűnt vagy megváltozott számmező: ${name}`);
        setValue(elements[0], group[0].value);
        if (Number(String(elements[0].value).replace(/[^\d]/g, "")) !== group[0].value) throw new Error(`Nem sikerült beállítani: ${name}`);
      } else if (type === "postcode") {
        const value = String(group[0].value);
        if (group.length !== 1 || !/^\d{4}$/.test(value)) throw new Error("Érvénytelen irányítószám.");
        const input = form.querySelector("#settlementSelect");
        if (!input) throw new Error("Az irányítószám-mező eltűnt.");
        setValue(input, value);
        const options = await until(() => [...form.ownerDocument.querySelectorAll("button[data-postal-code]")].filter(option => option.dataset.postalCode === value), 3000, 120) || [];
        if (options.length !== 1) throw new Error("Az irányítószám nem választható egyértelműen.");
        options[0].click();
      } else if (type === "select" || type === "autocomplete") {
        throw new Error("Ez az űrlap nem támogatja a főoldali B műveleteket.");
      }
    }
  }

  function findHomeForm(doc = globalThis.document) {
    return doc?.querySelector?.(HOME_FORM) || null;
  }

  function isVisible(element) {
    if (!element || element.disabled) return false;
    if (typeof element.getBoundingClientRect !== "function") return true;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function labelText(value) {
    return String(value || "").replace(/\s*\(\s*[\d\s.,]+\s*\)\s*$/, "").replace(/\s+/g, " ").trim();
  }

  function homeField(form, name) {
    if (HOME_AUTOCOMPLETE_TESTIDS[name]) return form.querySelector(`[data-testid="${HOME_AUTOCOMPLETE_TESTIDS[name]}"] input[role="combobox"]`);
    if (HOME_SELECT_TESTIDS[name]) return form.querySelector(`[data-testid="${HOME_SELECT_TESTIDS[name]}"] [role="combobox"]`);
    if (HOME_YEAR_NAMES[name]) return form.querySelector(`select[name="${HOME_YEAR_NAMES[name]}"]`);
    if (HOME_NUMBER_NAMES[name]) return form.querySelector(`input[name="${HOME_NUMBER_NAMES[name]}"]`);
    return null;
  }

  async function ensureHomeFields(doc, form, operations) {
    if (operations.every(operation => homeField(form, operation.n))) return form;
    const expanded = form.querySelector('[name="mileageTo"]');
    if (!expanded) {
      const toggle = form.querySelector('[data-testid="detailed-search-toggler"]');
      if (!toggle) throw new Error("A főoldali részletes mezők nem érhetők el.");
      toggle.click();
    }
    const ready = await until(() => {
      const current = findHomeForm(doc);
      return current && operations.every(operation => homeField(current, operation.n)) ? current : null;
    }, 6000, 100);
    if (!ready) throw new Error("A főoldali részletes mezők nem töltődtek be.");
    return ready;
  }

  async function applyHomeAutocomplete(doc, form, operation) {
    const testid = HOME_AUTOCOMPLETE_TESTIDS[operation.n];
    const input = form.querySelector(`[data-testid="${testid}"] input[role="combobox"]`);
    if (!input) throw new Error(`Hiányzik a ${testid} mező.`);
    if (operation.n === MODEL_NAME) {
      if (!await until(() => !input.disabled, 5000, 100)) throw new Error(`A ${testid} mező nem vált elérhetővé a márka kiválasztása után.`);
    } else if (input.disabled) throw new Error(`Letiltott a ${testid} mező.`);
    input.focus?.({ preventScroll: true });
    setValue(input, operation.l);
    const exactOptions = await until(() => {
      const options = [...doc.querySelectorAll('[role="listbox"] [role="option"]')].filter(isVisible);
      const matches = options.filter(option => labelText(option.textContent) === operation.l);
      return matches.length ? matches : null;
    }, 5000, 100) || [];
    if (exactOptions.length !== 1 || exactOptions[0].getAttribute?.("aria-disabled") === "true") throw new Error(`A címke nem választható egyértelműen: ${operation.l}`);
    exactOptions[0].click();
    const selected = await until(() => labelText(input.value) === operation.l, 3000, 80);
    if (!selected) throw new Error(`A főoldali ${testid} mező nem vette át a kiválasztott címkét.`);
  }

  function parseSelectedLabels(text) {
    return String(text || "").split(/,\s*/).map(labelText).filter(label => label && label.toLocaleLowerCase("hu-HU") !== "mindegy");
  }

  async function applyHomeSelect(doc, form, operations) {
    const name = operations[0].n;
    const testid = HOME_SELECT_TESTIDS[name];
    const trigger = form.querySelector(`[data-testid="${testid}"] [role="combobox"]`);
    if (!trigger || !isVisible(trigger)) throw new Error(`Hiányzik a főoldali ${testid} választó.`);
    const wanted = operations.map(operation => operation.v);
    const previous = parseSelectedLabels(trigger.textContent);
    if (previous.length && (previous.length !== wanted.length || !wanted.every(label => previous.includes(label)))) {
      throw new Error(`A főoldali ${testid} választó nem üres; a meglévő értékeket nem írtam felül.`);
    }
    if (previous.length === wanted.length && wanted.every(label => previous.includes(label))) return;
    const view = doc.defaultView;
    trigger.dispatchEvent(new view.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
    const items = await until(() => {
      const visible = [...doc.querySelectorAll('ul[role="listbox"] li[role="menuitem"]')].filter(item => isVisible(item) && !item.querySelector('li[role="menuitem"]'));
      return visible.length ? visible : null;
    }, 4000, 80) || [];
    const matches = new Map();
    for (const label of wanted) {
      const found = items.filter(item => labelText(item.textContent) === label);
      if (found.length !== 1) throw new Error(`A főoldali ${testid} opció nem található egyértelműen: ${label}`);
      matches.set(label, found[0]);
    }
    for (const [label, item] of matches) {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const selected = checkbox ? checkbox.checked : item.getAttribute?.("aria-selected") === "true";
      if (!selected) item.click();
      if (label !== wanted[wanted.length - 1]) await wait(40);
    }
    const verified = await until(() => {
      const actual = parseSelectedLabels(trigger.textContent);
      return actual.length === wanted.length && wanted.every(label => actual.includes(label));
    }, 4000, 80);
    if (!verified) throw new Error(`A főoldali ${testid} értékei nem egyeznek a kért opciókkal.`);
    const active = doc.activeElement;
    active?.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  async function applyHome(doc, filters) {
    const operations = validateHomeOperations(filters);
    if (!operations.length) throw new Error("A B terv nem tartalmaz beállítható feltételt.");
    let form = findHomeForm(doc);
    if (!form) throw new Error("A főoldali személyautó kereső nem található.");
    form = await ensureHomeFields(doc, form, operations);
    const groups = new Map();
    for (const operation of operations) {
      if (!groups.has(operation.n)) groups.set(operation.n, []);
      groups.get(operation.n).push(operation);
    }
    const ordered = [...groups.entries()].sort(([left], [right]) => {
      const rank = name => name === BRAND_NAME ? 0 : name === MODEL_NAME ? 1 : 2;
      return rank(left) - rank(right);
    });
    for (const [name, group] of ordered) {
      form = findHomeForm(doc) || form;
      if (HOME_AUTOCOMPLETE_TESTIDS[name]) {
        await applyHomeAutocomplete(doc, form, group[0]);
      } else if (HOME_SELECT_TESTIDS[name]) {
        await applyHomeSelect(doc, form, group);
      } else if (HOME_YEAR_NAMES[name]) {
        const select = homeField(form, name);
        const wanted = group[0].v;
        if (group.length !== 1 || !select || select.tagName !== "SELECT" || ![...select.options].some(option => option.value === wanted)) throw new Error(`Az évjárat nem választható a főoldali mezőben: ${wanted}`);
        setValue(select, wanted);
        if (select.value !== wanted) throw new Error(`A ${HOME_YEAR_NAMES[name]} mező ellenőrzése sikertelen.`);
      } else if (HOME_NUMBER_NAMES[name]) {
        const input = homeField(form, name);
        const wanted = group[0].value;
        if (group.length !== 1 || !input || !["number", "text", "hidden"].includes(input.type)) throw new Error(`Hiányzik vagy megváltozott a főoldali ${HOME_NUMBER_NAMES[name]} mező.`);
        setValue(input, wanted);
        if (Number(String(input.value).replace(/[^\d]/g, "")) !== wanted) throw new Error(`A ${HOME_NUMBER_NAMES[name]} mező ellenőrzése sikertelen.`);
      }
    }
    await new Promise(resolve => doc.defaultView.requestAnimationFrame(() => doc.defaultView.requestAnimationFrame(resolve)));
    verifyHome(doc, operations);
    return form;
  }

  function verifyHome(doc, operations) {
    const form = findHomeForm(doc);
    if (!form) throw new Error("A főoldali kereső eltűnt a visszaellenőrzés előtt.");
    for (const operation of operations) {
      if (HOME_AUTOCOMPLETE_TESTIDS[operation.n]) {
        const input = homeField(form, operation.n);
        if (labelText(input?.value) !== operation.l) throw new Error(`A ${HOME_AUTOCOMPLETE_TESTIDS[operation.n]} visszaellenőrzése sikertelen.`);
      } else if (HOME_SELECT_TESTIDS[operation.n]) {
        const trigger = homeField(form, operation.n);
        if (!parseSelectedLabels(trigger?.textContent).includes(operation.v)) throw new Error(`A ${HOME_SELECT_TESTIDS[operation.n]} visszaellenőrzése sikertelen.`);
      } else if (HOME_YEAR_NAMES[operation.n]) {
        if (homeField(form, operation.n)?.value !== operation.v) throw new Error(`A ${HOME_YEAR_NAMES[operation.n]} visszaellenőrzése sikertelen.`);
      } else if (HOME_NUMBER_NAMES[operation.n]) {
        if (Number(String(homeField(form, operation.n)?.value || "").replace(/[^\d]/g, "")) !== operation.value) throw new Error(`A ${HOME_NUMBER_NAMES[operation.n]} visszaellenőrzése sikertelen.`);
      }
    }
  }

  function submitHome(doc) {
    const form = findHomeForm(doc);
    const button = form?.querySelector('[data-testid="submit-button"]');
    if (!button || button.disabled) throw new Error("A főoldali natív keresésgomb nem érhető el.");
    button.click();
  }

  globalThis.HAAINativeAdapter = { validateOperations, validateHomeOperations, omissions, applyAdvanced, findHomeForm, applyHome, verifyHome, submitHome };
  if (typeof module !== "undefined") module.exports = globalThis.HAAINativeAdapter;
})();
