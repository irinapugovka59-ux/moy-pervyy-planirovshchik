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

  function isISODateOrNull(value) {
    return value === null || (typeof value === "string" && Boolean(root.dateUtils.parseISODate(value)));
  }

  function isISODateTimeOrNull(value) {
    return value === null || (typeof value === "string" && !Number.isNaN(new Date(value).getTime()));
  }

  function isTimeOrNull(value) {
    return value === null || (typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
  }

  function isValidTask(task) {
    return (
      isPlainObject(task) &&
      typeof task.id === "string" && task.id.length > 0 &&
      typeof task.title === "string" && task.title.trim().length > 0 && task.title.length <= 120 &&
      typeof task.description === "string" && task.description.length <= 1000 &&
      isISODateOrNull(task.date) &&
      isTimeOrNull(task.time) && (!task.time || Boolean(task.date)) &&
      ["low", "normal", "urgent"].includes(task.priority) &&
      isNullableString(task.categoryId) &&
      typeof task.completed === "boolean" &&
      isISODateTimeOrNull(task.completedAt) && (task.completed ? Boolean(task.completedAt) : task.completedAt === null) &&
      typeof task.createdAt === "string" && !Number.isNaN(new Date(task.createdAt).getTime()) &&
      typeof task.updatedAt === "string" && !Number.isNaN(new Date(task.updatedAt).getTime()) &&
      isISODateOrNull(task.originalDate) &&
      Number.isInteger(task.carryCount) && task.carryCount >= 0 &&
      isISODateTimeOrNull(task.lastCarriedAt) &&
      Number.isFinite(task.order) &&
      isNullableString(task.seriesId) &&
      isISODateOrNull(task.occurrenceDate) &&
      ((task.seriesId === null && task.occurrenceDate === null) || (typeof task.seriesId === "string" && Boolean(task.occurrenceDate)))
    );
  }

  function isValidDeletedTask(task) {
    return isValidTask(task) &&
      typeof task.deletedAt === "string" && !Number.isNaN(new Date(task.deletedAt).getTime()) &&
      isISODateOrNull(task.previousDate) &&
      Number.isFinite(task.previousOrder);
  }

  function isValidSeries(series) {
    return (
      isPlainObject(series) &&
      typeof series.id === "string" && series.id.length > 0 &&
      ["monthly", "yearly"].includes(series.type) &&
      typeof series.startDate === "string" && Boolean(root.dateUtils.parseISODate(series.startDate)) &&
      isNullableString(series.endDate) && (!series.endDate || Boolean(root.dateUtils.parseISODate(series.endDate))) &&
      isNullableString(series.cutoffDate) && (!series.cutoffDate || Boolean(root.dateUtils.parseISODate(series.cutoffDate))) &&
      Number.isInteger(series.anchorDay) && series.anchorDay >= 1 && series.anchorDay <= 31 &&
      Number.isInteger(series.anchorMonth) && series.anchorMonth >= 1 && series.anchorMonth <= 12 &&
      isPlainObject(series.template) &&
      typeof series.template.title === "string" && series.template.title.trim().length > 0 && series.template.title.length <= 120 &&
      typeof series.template.description === "string" && series.template.description.length <= 1000 &&
      isTimeOrNull(series.template.time) &&
      ["low", "normal", "urgent"].includes(series.template.priority) &&
      isNullableString(series.template.categoryId) &&
      typeof series.createdAt === "string" && !Number.isNaN(new Date(series.createdAt).getTime()) &&
      typeof series.updatedAt === "string" && !Number.isNaN(new Date(series.updatedAt).getTime()) &&
      (!series.endDate || series.endDate >= series.startDate)
    );
  }

  function isValidSeriesException(exception) {
    return isPlainObject(exception) &&
      typeof exception.id === "string" && exception.id.length > 0 &&
      typeof exception.seriesId === "string" && exception.seriesId.length > 0 &&
      typeof exception.occurrenceDate === "string" && Boolean(root.dateUtils.parseISODate(exception.occurrenceDate)) &&
      typeof exception.createdAt === "string" && !Number.isNaN(new Date(exception.createdAt).getTime());
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

    if (typeof value.lastCalendarCheck !== "string" || !root.dateUtils.parseISODate(value.lastCalendarCheck)) {
      return { valid: false, reason: "Дата последней проверки отсутствует." };
    }

    if (!value.categories.every(isValidCategory)) {
      return { valid: false, reason: "Одна или несколько категорий повреждены." };
    }

    if (!value.tasks.every(isValidTask)) {
      return { valid: false, reason: "Одна или несколько задач повреждены." };
    }

    if (!value.trash.every(isValidDeletedTask)) {
      return { valid: false, reason: "Одна или несколько задач в корзине повреждены." };
    }

    if (!value.series.every(isValidSeries) || !value.seriesExceptions.every(isValidSeriesException)) {
      return { valid: false, reason: "Данные повторяющихся задач повреждены." };
    }

    const allTasks = [...value.tasks, ...value.trash];
    const taskIds = new Set(allTasks.map(({ id }) => id));
    if (taskIds.size !== allTasks.length) {
      return { valid: false, reason: "Обнаружены повторяющиеся задачи." };
    }

    const categoryIds = new Set(value.categories.map(({ id }) => id));
    if (categoryIds.size !== value.categories.length) {
      return { valid: false, reason: "Обнаружены повторяющиеся категории." };
    }

    const seriesIds = new Set(value.series.map(({ id }) => id));
    if (seriesIds.size !== value.series.length) {
      return { valid: false, reason: "Обнаружены повторяющиеся серии." };
    }

    if (allTasks.some((task) => task.categoryId && !categoryIds.has(task.categoryId))) {
      return { valid: false, reason: "Задача ссылается на отсутствующую категорию." };
    }
    if (allTasks.some((task) => task.seriesId && !seriesIds.has(task.seriesId))) {
      return { valid: false, reason: "Задача ссылается на отсутствующую серию." };
    }
    if (value.series.some((series) => series.template.categoryId && !categoryIds.has(series.template.categoryId))) {
      return { valid: false, reason: "Серия ссылается на отсутствующую категорию." };
    }
    if (value.seriesExceptions.some((exception) => !seriesIds.has(exception.seriesId))) {
      return { valid: false, reason: "Исключение ссылается на отсутствующую серию." };
    }

    const exceptionKeys = value.seriesExceptions.map(({ seriesId, occurrenceDate }) => `${seriesId}:${occurrenceDate}`);
    if (new Set(exceptionKeys).size !== exceptionKeys.length) {
      return { valid: false, reason: "Обнаружены повторяющиеся исключения серии." };
    }

    const occurrenceKeys = new Set();
    for (const task of allTasks) {
      if (!task.seriesId || !task.occurrenceDate) continue;
      const key = `${task.seriesId}:${task.occurrenceDate}`;
      if (occurrenceKeys.has(key)) return { valid: false, reason: "Обнаружены дубли экземпляров серии." };
      occurrenceKeys.add(key);
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
