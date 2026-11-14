import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/task-service.js";
import "../js/recurrence-service.js";
import "../js/calendar-service.js";
import "../js/trash-service.js";
import "../js/data-service.js";

const root = globalThis.PlannerIra;

test("three thousand tasks remain valid, filterable and exportable", () => {
  const now = new Date(2026, 10, 14, 12);
  const state = root.state.createInitialState(now);
  state.tasks = Array.from({ length: 3000 }, (_, index) => ({
    id: `task-load-${index}`,
    title: `Задача ${index} <script>alert(1)</script>`,
    description: `<img src=x onerror=alert(${index})>`,
    date: index % 7 === 0 ? null : `2026-11-${String(14 + (index % 7)).padStart(2, "0")}`,
    time: index % 7 === 0 ? null : "12:00",
    priority: ["low", "normal", "urgent"][index % 3],
    categoryId: index % 2 ? "category-personal" : null,
    completed: index % 5 === 0,
    completedAt: index % 5 === 0 ? now.toISOString() : null,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), originalDate: index % 7 === 0 ? null : `2026-11-${String(14 + (index % 7)).padStart(2, "0")}`,
    carryCount: 0, lastCarriedAt: null, order: index, seriesId: null, occurrenceDate: null,
  }));
  assert.equal(root.state.validateState(state).valid, true);
  const filtered = root.taskService.filterTasks(state.tasks, { status: "active", priorities: new Set(["urgent"]), categories: new Set(), carried: "all" });
  assert.ok(filtered.length > 0);
  const backup = root.dataService.serializeBackup(state, now);
  assert.equal(backup.error, null);
  assert.equal(root.dataService.parseBackup(backup.text).summary.tasks, 3000);
});
