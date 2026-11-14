import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/storage.js";

const { STORAGE_KEY } = globalThis.PlannerIra.config;
const { createInitialState, updateInboxCollapsed, validateState } = globalThis.PlannerIra.state;
const { loadState, saveState } = globalThis.PlannerIra.storage;

class MemoryStorage {
  constructor(entries = {}) {
    this.data = new Map(Object.entries(entries));
    this.failWrites = false;
  }

  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error("Quota exceeded");
    this.data.set(key, String(value));
  }
}

const now = new Date(2026, 9, 25, 12, 0, 0);

test("initial state has complete empty collections and two default categories", () => {
  const state = createInitialState(now);
  assert.equal(state.version, 1);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.trash, []);
  assert.deepEqual(state.series, []);
  assert.deepEqual(state.seriesExceptions, []);
  assert.deepEqual(state.categories.map(({ name }) => name), ["Личные", "Рабочие"]);
  assert.equal(state.lastCalendarCheck, "2026-10-25");
  assert.equal(validateState(state).valid, true);
});

test("empty storage is initialized once without duplicating categories", () => {
  const storage = new MemoryStorage();
  const first = loadState(storage, now);
  const second = loadState(storage, now);
  assert.equal(first.persistent, true);
  assert.equal(second.state.categories.length, 2);
  assert.deepEqual(second.state.categories.map(({ id }) => id), ["category-personal", "category-work"]);
});

test("valid stored state is loaded unchanged", () => {
  const state = updateInboxCollapsed(createInitialState(now), true);
  const storage = new MemoryStorage({ [STORAGE_KEY]: JSON.stringify(state) });
  const loaded = loadState(storage, now);
  assert.deepEqual(loaded.state, state);
  assert.equal(loaded.warning, null);
});

test("corrupted JSON is backed up and replaced with safe state", () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: "{not-json" });
  const loaded = loadState(storage, now);
  const recovery = [...storage.data.entries()].find(([key]) => key.startsWith("planner-ira:recovery:"));
  assert.ok(recovery);
  assert.equal(recovery[1], "{not-json");
  assert.equal(loaded.state.categories.length, 2);
  assert.match(loaded.warning, /повреждены/i);
});

test("invalid schema is treated as corrupted data", () => {
  const storage = new MemoryStorage({ [STORAGE_KEY]: JSON.stringify({ version: 99 }) });
  const loaded = loadState(storage, now);
  assert.match(loaded.warning, /повреждены/i);
  assert.equal(loaded.state.version, 1);
});

test("write failure is reported and never marked as saved", () => {
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const result = saveState(storage, createInitialState(now));
  assert.equal(result.saved, false);
  assert.match(result.error, /не удалось сохранить/i);
});

test("read failure returns temporary safe state", () => {
  const storage = {
    getItem() {
      throw new Error("Blocked");
    },
  };
  const loaded = loadState(storage, now);
  assert.equal(loaded.persistent, false);
  assert.equal(loaded.state.categories.length, 2);
  assert.match(loaded.warning, /недоступно/i);
});
