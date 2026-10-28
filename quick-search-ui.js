(() => {
  // v3 full120, 2026-10-27: harnessElapsedMs median = 2368.5 ms.
  // This estimates the backend wait; native form loading can take longer.
  // Reach 80% around 1.6x the median, then slow to 95% and wait for the real result.
  const historicalLatencyMedianMs = 2368.5;
  const css = `
    :host,#quick-search-mount{display:block;width:100%;color:#333;font-family:Roboto,Helvetica,Arial,sans-serif}
    :host *,#quick-search-mount *{box-sizing:border-box}
    :host .panel,#quick-search-mount .panel{padding:8px 0 0}
    :host form,#quick-search-mount form{display:flex;align-items:stretch;gap:10px;margin:0}
    :host .field,#quick-search-mount .field{position:relative;display:block;flex:1;min-width:0}
    :host .field label,#quick-search-mount .field label{position:absolute;top:-7px;left:10px;padding:0 4px;background:#f8f8f8;font:600 12px/14px Roboto,Helvetica,Arial,sans-serif;color:#444;z-index:1}
    :host .query,#quick-search-mount .query{display:block;width:100%;height:46px;border:1px solid #c4c4c4;border-radius:4px;background:#fff;padding:0 14px;color:#333;font:16px Roboto,Helvetica,Arial,sans-serif;outline:none}
    :host .query::placeholder,#quick-search-mount .query::placeholder{color:#666;opacity:1}
    :host .query:hover,#quick-search-mount .query:hover{border-color:#555}
    :host .query:focus,#quick-search-mount .query:focus{border:2px solid #218fbd;padding-left:13px}
    :host button,#quick-search-mount button{font:500 16px/28px Roboto,Helvetica,Arial,sans-serif;cursor:pointer}
    :host .submit-wrap,#quick-search-mount .submit-wrap{display:flex;flex:0 0 138px;min-width:0}
    :host .submit,#quick-search-mount .submit{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:7px;width:100%;min-width:0;height:46px;padding:8px 16px;color:#fff;background:#ff4200;border:0;border-radius:4px;box-shadow:0 2px 4px rgba(0,0,0,.18)}
    :host .submit .icon,:host .submit .label,#quick-search-mount .submit .icon,#quick-search-mount .submit .label{position:relative;z-index:1}
    :host .submit .icon,#quick-search-mount .submit .icon{font:19px/1 Georgia,serif}
    :host .submit:hover,#quick-search-mount .submit:hover{background:#e63b00}
    :host .submit:disabled,#quick-search-mount .submit:disabled{opacity:.76;cursor:wait}
    :host .submit .progress,#quick-search-mount .submit .progress{position:absolute;left:0;right:0;bottom:0;height:4px;overflow:hidden;background:rgba(0,0,0,.14);pointer-events:none}
    :host .progress[hidden],#quick-search-mount .progress[hidden]{display:none!important}
    :host .progress-fill,#quick-search-mount .progress-fill{display:block;width:100%;height:100%;background:rgba(255,255,255,.9);transform:scaleX(.04);transform-origin:left;animation:haai-progress ${historicalLatencyMedianMs * 4}ms linear forwards}
    @keyframes haai-progress{0%{transform:scaleX(.04)}25%{transform:scaleX(.5)}40%{transform:scaleX(.8)}70%{transform:scaleX(.9)}100%{transform:scaleX(.95)}}
    :host .query:disabled,#quick-search-mount .query:disabled{background:#f4f4f4;color:#666;cursor:wait;opacity:.8}
    :host .helper,#quick-search-mount .helper{margin-top:6px;font-size:11px;line-height:1.5;color:#666}
    :host .help-button,#quick-search-mount .help-button{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;width:28px;height:28px;margin:-4px 0 -4px 2px;padding:0;border:0;border-radius:50%;background:transparent;color:#218fbd}
    :host .help-button:hover,#quick-search-mount .help-button:hover{background:#e6f3f8;color:#147aa4}
    :host .help-button:focus-visible,:host .help-close:focus-visible,#quick-search-mount .help-button:focus-visible,#quick-search-mount .help-close:focus-visible{outline:2px solid #218fbd;outline-offset:2px}
    :host .help-symbol,#quick-search-mount .help-symbol{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border:1.5px solid currentColor;border-radius:50%;font:bold 11px/1 Arial,sans-serif}
    :host .help-popup,#quick-search-mount .help-popup{position:fixed;inset:auto;margin:0;width:360px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:16px;background:#fff;color:#333;border:1px solid #d4d4d4;border-radius:4px;box-shadow:0 4px 18px rgba(0,0,0,.2);font:14px/1.5 Roboto,Helvetica,Arial,sans-serif}
    :host .help-top,#quick-search-mount .help-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
    :host .help-title,#quick-search-mount .help-title{margin:0;font-size:16px;font-weight:600}
    :host .help-close,#quick-search-mount .help-close{display:flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;margin:-5px -5px -5px 0;padding:0;border:0;border-radius:4px;background:transparent;color:#777;font:24px/1 Arial,sans-serif}
    :host .help-close:hover,#quick-search-mount .help-close:hover{background:#f1f1f1;color:#333}
    :host .help-popup p,#quick-search-mount .help-popup p{margin:0 0 10px}
    :host .help-popup p:last-child,#quick-search-mount .help-popup p:last-child{margin-bottom:0}
    :host .help-example,#quick-search-mount .help-example{padding:9px 11px;border-left:3px solid #218fbd;background:#f3f8fa}
    :host .help-example span,#quick-search-mount .help-example span{display:block;margin-bottom:3px;font-size:11px;color:#666}
    :host .help-example strong,#quick-search-mount .help-example strong{font-size:13px;font-weight:500}
    :host .help-note,#quick-search-mount .help-note{font-size:12px;color:#666}
    :host .help-disclaimer,#quick-search-mount .help-disclaimer{margin:11px 0 0!important;padding:9px 10px;border-left:3px solid #d58512;background:#fff8eb;color:#5c4b32;font-size:12px;line-height:1.5}
    :host .status,#quick-search-mount .status{margin:9px 0 6px;padding:7px 9px;border-left:3px solid #218fbd;background:#f3f8fa;color:#444;font-size:12px;line-height:1.45}
    :host .status:empty,#quick-search-mount .status:empty{display:none}
    :host .status.error,#quick-search-mount .status.error{border-left-color:#a42f12;background:#fff5f2;color:#a42f12}
    :host .status.ok,#quick-search-mount .status.ok{color:#326f32}
    :host .traditional,#quick-search-mount .traditional{margin-top:8px;font-size:15px}
    :host .chips,#quick-search-mount .chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
    :host .chips:empty,#quick-search-mount .chips:empty{display:none}
    :host .chip,#quick-search-mount .chip{display:inline-block;background:#fff;border:1px solid #d4d4d4;border-radius:3px;padding:3px 7px;font-size:11px;color:#444}
    @media(max-width:580px){:host form,#quick-search-mount form{gap:7px}:host .query,#quick-search-mount .query{font-size:14px}:host .submit-wrap,#quick-search-mount .submit-wrap{flex-basis:96px}:host .submit,#quick-search-mount .submit{font-size:14px;padding:7px 10px}}
    @media(prefers-reduced-motion:reduce){:host .progress-fill,#quick-search-mount .progress-fill{animation:none;transform:scaleX(.8);background:repeating-linear-gradient(135deg,rgba(255,255,255,.9) 0 6px,rgba(255,255,255,.45) 6px 12px)}}
  `;
  const examples = Object.freeze([
    "opel astra benzines 2m alatt",
    "vw golf 16tol 4mftig",
    "ford focus kombi 150e km alatt",
    "suzuki swift max 2,5m",
    "skoda octavia kombi 18tol",
    "vw passat dizel 5m alatt",
    "opel corsa benzines 2014tol",
    "toyota yaris hibrid 5m alatt",
    "bmw x3 automata 8mftig",
    "bmw 3-as sorozat 17tol"
  ]);
  globalThis.HAAIQuickSearchUI = Object.freeze({ css, examples });
})();
