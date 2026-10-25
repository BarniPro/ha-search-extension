(() => {
  const form = () => document.querySelector("#advanced-search-form");
  const submitButton = () => document.querySelector('button[type="submit"][form="advanced-search-form"][data-testid="listing-search-button"]');
  let applying = false;

  function show(message, error = false) {
    let node = document.querySelector("#haai-advanced-status");
    if (!node) {
      node = document.createElement("div"); node.id = "haai-advanced-status";
      node.setAttribute("role", "status"); node.setAttribute("aria-live", "polite");
      node.style.cssText = "padding:8px 0;margin:12px 0;color:#333;font:14px/1.5 Roboto,Arial,sans-serif";
      form()?.before(node);
    }
    node.textContent = message; node.style.color = error ? "#a42f12" : "#333";
  }

  function parentMessage(type, details = {}) {
    if (window.parent !== window) window.parent.postMessage({ type, ...details }, location.origin);
  }

  async function applyPlan(plan) {
    if (!form()) throw new Error("A részletes kereső nem töltődött be.");
    if (plan?.mode !== "A") throw new Error("Ez a részletes űrlap nem tudja alkalmazni a visszaadott keresési módot.");
    const filters = globalThis.HAAINativeAdapter.validateOperations(plan.filters);
    const omissions = globalThis.HAAINativeAdapter.omissions(plan.omissions);
    if (!filters.length) throw new Error("Nem találtam beállítható keresési feltételt.");
    const previous = globalThis.HAAIFormState.capture(form());
    try {
      show("A megadott feltételekkel módosítom a szűrőket…");
      await globalThis.HAAINativeAdapter.applyAdvanced(form(), filters);
      const submit = submitButton();
      if (!submit || submit.disabled) throw new Error("A keresés gombja nem elérhető.");
      // The result page only needs omissions. The query itself stays in memory
      // on the search page and is never placed in session storage or a URL.
      sessionStorage.setItem("haai-search-result-v2", JSON.stringify({ omissions }));
      show("A feltételek beállítva. A keresés indul…");
      submit.click();
    } catch (error) {
      try { await globalThis.HAAIFormState.restore(form(), previous); }
      catch (restoreError) { throw new Error(`A szűrők visszaállítása nem teljes: ${restoreError.message || restoreError}`); }
      throw new Error(`A keresés nem indult el, a korábbi szűrőket visszaállítottam. ${error.message || error}`);
    }
  }

  function waitForForm() {
    return new Promise((resolve, reject) => {
      const end = Date.now() + 15000;
      const poll = () => {
        if (form()) return resolve();
        if (Date.now() > end) return reject(new Error("A részletes kereső nem töltődött be időben."));
        setTimeout(poll, 100);
      };
      poll();
    });
  }

  window.addEventListener("message", async event => {
    if (event.source !== window.parent || window.parent === window || event.origin !== location.origin || event.data?.type !== "HAAI_APPLY_PLAN" || applying) return;
    applying = true;
    const plan = event.data.plan;
    const requestId = typeof plan?.request_id === "string" ? plan.request_id : "";
    try {
      await waitForForm();
      globalThis.HAAINativeAdapter.validateOperations(plan?.filters);
      globalThis.HAAINativeAdapter.omissions(plan?.omissions);
      parentMessage("HAAI_PLAN_ACCEPTED", { request_id: requestId });
      await applyPlan(plan);
    } catch (error) {
      show(error.message || String(error), true);
      parentMessage("HAAI_PLAN_FAILED", { request_id: requestId, error: String(error.message || error).slice(0, 400) });
    }
  });
})();
