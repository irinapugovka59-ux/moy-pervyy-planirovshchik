import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/task-service.js";
import "../js/recurrence-service.js";
import "../js/calendar-service.js";

const root = globalThis.PlannerIra;
const { createInitialState } = root.state;
const tasks = root.taskService;
const calendar = root.calendarService;
const recurrence = root.recurrenceService;

function taskInput(overrides = {}) {
  return { title: "Задача", description: "", date: "2026-10-20", time: "09:30", priority: "normal", categoryId: null, ...overrides };
}

test("overdue active tasks move once to today in deterministic order", () => {
  const creation = new Date(2026, 9, 20, 10);
  let state = createInitialState(creation);
  const later = tasks.createTask(state, taskInput({ title: "Поздняя", date: "2026-10-24" }), creation); state = later.state;
  const earlier = tasks.createTask(state, taskInput({ title: "Ранняя", date: "2026-10-20" }), creation); state = earlier.state;
  const current = tasks.createTask(state, taskInput({ title: "Сегодня", date: "2026-10-25" }), creation); state = current.state;
  const now = new Date(2026, 9, 25, 12);
  const carried = calendar.carryOverdueTasks(state, now);
  assert.deepEqual(tasks.getGroupTasks(carried.tasks, "2026-10-25").map(({ title }) => title), ["Ранняя", "Поздняя", "Сегодня"]);
  for (const task of carried.tasks.filter(({ title }) => title !== "Сегодня")) {
    assert.equal(task.time, null);
    assert.equal(task.carryCount, 1);
    assert.equal(task.lastCarriedAt, now.toISOString());
  }
  assert.deepEqual(calendar.carryOverdueTasks(carried, now), carried);
});

test("completed and inbox tasks never auto-carry", () => {
  const creation = new Date(2026, 9, 20, 10);
  let state = createInitialState(creation);
  const completed = tasks.createTask(state, taskInput({ title: "Готово" }), creation); state = completed.state;
  state = tasks.toggleTaskCompleted(state, completed.task.id, creation);
  const inbox = tasks.createTask(state, taskInput({ title: "Идея", date: "", time: "" }), creation); state = inbox.state;
  const next = calendar.carryOverdueTasks(state, new Date(2026, 9, 25, 12));
  assert.equal(next.tasks.find(({ id }) => id === completed.task.id).date, "2026-10-20");
  assert.equal(next.tasks.find(({ id }) => id === inbox.task.id).date, null);
});

test("calendar transaction generates recurrence before carrying", () => {
  const start = new Date(2026, 0, 31, 9);
  let state = createInitialState(start);
  state = recurrence.createSeries(state, { ...taskInput({ date: "2026-01-31" }), recurrence: "monthly", endDate: "" }, "2026-01-31", start).state;
  const checked = calendar.runCalendarCheck(state, new Date(2026, 2, 1, 9), true);
  const february = checked.tasks.find(({ occurrenceDate }) => occurrenceDate === "2026-02-28");
  assert.ok(february);
  assert.equal(february.date, "2026-03-01");
  assert.equal(february.carryCount, 1);
  assert.equal(checked.lastCalendarCheck, "2026-03-01");
});
