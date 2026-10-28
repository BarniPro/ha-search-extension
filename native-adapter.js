(() => {
  const ALLOWED_TYPES = new Set(["checkbox", "radio", "option", "number", "postcode"]);
  const BRAND_NAME = "form[brandModel][brand][]";
  const MODEL_NAME = "form[brandModel][model][]";

  function validateOperations(filters) {
    if (!Array.isArray(filters) || filters.length > 75) throw new Error("A keresési feltételeket nem sikerült beolvasni.");
    const seen = new Set();
    const result = [];
    for (const item of filters) {
      if (!item || typeof item !== "object" || typeof item.n !== "string" || !item.n.length || item.n.length > 160 || !ALLOWED_TYPES.has(item.t)) throw new Error("Egy keresési feltételt nem sikerült beolvasni.");
      if (item.v !== undefined && (typeof item.v !== "string" || item.v.length > 300)) throw new Error("Egy keresési feltétel értéke érvénytelen.");
      if (item.value !== undefined && !(typeof item.value === "string" && item.value.length <= 300) && !(Number.isSafeInteger(item.value) && item.value >= 0 && item.value <= 1_000_000_000)) throw new Error("Egy keresési feltétel értéke érvénytelen.");
      if (item.e !== undefined && (typeof item.e !== "string" || item.e.length > 300)) throw new Error("Egy keresési feltétel szövege érvénytelen.");
      if (item.l !== undefined && (typeof item.l !== "string" || item.l.length > 200)) throw new Error("Egy keresési feltétel neve érvénytelen.");
      if (["checkbox", "radio", "option"].includes(item.t) && typeof item.v !== "string") throw new Error("Egy keresési feltételből hiányzik a kiválasztási érték.");
      if (["number", "postcode"].includes(item.t) && item.value === undefined) throw new Error("Egy keresési feltételből hiányzik a számérték.");
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

  async function until(predicate, timeout = 6000, interval = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, interval));
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
      }
    }
  }

  globalThis.HAAINativeAdapter = { validateOperations, omissions, applyAdvanced };
})();
