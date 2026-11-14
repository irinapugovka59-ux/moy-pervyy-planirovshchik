(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { EMERGENCY_KEY_PREFIX, STORAGE_KEY } = root.config;
  const { createInitialState, validateState } = root.state;

  function makeRecoveryKey(now) {
    return `${EMERGENCY_KEY_PREFIX}:${now.toISOString().replaceAll(":", "-")}`;
  }

  function saveState(storage, state) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return { saved: true, error: null };
    } catch (error) {
      return {
        saved: false,
        error: "Не удалось сохранить изменения в браузере. Проверьте доступ к локальному хранилищу.",
        cause: error,
      };
    }
  }

  function loadState(storage, now = new Date()) {
    let serialized;
    try {
      serialized = storage.getItem(STORAGE_KEY);
    } catch (error) {
      return {
        state: createInitialState(now),
        warning: "Локальное хранилище браузера недоступно. Изменения не будут сохранены.",
        persistent: false,
        cause: error,
      };
    }

    if (serialized === null) {
      const state = createInitialState(now);
      const result = saveState(storage, state);
      return {
        state,
        warning: result.error,
        persistent: result.saved,
        cause: result.cause,
      };
    }

    try {
      const parsed = JSON.parse(serialized);
      const validation = validateState(parsed);
      if (validation.valid) {
        return { state: parsed, warning: null, persistent: true, cause: null };
      }
      throw new Error(validation.reason);
    } catch (error) {
      try {
        storage.setItem(makeRecoveryKey(now), serialized);
      } catch {
        // The primary recovery path remains the user-facing warning below.
      }

      const state = createInitialState(now);
      const saveResult = saveState(storage, state);
      const persistenceSuffix = saveResult.saved
        ? "Повреждённая строка сохранена отдельно, создано чистое состояние."
        : "Создано временное чистое состояние, но сохранить его не удалось.";

      return {
        state,
        warning: `Сохранённые данные повреждены. ${persistenceSuffix}`,
        persistent: saveResult.saved,
        cause: error,
      };
    }
  }

  root.storage = Object.freeze({ loadState, saveState });
})();
