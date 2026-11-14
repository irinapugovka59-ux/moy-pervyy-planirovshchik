(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { toISODate } = root.dateUtils;
  const { generateOccurrences } = root.recurrenceService;

  function carryOverdueTasks(state, now = new Date()) {
    const today = toISODate(now);
    const overdue = state.tasks
      .filter((task) => !task.completed && task.date && task.date < today)
      .sort((first, second) => first.date.localeCompare(second.date) || first.order - second.order || first.createdAt.localeCompare(second.createdAt));
    if (!overdue.length) return state;
    const overdueIds = new Set(overdue.map(({ id }) => id));
    const orderById = new Map(overdue.map((task, index) => [task.id, index]));
    const todayTasks = state.tasks
      .filter((task) => !overdueIds.has(task.id) && task.date === today)
      .sort((first, second) => first.order - second.order || first.createdAt.localeCompare(second.createdAt));
    todayTasks.forEach((task, index) => orderById.set(task.id, overdue.length + index));
    const timestamp = now.toISOString();
    return {
      ...state,
      tasks: state.tasks.map((task) => {
        if (overdueIds.has(task.id)) return {
          ...task,
          date: today,
          time: null,
          order: orderById.get(task.id),
          carryCount: task.carryCount + 1,
          lastCarriedAt: timestamp,
          updatedAt: timestamp,
        };
        if (orderById.has(task.id)) return { ...task, order: orderById.get(task.id) };
        return task;
      }),
    };
  }

  function runCalendarCheck(state, now = new Date(), force = false) {
    const today = toISODate(now);
    if (!force && state.lastCalendarCheck === today) return state;
    let next = generateOccurrences(state, today, now);
    next = carryOverdueTasks(next, now);
    return { ...next, lastCalendarCheck: today };
  }

  root.calendarService = Object.freeze({ carryOverdueTasks, runCalendarCheck });
})();
