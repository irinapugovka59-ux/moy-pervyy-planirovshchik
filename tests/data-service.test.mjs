import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/storage.js";
import "../js/task-service.js";
import "../js/recurrence-service.js";
import "../js/calendar-service.js";
import "../js/trash-service.js";
import "../js/data-service.js";

const root = globalThis.PlannerIra;
const service = root.dataService;
const { createInitialState } = root.state;
const now = new Date(2026, 10, 14, 12);

class MemoryStorage {
  constructor() { this.values = new Map(); this.failPrimaryWrite = false; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) {
    if (this.failPrimaryWrite && key === root.config.STORAGE_KEY) throw new Error("quota");
    this.values.set(key, value);
  }
}

test("export contains marker, version, timestamp and complete state", () => {
  const state = createInitialState(now);
  const result = service.serializeBackup(state, now);
  const backup = JSON.parse(result.text);
  assert.equal(backup.marker, "planner-ira");
  assert.equal(backup.formatVersion, 1);
  assert.equal(backup.exportedAt, now.toISOString());
  assert.deepEqual(backup.state, state);
});

test("valid import replaces state and keeps emergency copy", () => {
  const storage = new MemoryStorage();
  const oldState = createInitialState(new Date(2026, 0, 1));
  const nextState = createInitialState(now);
  nextState.settings.inboxCollapsed = true;
  storage.setItem(root.config.STORAGE_KEY, JSON.stringify(oldState));
  const text = service.serializeBackup(nextState, now).text;
  const result = service.importBackup(storage, text, now);
  assert.equal(result.imported, true);
  assert.deepEqual(JSON.parse(storage.getItem(root.config.STORAGE_KEY)), nextState);
  assert.equal([...storage.values.keys()].some((key) => key.includes("before-import")), true);
});

test("full backup restores tasks, inbox, order, categories, series, exceptions and trash", () => {
  const storage = new MemoryStorage();
  let state = createInitialState(now);
  state = root.recurrenceService.createSeries(state, {
    title: "Серия", description: "", date: "2026-11-14", time: "10:00", priority: "normal",
    categoryId: "category-work", recurrence: "monthly", endDate: "2027-01-14",
  }, "2026-12-31", now).state;
  const inbox = root.taskService.createTask(state, { title: "Идея", description: "", date: "", time: "", priority: "low", categoryId: null }, now);
  state = inbox.state;
  const recurring = state.tasks.find(({ seriesId }) => seriesId);
  state = root.recurrenceService.deleteRecurring(state, recurring.id, "only", now);
  const expected = structuredClone(state);
  storage.setItem(root.config.STORAGE_KEY, JSON.stringify(createInitialState(now)));
  const result = service.importBackup(storage, service.serializeBackup(state, now).text, now);
  assert.equal(result.imported, true);
  assert.deepEqual(result.state, expected);
});

test("broken, foreign and unsupported backups never change current data", () => {
  const storage = new MemoryStorage();
  const current = JSON.stringify(createInitialState(now));
  storage.setItem(root.config.STORAGE_KEY, current);
  const invalid = ["{", JSON.stringify({ marker: "other", formatVersion: 1, state: {} }), JSON.stringify({ marker: "planner-ira", formatVersion: 99, state: {} })];
  for (const text of invalid) {
    assert.equal(service.importBackup(storage, text, now).imported, false);
    assert.equal(storage.getItem(root.config.STORAGE_KEY), current);
  }
});

test("broken entity links are rejected", () => {
  const storage = new MemoryStorage();
  const state = createInitialState(now);
  state.tasks.push({
    id: "task-x", title: "X", description: "", date: "2026-11-14", time: null, priority: "normal", categoryId: "missing",
    completed: false, completedAt: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), originalDate: "2026-11-14",
    carryCount: 0, lastCarriedAt: null, order: 0, seriesId: null, occurrenceDate: null,
  });
  const text = JSON.stringify({ marker: "planner-ira", formatVersion: 1, exportedAt: now.toISOString(), state });
  assert.match(service.parseBackup(text).error, /категорию/);
});

test("failed primary write retains old data and emergency copy", () => {
  const storage = new MemoryStorage();
  const current = JSON.stringify(createInitialState(new Date(2026, 0, 1)));
  storage.setItem(root.config.STORAGE_KEY, current);
  const text = service.serializeBackup(createInitialState(now), now).text;
  storage.failPrimaryWrite = true;
  const result = service.importBackup(storage, text, now);
  assert.equal(result.imported, false);
  assert.equal(storage.getItem(root.config.STORAGE_KEY), current);
  assert.equal([...storage.values.keys()].some((key) => key.includes("before-import")), true);
});

test("clear creates only a fresh initial state", () => {
  const storage = new MemoryStorage();
  const result = service.clearAllData(storage, now);
  assert.equal(result.cleared, true);
  assert.equal(result.state.tasks.length, 0);
  assert.deepEqual(result.state.categories.map(({ name }) => name), ["Личные", "Рабочие"]);
});
