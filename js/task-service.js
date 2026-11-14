(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { parseISODate, toISODate } = root.dateUtils;
  const PRIORITIES = Object.freeze(["low", "normal", "urgent"]);

  function makeId(prefix = "task") {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function groupKey(date) {
    return date ?? "__inbox__";
  }

  function getGroupTasks(tasks, date) {
    const key = groupKey(date);
    return tasks
      .filter((task) => groupKey(task.date) === key)
      .sort((first, second) => first.order - second.order || first.createdAt.localeCompare(second.createdAt));
  }

  function nextOrder(tasks, date) {
    const group = getGroupTasks(tasks, date);
    return group.length === 0 ? 0 : Math.max(...group.map(({ order }) => order)) + 1;
  }

  function validateTaskInput(input, today = new Date(), options = {}) {
    const errors = {};
    const title = String(input.title ?? "").trim();
    const description = String(input.description ?? "");
    const date = input.date ? String(input.date) : null;
    const time = input.time ? String(input.time) : null;

    if (!title) errors.title = "Введите название задачи.";
    else if (title.length > 120) errors.title = "Название должно быть не длиннее 120 символов.";

    if (description.length > 1000) errors.description = "Описание должно быть не длиннее 1000 символов.";

    if (date) {
      const parsed = parseISODate(date);
      if (!parsed) errors.date = "Укажите корректную дату.";
      else if (date < toISODate(today) && !options.allowPastDate) errors.date = "Нельзя выбрать прошедшую дату.";
    }

    if (time && !date) errors.time = "Сначала выберите дату.";
    else if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = "Укажите корректное время.";

    if (input.priority && !PRIORITIES.includes(input.priority)) errors.priority = "Неизвестный приоритет.";

    return { valid: Object.keys(errors).length === 0, errors };
  }

  function normalizeInput(input) {
    const date = input.date || null;
    return {
      title: String(input.title ?? "").trim(),
      description: String(input.description ?? ""),
      date,
      time: date && input.time ? String(input.time) : null,
      priority: PRIORITIES.includes(input.priority) ? input.priority : "normal",
      categoryId: input.categoryId || null,
    };
  }

  function createTask(state, input, now = new Date()) {
    const validation = validateTaskInput(input, now);
    if (!validation.valid) return { state, task: null, errors: validation.errors };

    const normalized = normalizeInput(input);
    const timestamp = now.toISOString();
    const task = {
      id: makeId(),
      ...normalized,
      completed: false,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      originalDate: normalized.date,
      carryCount: 0,
      lastCarriedAt: null,
      order: nextOrder(state.tasks, normalized.date),
      seriesId: null,
      occurrenceDate: null,
    };

    return { state: { ...state, tasks: [...state.tasks, task] }, task, errors: {} };
  }

  function updateTask(state, taskId, input, now = new Date()) {
    const existing = state.tasks.find(({ id }) => id === taskId);
    if (!existing) return { state, task: null, errors: { form: "Задача не найдена." } };

    const validation = validateTaskInput(input, now, { allowPastDate: Boolean(existing.date && input.date === existing.date) });
    if (!validation.valid) return { state, task: existing, errors: validation.errors };

    const normalized = normalizeInput(input);
    const changedGroup = groupKey(existing.date) !== groupKey(normalized.date);
    const updated = {
      ...existing,
      ...normalized,
      originalDate: existing.originalDate ?? normalized.date,
      order: changedGroup ? nextOrder(state.tasks, normalized.date) : existing.order,
      updatedAt: now.toISOString(),
    };

    return {
      state: { ...state, tasks: state.tasks.map((task) => task.id === taskId ? updated : task) },
      task: updated,
      errors: {},
    };
  }

  function toggleTaskCompleted(state, taskId, now = new Date()) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task) return state;

    const completed = !task.completed;
    let date = task.date;
    let time = task.time;
    let order = task.order;
    let carryCount = task.carryCount;
    let lastCarriedAt = task.lastCarriedAt;
    if (!completed && date && date < toISODate(now)) {
      date = toISODate(now);
      time = null;
      const todayTasks = getGroupTasks(state.tasks.filter(({ id }) => id !== taskId), date);
      order = todayTasks.length ? Math.min(...todayTasks.map(({ order: value }) => value)) - 1 : 0;
      carryCount += 1;
      lastCarriedAt = now.toISOString();
    }

    return {
      ...state,
      tasks: state.tasks.map((item) => item.id === taskId ? {
        ...item,
        completed,
        completedAt: completed ? now.toISOString() : null,
        date,
        time,
        order,
        carryCount,
        lastCarriedAt,
        updatedAt: now.toISOString(),
      } : item),
    };
  }

  function moveTaskInGroup(state, taskId, direction) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task || ![-1, 1].includes(direction)) return state;
    const group = getGroupTasks(state.tasks, task.date);
    const index = group.findIndex(({ id }) => id === taskId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= group.length) return state;
    const target = group[targetIndex];
    return {
      ...state,
      tasks: state.tasks.map((item) => {
        if (item.id === task.id) return { ...item, order: target.order };
        if (item.id === target.id) return { ...item, order: task.order };
        return item;
      }),
    };
  }

  function moveTaskToDate(state, taskId, targetDate, now = new Date()) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task) return { state, task: null, errors: { form: "Задача не найдена." } };
    const date = targetDate || null;
    if (date) {
      const parsed = parseISODate(date);
      if (!parsed) return { state, task, errors: { date: "Укажите корректную дату." } };
      if (date < toISODate(now)) return { state, task, errors: { date: "Нельзя перенести задачу на прошедшую дату." } };
    }
    if (groupKey(task.date) === groupKey(date)) return { state, task, errors: {} };

    const updated = {
      ...task,
      date,
      time: date ? task.time : null,
      originalDate: task.originalDate ?? date,
      order: nextOrder(state.tasks.filter(({ id }) => id !== taskId), date),
      updatedAt: now.toISOString(),
    };
    return {
      state: { ...state, tasks: state.tasks.map((item) => item.id === taskId ? updated : item) },
      task: updated,
      errors: {},
    };
  }

  function reorderTask(state, taskId, targetTaskId = null) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task) return state;
    const group = getGroupTasks(state.tasks, task.date).filter(({ id }) => id !== taskId);
    let targetIndex = targetTaskId ? group.findIndex(({ id }) => id === targetTaskId) : group.length;
    if (targetIndex < 0) targetIndex = group.length;
    group.splice(targetIndex, 0, task);
    const orderById = new Map(group.map((item, index) => [item.id, index]));
    return {
      ...state,
      tasks: state.tasks.map((item) => orderById.has(item.id) ? { ...item, order: orderById.get(item.id) } : item),
    };
  }

  function filterTasks(tasks, filters) {
    const priorities = filters.priorities ?? new Set();
    const categories = filters.categories ?? new Set();
    return tasks.filter((task) => {
      if (filters.status === "active" && task.completed) return false;
      if (filters.status === "completed" && !task.completed) return false;
      if (priorities.size && !priorities.has(task.priority)) return false;
      const categoryValue = task.categoryId ?? "none";
      if (categories.size && !categories.has(categoryValue)) return false;
      if (filters.carried === "carried" && task.carryCount === 0) return false;
      if (filters.carried === "not-carried" && task.carryCount > 0) return false;
      return true;
    });
  }

  root.taskService = Object.freeze({
    createTask,
    filterTasks,
    getGroupTasks,
    moveTaskInGroup,
    moveTaskToDate,
    reorderTask,
    toggleTaskCompleted,
    updateTask,
    validateTaskInput,
  });
})();
