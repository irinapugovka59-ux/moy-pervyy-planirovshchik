import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/task-service.js";
import "../js/category-service.js";

const { createInitialState } = globalThis.PlannerIra.state;
const tasks = globalThis.PlannerIra.taskService;
const categories = globalThis.PlannerIra.categoryService;
const now = new Date(2026, 9, 25, 12, 0, 0);

test("categories are created and sorted with Russian collation", () => {
  let state = createInitialState(now);
  const result = categories.createCategory(state, { name: "Авто", color: "#112233" }, now);
  assert.equal(result.errors.name, undefined);
  assert.deepEqual(categories.sortCategories(result.state.categories).map(({ name }) => name), ["Авто", "Личные", "Рабочие"]);
});

test("category names are unique without case sensitivity", () => {
  const state = createInitialState(now);
  const result = categories.createCategory(state, { name: "личные", color: "#112233" }, now);
  assert.match(result.errors.name, /существует/);
});

test("rename immediately affects sorted order", () => {
  const state = createInitialState(now);
  const work = state.categories.find(({ name }) => name === "Рабочие");
  const result = categories.updateCategory(state, work.id, { name: "Архив", color: work.color }, now);
  assert.deepEqual(categories.sortCategories(result.state.categories).map(({ name }) => name), ["Архив", "Личные"]);
});

test("deleting category preserves active and completed tasks without category", () => {
  let state = createInitialState(now);
  const personal = state.categories.find(({ name }) => name === "Личные");
  const first = tasks.createTask(state, { title: "Активная", date: "2026-10-25", priority: "normal", categoryId: personal.id }, now);
  state = first.state;
  const second = tasks.createTask(state, { title: "Выполненная", date: "2026-10-25", priority: "normal", categoryId: personal.id }, now);
  state = tasks.toggleTaskCompleted(second.state, second.task.id, now);
  state = categories.deleteCategory(state, personal.id);
  assert.equal(state.tasks.length, 2);
  assert.ok(state.tasks.every(({ categoryId }) => categoryId === null));
  assert.equal(state.tasks.find(({ id }) => id === second.task.id).completed, true);
});
