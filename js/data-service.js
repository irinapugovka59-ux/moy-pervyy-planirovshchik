(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { BACKUP_MARKER, BACKUP_VERSION, EMERGENCY_KEY_PREFIX, STORAGE_KEY } = root.config;
  const { createInitialState, validateState } = root.state;

  function recoveryKey(now) {
    return `${EMERGENCY_KEY_PREFIX}:before-import:${now.toISOString().replaceAll(":", "-")}`;
  }

  function createBackup(state, now = new Date()) {
    const validation = validateState(state);
    if (!validation.valid) return { backup: null, error: validation.reason };
    return {
      backup: {
        marker: BACKUP_MARKER,
        formatVersion: BACKUP_VERSION,
        exportedAt: now.toISOString(),
        state,
      },
      error: null,
    };
  }

  function serializeBackup(state, now = new Date()) {
    const result = createBackup(state, now);
    return result.backup ? { text: JSON.stringify(result.backup, null, 2), error: null } : { text: null, error: result.error };
  }

  function parseBackup(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return { valid: false, error: "Файл не является корректным JSON.", state: null, summary: null }; }
    if (!parsed || parsed.marker !== BACKUP_MARKER) return { valid: false, error: "Это не резервная копия «Планировщика Иры».", state: null, summary: null };
    if (parsed.formatVersion !== BACKUP_VERSION) return { valid: false, error: "Версия резервной копии не поддерживается.", state: null, summary: null };
    const validation = validateState(parsed.state);
    if (!validation.valid) return { valid: false, error: validation.reason, state: null, summary: null };
    return {
      valid: true,
      error: null,
      state: parsed.state,
      summary: { tasks: parsed.state.tasks.length, trash: parsed.state.trash.length, categories: parsed.state.categories.length, series: parsed.state.series.length },
    };
  }

  function importBackup(storage, text, now = new Date()) {
    const parsed = parseBackup(text);
    if (!parsed.valid) return { ...parsed, imported: false };
    let current = null;
    try { current = storage.getItem(STORAGE_KEY); } catch (error) {
      return { imported: false, error: "Не удалось прочитать текущее локальное состояние.", cause: error, state: null, summary: parsed.summary };
    }
    try {
      if (current !== null) storage.setItem(recoveryKey(now), current);
      storage.setItem(STORAGE_KEY, JSON.stringify(parsed.state));
      return { imported: true, error: null, state: parsed.state, summary: parsed.summary };
    } catch (error) {
      return { imported: false, error: "Не удалось заменить данные. Текущее состояние не изменено или сохранено аварийной копией.", cause: error, state: null, summary: parsed.summary };
    }
  }

  function clearAllData(storage, now = new Date()) {
    const state = createInitialState(now);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return { cleared: true, state, error: null };
    } catch (error) {
      return { cleared: false, state: null, error: "Не удалось очистить данные в локальном хранилище.", cause: error };
    }
  }

  root.dataService = Object.freeze({ clearAllData, createBackup, importBackup, parseBackup, serializeBackup });
})();
