import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/task-service.js";

const { createInitialState } = globalThis.PlannerIra.state;
const service = globalThis.PlannerIra.taskService;
const now = new Date(2026, 9, 25, 12, 0, 0);

function add(state, overrides = {}) {
  return service.createTask(state, {
    title: "Задача",
    description: "Описание",
    date: "2026-10-25",
    time: "14:30",
    priority: "normal",
    categoryId: null,
    ...overrides,
  }, now);
}

test("task validation covers required fields, lengths, dates and time", () => {
  assert.equal(service.validateTaskInput({ title: "", date: "" }, now).valid, false);
  assert.match(service.validateTaskInput({ title: "x".repeat(121) }, now).errors.title, /120/);
  assert.match(service.validateTaskInput({ title: "ok", description: "x".repeat(1001) }, now).errors.description, /1000/);
  assert.match(service.validateTaskInput({ title: "ok", date: "2026-10-24" }, now).errors.date, /прошедшую/);
  assert.match(service.validateTaskInput({ title: "ok", time: "14:30" }, now).errors.time, /дату/);
  assert.equal(service.validateTaskInput({ title: "ok", date: "2026-10-25", time: "23:59" }, now).valid, true);
});

test("dated and inbox tasks receive complete model and independent order", () => {
  let state = createInitialState(now);
  const dated = add(state);
  state = dated.state;
  const inbox = add(state, { title: "Идея", date: "", time: "" });
  assert.equal(dated.task.originalDate, "2026-10-25");
  assert.equal(dated.task.completed, false);
  assert.equal(inbox.task.date, null);
  assert.equal(inbox.task.originalDate, null);
  assert.equal(inbox.task.time, null);
  assert.equal(dated.task.order, 0);
  assert.equal(inbox.task.order, 0);
});

test("editing changes group, clears time for inbox and keeps original date", () => {
  const created = add(createInitialState(now));
  const updated = service.updateTask(created.state, created.task.id, {
    title: "Задача изменена", description: "", date: "", time: "", priority: "urgent", categoryId: null,
  }, now);
  assert.equal(updated.task.date, null);
  assert.equal(updated.task.time, null);
  assert.equal(updated.task.originalDate, "2026-10-25");
  assert.equal(updated.task.priority, "urgent");
});

test("completion stores timestamp and keeps manual position", () => {
  const created = add(createInitialState(now));
  const completed = service.toggleTaskCompleted(created.state, created.task.id, now);
  const task = completed.tasks[0];
  assert.equal(task.completed, true);
  assert.equal(task.completedAt, now.toISOString());
  assert.equal(task.order, created.task.order);
  const reopened = service.toggleTaskCompleted(completed, task.id, now);
  assert.equal(reopened.tasks[0].completed, false);
  assert.equal(reopened.tasks[0].completedAt, null);
});

test("manual order swaps only tasks in the same group", () => {
  let state = createInitialState(now);
  const first = add(state, { title: "Первая" }); state = first.state;
  const second = add(state, { title: "Вторая" }); state = second.state;
  const inbox = add(state, { title: "Входящая", date: "", time: "" }); state = inbox.state;
  state = service.moveTaskInGroup(state, second.task.id, -1);
  assert.deepEqual(service.getGroupTasks(state.tasks, "2026-10-25").map(({ title }) => title), ["Вторая", "Первая"]);
  assert.equal(service.getGroupTasks(state.tasks, null)[0].id, inbox.task.id);
});

test("moving between dates preserves time and crosses month and year boundaries", () => {
  const created = add(createInitialState(now), { date: "2026-12-31", time: "09:15" });
  const moved = service.moveTaskToDate(created.state, created.task.id, "2027-01-01", now);
  assert.equal(moved.task.date, "2027-01-01");
  assert.equal(moved.task.time, "09:15");
  assert.equal(moved.task.originalDate, "2026-12-31");
});

test("moving to inbox clears time and moving back sets the first assigned original date", () => {
  let created = add(createInitialState(now), { date: "", time: "" });
  let moved = service.moveTaskToDate(created.state, created.task.id, "2026-11-01", now);
  assert.equal(moved.task.originalDate, "2026-11-01");
  moved = service.moveTaskToDate(moved.state, moved.task.id, null, now);
  assert.equal(moved.task.date, null);
  assert.equal(moved.task.time, null);
  assert.equal(moved.task.originalDate, "2026-11-01");
});

test("moving to a past or invalid date is rejected without changing state", () => {
  const created = add(createInitialState(now));
  const past = service.moveTaskToDate(created.state, created.task.id, "2026-10-24", now);
  const invalid = service.moveTaskToDate(created.state, created.task.id, "2026-02-30", now);
  assert.match(past.errors.date, /прошедшую/);
  assert.match(invalid.errors.date, /корректную/);
  assert.equal(past.state, created.state);
});

test("drag-style reorder places a task before the target and supports list end", () => {
  let state = createInitialState(now);
  const first = add(state, { title: "A" }); state = first.state;
  const second = add(state, { title: "B" }); state = second.state;
  const third = add(state, { title: "C" }); state = third.state;
  state = service.reorderTask(state, third.task.id, first.task.id);
  assert.deepEqual(service.getGroupTasks(state.tasks, "2026-10-25").map(({ title }) => title), ["C", "A", "B"]);
  state = service.reorderTask(state, third.task.id, null);
  assert.deepEqual(service.getGroupTasks(state.tasks, "2026-10-25").map(({ title }) => title), ["A", "B", "C"]);
});

test("filters combine groups with AND and values with OR", () => {
  let state = createInitialState(now);
  const first = add(state, { title: "Личная", priority: "urgent", categoryId: "category-personal" }); state = first.state;
  const second = add(state, { title: "Рабочая", priority: "low", categoryId: "category-work" }); state = second.state;
  state = service.toggleTaskCompleted(state, second.task.id, now);
  const result = service.filterTasks(state.tasks, {
    status: "active",
    priorities: new Set(["normal", "urgent"]),
    categories: new Set(["category-personal", "category-work"]),
    carried: "not-carried",
  });
  assert.deepEqual(result.map(({ id }) => id), [first.task.id]);
});
