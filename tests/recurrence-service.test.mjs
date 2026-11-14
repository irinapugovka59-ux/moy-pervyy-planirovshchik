import test from "node:test";
import assert from "node:assert/strict";
import "../js/config.js";
import "../js/date-utils.js";
import "../js/state.js";
import "../js/task-service.js";
import "../js/recurrence-service.js";

const root = globalThis.PlannerIra;
const { createInitialState } = root.state;
const service = root.recurrenceService;

function input(overrides = {}) {
  return { title: "Отчёт", description: "", date: "2026-01-31", time: "10:00", priority: "urgent", categoryId: null, recurrence: "monthly", endDate: "", ...overrides };
}

test("monthly dates keep their anchor across short months", () => {
  const created = service.createSeries(createInitialState(new Date(2026, 0, 31)), input(), "2026-05-31", new Date(2026, 0, 31));
  assert.deepEqual(created.state.tasks.map(({ occurrenceDate }) => occurrenceDate), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
});

test("monthly anchors 29 and 30 recover after February", () => {
  for (const day of [29, 30]) {
    const date = `2027-01-${day}`;
    const created = service.createSeries(createInitialState(new Date(2027, 0, day)), input({ date }), "2027-03-31", new Date(2027, 0, day));
    assert.deepEqual(created.state.tasks.map(({ occurrenceDate }) => occurrenceDate), [date, "2027-02-28", `2027-03-${day}`]);
  }
});

test("yearly February 29 uses February 28 outside leap years", () => {
  const created = service.createSeries(createInitialState(new Date(2024, 1, 29)), input({ date: "2024-02-29", recurrence: "yearly" }), "2028-03-01", new Date(2024, 1, 29));
  assert.deepEqual(created.state.tasks.map(({ occurrenceDate }) => occurrenceDate), ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("end date is inclusive and generation is idempotent", () => {
  const created = service.createSeries(createInitialState(new Date(2026, 0, 31)), input({ endDate: "2026-03-31" }), "2027-01-01", new Date(2026, 0, 31));
  assert.equal(created.state.tasks.length, 3);
  const repeated = service.generateOccurrences(created.state, "2027-01-01", new Date(2026, 0, 31));
  assert.equal(repeated, created.state);
});

test("one occurrence edit does not change the series", () => {
  const now = new Date(2026, 0, 31);
  const created = service.createSeries(createInitialState(now), input(), "2026-03-31", now);
  const target = created.state.tasks[1];
  const result = service.updateOccurrenceOnly(created.state, target.id, { ...input({ date: target.date, title: "Особый отчёт" }) }, now);
  assert.equal(result.task.title, "Особый отчёт");
  assert.equal(result.state.series[0].template.title, "Отчёт");
});

test("editing this and following splits the series", () => {
  const now = new Date(2026, 0, 31);
  const created = service.createSeries(createInitialState(now), input(), "2026-05-31", now);
  const march = created.state.tasks.find(({ occurrenceDate }) => occurrenceDate === "2026-03-31");
  const result = service.updateSeriesFromOccurrence(created.state, march.id, input({ date: "2026-03-30", title: "Новая серия" }), "2026-05-31", now);
  assert.equal(result.state.series.length, 2);
  assert.equal(result.state.series[0].cutoffDate, "2026-03-31");
  assert.deepEqual(result.state.tasks.filter(({ seriesId }) => seriesId === result.series.id).map(({ occurrenceDate }) => occurrenceDate), ["2026-03-30", "2026-04-30", "2026-05-30"]);
});

test("both recurring delete scopes prevent regeneration", () => {
  const now = new Date(2026, 0, 31);
  let created = service.createSeries(createInitialState(now), input(), "2026-04-30", now);
  const february = created.state.tasks.find(({ occurrenceDate }) => occurrenceDate === "2026-02-28");
  let state = service.deleteRecurring(created.state, february.id, "only", now);
  state = service.generateOccurrences(state, "2026-04-30", now);
  assert.equal(state.tasks.some(({ occurrenceDate }) => occurrenceDate === "2026-02-28"), false);
  const march = state.tasks.find(({ occurrenceDate }) => occurrenceDate === "2026-03-31");
  state = service.deleteRecurring(state, march.id, "following", now);
  state = service.generateOccurrences(state, "2027-12-31", now);
  assert.equal(state.tasks.some(({ occurrenceDate }) => occurrenceDate >= "2026-03-31"), false);
});
