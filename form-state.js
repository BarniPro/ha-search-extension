(() => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = element => `${element.name}\u0000${element.type}\u0000${['checkbox','radio'].includes(element.type) ? element.value : ''}`;
  function capture(form) {
    return [...form.querySelectorAll('input[name],select[name],textarea[name]')]
      .filter(e => !['submit','button'].includes(e.type) && !/\[_token\]/.test(e.name))
      .map(e => ({ key: key(e), name: e.name, value: e.value, checked: e.checked, selected: e.multiple ? [...e.selectedOptions].map(o => o.value) : null }));
  }
  async function restore(form, snapshot) {
    const view = form.ownerDocument?.defaultView || globalThis;
    const brand = 'form[brandModel][brand][]';
    const model = 'form[brandModel][model][]';
    const rows = new Map(snapshot.map(row => [row.key, row]));
    const apply = elements => {
      for (const element of elements) {
        const row = rows.get(key(element)); if (!row) continue;
        if (['checkbox','radio'].includes(element.type)) {
          if (element.checked !== row.checked) {
            if (row.checked || element.type === 'checkbox') element.click();
            else { element.checked = false; element.dispatchEvent(new view.Event('change', { bubbles: true })); }
          }
        } else if (element.multiple) {
          for (const option of element.options) option.selected = row.selected.includes(option.value);
          element.dispatchEvent(new view.Event('change', { bubbles: true }));
        } else {
          const proto = element instanceof view.HTMLSelectElement ? view.HTMLSelectElement.prototype : element instanceof view.HTMLTextAreaElement ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, row.value);
          element.dispatchEvent(new view.Event('input', { bubbles: true })); element.dispatchEvent(new view.Event('change', { bubbles: true }));
        }
      }
    };
    const elements = () => [...form.querySelectorAll('input[name],select[name],textarea[name]')];
    apply(elements().filter(e => e.name === brand));
    const wantedModels = snapshot.filter(r => r.name === model && r.checked);
    for (let i = 0; i < 30 && wantedModels.some(r => !elements().some(e => key(e) === r.key)); i++) await wait(100);
    apply(elements().filter(e => e.name !== brand));
    for (const row of snapshot.filter(r => r.checked && [brand, model].includes(r.name))) {
      if (!elements().some(e => key(e) === row.key && e.checked)) throw new Error('A korábbi márka vagy típus visszaállítása nem sikerült.');
    }
  }
  globalThis.HAAIFormState = { capture, restore };
})();
