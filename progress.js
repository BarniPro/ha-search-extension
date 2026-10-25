(() => {
  if (globalThis.HAAILoadProgress) return;
  const MODES = ['advanced', 'home'];
  const MAX_SAMPLES = 8;
  const MIN_DURATION_MS = 500;
  const MAX_DURATION_MS = 180000;
  const DEFAULT_ESTIMATE_MS = 14000;

  function normalizeDurations(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => Number.isFinite(item) && item >= MIN_DURATION_MS && item <= MAX_DURATION_MS)
      .map(Math.round)
      .slice(-MAX_SAMPLES);
  }

  function normalizeHistory(value) {
    const history = {};
    for (const mode of MODES) history[mode] = normalizeDurations(value?.[mode]);
    return history;
  }

  function completedDuration(trace) {
    if (!trace || !Array.isArray(trace.events) || trace.events.some(event => event?.stage === 'error')) return null;
    const event = trace.events.find(item => item?.stage === 'results_visible');
    const duration = event?.elapsedMs;
    if (!Number.isFinite(duration) || duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) return null;
    return Math.round(duration);
  }

  function appendCompletedDuration(historyValue, trace) {
    const history = normalizeHistory(historyValue);
    const duration = completedDuration(trace);
    if (duration === null || !MODES.includes(trace.mode)) return history;
    history[trace.mode] = [...history[trace.mode], duration].slice(-MAX_SAMPLES);
    return history;
  }

  function estimateDuration(historyValue, mode, lastTrace) {
    const history = normalizeHistory(historyValue);
    let samples = MODES.includes(mode) ? history[mode] : [];
    if (!samples.length) samples = MODES.flatMap(key => history[key]);
    if (samples.length) return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
    const lastCompleted = completedDuration(lastTrace);
    return lastCompleted ?? DEFAULT_ESTIMATE_MS;
  }

  // Estimated progress reaches 90% around the recent average, then advances
  // gently to 96% if the current request takes longer. It never claims completion.
  function percent(elapsedMs, estimateMs) {
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    const estimate = Number.isFinite(estimateMs) && estimateMs > 0 ? estimateMs : DEFAULT_ESTIMATE_MS;
    const ratio = elapsed / estimate;
    if (ratio <= 1) return Math.round(ratio * 90);
    return Math.round(Math.min(96, 90 + (ratio - 1) * 3));
  }

  globalThis.HAAILoadProgress = {
    DEFAULT_ESTIMATE_MS,
    MAX_SAMPLES,
    normalizeDurations,
    normalizeHistory,
    completedDuration,
    appendCompletedDuration,
    estimateDuration,
    percent
  };
})();
