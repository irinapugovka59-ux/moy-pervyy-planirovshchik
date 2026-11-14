(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { DEFAULT_CATEGORIES, SCHEMA_VERSION } = root.config;
  const { toISODate } = root.dateUtils;

  function createInitialState(now = new Date()) {
    const timestamp = now.toISOString();
    return {
      version: SCHEMA_VERSION,
      tasks: [],
      trash: [],
      categories: DEFAULT_CATEGORIES.map((category) => ({
        ...category,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      series: [],
      seriesExceptions: [],
      settings: {
        inboxCollapsed: false,
      },
      lastCalendarCheck: toISODate(now),
    };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isValidCategory(category) {
    return (
      isPlainObject(category) &&
      typeof category.id === "string" &&
      category.id.length > 0 &&
      typeof category.name === "string" &&
      category.name.trim().length > 0 &&
      typeof category.color === "string" &&
      typeof category.createdAt === "string" &&
      typeof category.updatedAt === "string"
    );
  }

  function isNullableString(value) {
    return value === null || typeof value === "string";
  }

  function isValidTask(task) {
    return (
      isPlainObject(task) &&
      typeof task.id === "string" && task.id.length > 0 &&
      typeof task.title === "string" && task.title.trim().length > 0 && task.title.length <= 120 &&
      typeof task.description === "string" && task.description.length <= 1000 &&
      isNullableString(task.date) &&
      isNullableString(task.time) &&
      ["low", "normal", "urgent"].includes(task.priority) &&
      isNullableString(task.categoryId) &&
      typeof task.completed === "boolean" &&
      isNullableString(task.completedAt) &&
      typeof task.createdAt === "string" &&
      typeof task.updatedAt === "string" &&
      isNullableString(task.originalDate) &&
      Number.isInteger(task.carryCount) && task.carryCount >= 0 &&
      isNullableString(task.lastCarriedAt) &&
      Number.isFinite(task.order) &&
      isNullableString(task.seriesId) &&
      isNullableString(task.occurrenceDate)
    );
  }

  function validateState(value) {
    if (!isPlainObject(value) || value.version !== SCHEMA_VERSION) {
      return { valid: false, reason: "Неподдерживаемая или отсутствующая версия данных." };
    }

    const arrayFields = ["tasks", "trash", "categories", "series", "seriesExceptions"];
    for (const field of arrayFields) {
      if (!Array.isArray(value[field])) {
        return { valid: false, reason: `Поле «${field}» должно быть списком.` };
      }
    }

    if (!isPlainObject(value.settings) || typeof value.settings.inboxCollapsed !== "boolean") {
      return { valid: false, reason: "Настройки приложения повреждены." };
    }

    if (typeof value.lastCalendarCheck !== "string") {
      return { valid: false, reason: "Дата последней проверки отсутствует." };
    }

    if (!value.categories.every(isValidCategory)) {
      return { valid: false, reason: "Одна или несколько категорий повреждены." };
    }

    if (!value.tasks.every(isValidTask)) {
      return { valid: false, reason: "Одна или несколько задач повреждены." };
    }

    const taskIds = new Set(value.tasks.map(({ id }) => id));
    if (taskIds.size !== value.tasks.length) {
      return { valid: false, reason: "Обнаружены повторяющиеся задачи." };
    }

    const categoryIds = new Set(value.categories.map(({ id }) => id));
    if (categoryIds.size !== value.categories.length) {
      return { valid: false, reason: "Обнаружены повторяющиеся категории." };
    }

    return { valid: true, reason: null };
  }

  function updateInboxCollapsed(state, inboxCollapsed) {
    return {
      ...state,
      settings: {
        ...state.settings,
        inboxCollapsed,
      },
    };
  }

  root.state = Object.freeze({ createInitialState, updateInboxCollapsed, validateState });
})();
