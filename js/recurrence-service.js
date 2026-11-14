(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { addDays, parseISODate, toISODate } = root.dateUtils;
  const { getGroupTasks, validateTaskInput } = root.taskService;
  const TYPES = Object.freeze(["monthly", "yearly"]);

  function makeId(prefix) {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function plannedDate(series, step) {
    const start = parseISODate(series.startDate);
    if (!start) return null;
    if (series.type === "monthly") {
      const monthIndex = start.getMonth() + step;
      const year = start.getFullYear() + Math.floor(monthIndex / 12);
      const month = ((monthIndex % 12) + 12) % 12;
      return toISODate(new Date(year, month, Math.min(series.anchorDay, daysInMonth(year, month))));
    }
    const year = start.getFullYear() + step;
    const month = series.anchorMonth - 1;
    return toISODate(new Date(year, month, Math.min(series.anchorDay, daysInMonth(year, month))));
  }

  function occurrenceDates(series, throughDate) {
    if (!parseISODate(throughDate) || throughDate < series.startDate) return [];
    const dates = [];
    for (let step = 0; step < 2400; step += 1) {
      const date = plannedDate(series, step);
      if (!date || date > throughDate) break;
      if (series.endDate && date > series.endDate) break;
      if (series.cutoffDate && date >= series.cutoffDate) break;
      dates.push(date);
    }
    return dates;
  }

  function validateSeriesInput(input, now = new Date()) {
    const errors = { ...validateTaskInput(input, now).errors };
    if (!input.date) errors.date = "Для повторяющейся задачи укажите дату начала.";
    if (!TYPES.includes(input.recurrence)) errors.recurrence = "Выберите тип повторения.";
    if (input.endDate) {
      if (!parseISODate(input.endDate)) errors.endDate = "Укажите корректную дату окончания.";
      else if (input.date && input.endDate < input.date) errors.endDate = "Дата окончания не может быть раньше начала.";
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function templateFromInput(input) {
    return {
      title: String(input.title ?? "").trim(),
      description: String(input.description ?? ""),
      time: input.time || null,
      priority: ["low", "normal", "urgent"].includes(input.priority) ? input.priority : "normal",
      categoryId: input.categoryId || null,
    };
  }

  function buildSeries(input, now = new Date()) {
    const start = parseISODate(input.date);
    return {
      id: makeId("series"),
      type: input.recurrence,
      startDate: input.date,
      endDate: input.endDate || null,
      cutoffDate: null,
      anchorDay: start.getDate(),
      anchorMonth: start.getMonth() + 1,
      template: templateFromInput(input),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  function makeOccurrence(series, date, tasks, now) {
    return {
      id: makeId("task"),
      ...series.template,
      date,
      completed: false,
      completedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      originalDate: date,
      carryCount: 0,
      lastCarriedAt: null,
      order: getGroupTasks(tasks, date).length,
      seriesId: series.id,
      occurrenceDate: date,
    };
  }

  function generateOccurrences(state, throughDate, now = new Date()) {
    if (!parseISODate(throughDate)) return state;
    const existing = new Set(state.tasks
      .filter(({ seriesId, occurrenceDate }) => seriesId && occurrenceDate)
      .map(({ seriesId, occurrenceDate }) => `${seriesId}:${occurrenceDate}`));
    const excluded = new Set(state.seriesExceptions.map(({ seriesId, occurrenceDate }) => `${seriesId}:${occurrenceDate}`));
    const tasks = [...state.tasks];
    for (const series of state.series) {
      for (const date of occurrenceDates(series, throughDate)) {
        const key = `${series.id}:${date}`;
        if (existing.has(key) || excluded.has(key)) continue;
        tasks.push(makeOccurrence(series, date, tasks, now));
        existing.add(key);
      }
    }
    return tasks.length === state.tasks.length ? state : { ...state, tasks };
  }

  function createSeries(state, input, throughDate = input.date, now = new Date()) {
    const validation = validateSeriesInput(input, now);
    if (!validation.valid) return { state, series: null, errors: validation.errors };
    const series = buildSeries(input, now);
    const next = generateOccurrences({ ...state, series: [...state.series, series] }, throughDate, now);
    return { state: next, series, errors: {} };
  }

  function updateOccurrenceOnly(state, taskId, input, now = new Date()) {
    return root.taskService.updateTask(state, taskId, input, now);
  }

  function updateSeriesFromOccurrence(state, taskId, input, throughDate, now = new Date()) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task?.seriesId || !task.occurrenceDate) return { state, series: null, errors: { form: "Экземпляр серии не найден." } };
    const validation = validateSeriesInput(input, now);
    if (!validation.valid) return { state, series: null, errors: validation.errors };
    const oldSeries = state.series.find(({ id }) => id === task.seriesId);
    if (!oldSeries) return { state, series: null, errors: { form: "Серия не найдена." } };
    const boundary = task.occurrenceDate;
    const stoppedSeries = { ...oldSeries, cutoffDate: boundary, updatedAt: now.toISOString() };
    const newSeries = buildSeries(input, now);
    const keptTasks = state.tasks.filter((item) => item.seriesId !== oldSeries.id || !item.occurrenceDate || item.occurrenceDate < boundary);
    const keptExceptions = state.seriesExceptions.filter((item) => item.seriesId !== oldSeries.id || item.occurrenceDate < boundary);
    const base = {
      ...state,
      tasks: keptTasks,
      series: state.series.map((item) => item.id === oldSeries.id ? stoppedSeries : item).concat(newSeries),
      seriesExceptions: keptExceptions,
    };
    return { state: generateOccurrences(base, throughDate, now), series: newSeries, errors: {} };
  }

  function deletedRecord(task, now) {
    return { ...task, deletedAt: now.toISOString(), previousDate: task.date, previousOrder: task.order };
  }

  function deleteRecurring(state, taskId, scope, now = new Date()) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task?.seriesId || !task.occurrenceDate) return state;
    if (scope === "only") {
      const exception = { id: makeId("exception"), seriesId: task.seriesId, occurrenceDate: task.occurrenceDate, createdAt: now.toISOString() };
      return {
        ...state,
        tasks: state.tasks.filter(({ id }) => id !== taskId),
        trash: [...state.trash, deletedRecord(task, now)],
        seriesExceptions: [...state.seriesExceptions, exception],
      };
    }
    if (scope !== "following") return state;
    const affected = state.tasks.filter((item) => item.seriesId === task.seriesId && item.occurrenceDate >= task.occurrenceDate);
    const affectedIds = new Set(affected.map(({ id }) => id));
    return {
      ...state,
      tasks: state.tasks.filter(({ id }) => !affectedIds.has(id)),
      trash: [...state.trash, ...affected.map((item) => deletedRecord(item, now))],
      series: state.series.map((series) => series.id === task.seriesId
        ? { ...series, cutoffDate: task.occurrenceDate, updatedAt: now.toISOString() }
        : series),
    };
  }

  root.recurrenceService = Object.freeze({
    createSeries,
    deleteRecurring,
    generateOccurrences,
    occurrenceDates,
    plannedDate,
    updateOccurrenceOnly,
    updateSeriesFromOccurrence,
    validateSeriesInput,
  });
})();
