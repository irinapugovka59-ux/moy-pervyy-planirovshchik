(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { daysBetween, parseISODate, startOfDay, toISODate } = root.dateUtils;
  const { carryOverdueTasks } = root.calendarService;

  function toDeletedRecord(task, now) {
    return { ...task, deletedAt: now.toISOString(), previousDate: task.date, previousOrder: task.order };
  }

  function deleteTask(state, taskId, now = new Date()) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task) return state;
    return {
      ...state,
      tasks: state.tasks.filter(({ id }) => id !== taskId),
      trash: [...state.trash, toDeletedRecord(task, now)],
    };
  }

  function activeTaskFromDeleted(record) {
    const { deletedAt, previousDate, previousOrder, ...task } = record;
    return { ...task, date: previousDate, order: previousOrder };
  }

  function restoreTask(state, taskId, now = new Date()) {
    const record = state.trash.find(({ id }) => id === taskId);
    if (!record) return state;
    const task = activeTaskFromDeleted(record);
    let next = {
      ...state,
      trash: state.trash.filter(({ id }) => id !== taskId),
      tasks: [...state.tasks, task],
      seriesExceptions: task.seriesId && task.occurrenceDate
        ? state.seriesExceptions.filter((item) => item.seriesId !== task.seriesId || item.occurrenceDate !== task.occurrenceDate)
        : state.seriesExceptions,
    };
    if (!task.completed && task.date && task.date < toISODate(now)) next = carryOverdueTasks(next, now);
    return next;
  }

  function permanentlyDeleteTask(state, taskId) {
    return { ...state, trash: state.trash.filter(({ id }) => id !== taskId) };
  }

  function clearTrash(state) {
    return state.trash.length ? { ...state, trash: [] } : state;
  }

  function purgeExpiredTrash(state, now = new Date()) {
    const today = startOfDay(now);
    const trash = state.trash.filter((record) => {
      const deleted = new Date(record.deletedAt);
      if (Number.isNaN(deleted.getTime())) return false;
      return daysBetween(startOfDay(deleted), today) <= 30;
    });
    return trash.length === state.trash.length ? state : { ...state, trash };
  }

  root.trashService = Object.freeze({
    clearTrash,
    deleteTask,
    permanentlyDeleteTask,
    purgeExpiredTrash,
    restoreTask,
    toDeletedRecord,
  });
})();
