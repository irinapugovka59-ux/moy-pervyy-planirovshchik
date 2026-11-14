import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/task-service.js";
import "../js/recurrence-service.js";
import "../js/calendar-service.js";
import "../js/trash-service.js";

const root = globalThis.PlannerIra;
const { createInitialState } = root.state;
const tasks = root.taskService;
const trash = root.trashService;

function add(state, date, now, title = "Задача") {
  return tasks.createTask(state, { title, description: "", date, time: date ? "12:00" : "", priority: "normal", categoryId: null }, now);
}

test("delete and restore preserve a valid task", () => {
  const now = new Date(2026, 10, 14, 12);
  const created = add(createInitialState(now), "2026-11-14", now);
  const deleted = trash.deleteTask(created.state, created.task.id, now);
  assert.equal(deleted.tasks.length, 0);
  assert.equal(deleted.trash[0].previousDate, "2026-11-14");
  const restored = trash.restoreTask(deleted, created.task.id, now);
  assert.equal(restored.trash.length, 0);
  assert.equal(restored.tasks[0].date, "2026-11-14");
});

test("restoring an active overdue task carries it, completed task stays in history", () => {
  const old = new Date(2026, 10, 1, 10);
  const now = new Date(2026, 10, 14, 12);
  let state = createInitialState(old);
  const active = add(state, "2026-11-01", old, "Активная"); state = active.state;
  const done = add(state, "2026-11-01", old, "Готовая"); state = done.state;
  state = tasks.toggleTaskCompleted(state, done.task.id, old);
  state = trash.deleteTask(state, active.task.id, old);
  state = trash.deleteTask(state, done.task.id, old);
  state = trash.restoreTask(state, active.task.id, now);
  state = trash.restoreTask(state, done.task.id, now);
  assert.equal(state.tasks.find(({ id }) => id === active.task.id).date, "2026-11-14");
  assert.equal(state.tasks.find(({ id }) => id === active.task.id).carryCount, 1);
  assert.equal(state.tasks.find(({ id }) => id === done.task.id).date, "2026-11-01");
  assert.equal(state.tasks.find(({ id }) => id === done.task.id).completed, true);
});

test("permanent delete and clear trash remove only deleted records", () => {
  const now = new Date(2026, 10, 14);
  let state = createInitialState(now);
  const first = add(state, "2026-11-14", now, "A"); state = first.state;
  const second = add(state, "2026-11-14", now, "B"); state = second.state;
  state = trash.deleteTask(state, first.task.id, now);
  state = trash.deleteTask(state, second.task.id, now);
  state = trash.permanentlyDeleteTask(state, first.task.id);
  assert.deepEqual(state.trash.map(({ id }) => id), [second.task.id]);
  assert.equal(trash.clearTrash(state).trash.length, 0);
});

test("startup purge keeps age 29 and 30, removes older than 30 days", () => {
  const now = new Date(2026, 10, 14, 12);
  const base = createInitialState(now);
  const record = (id, day) => ({
    id, title: id, description: "", date: "2026-10-01", time: null, priority: "normal", categoryId: null,
    completed: false, completedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), originalDate: "2026-10-01",
    carryCount: 0, lastCarriedAt: null, order: 0, seriesId: null, occurrenceDate: null,
    deletedAt: new Date(2026, 10, 14 - day, 12).toISOString(), previousDate: "2026-10-01", previousOrder: 0,
  });
  const state = { ...base, trash: [record("age-29", 29), record("age-30", 30), record("age-31", 31)] };
  assert.deepEqual(trash.purgeExpiredTrash(state, now).trash.map(({ id }) => id), ["age-29", "age-30"]);
});
