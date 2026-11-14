import test from "node:test";
import assert from "node:assert/strict";
import "../js/date-utils.js";

const {
  addDays,
  daysBetween,
  getWeekDates,
  parseISODate,
  shiftWeekStart,
  startOfWeek,
  toISODate,
} = globalThis.PlannerIra.dateUtils;

test("startOfWeek returns Monday for every weekday", () => {
  const expected = "2026-10-19";
  for (let day = 19; day <= 25; day += 1) {
    assert.equal(toISODate(startOfWeek(new Date(2026, 9, day, 15))), expected);
  }
});

test("week contains Monday through Sunday", () => {
  assert.deepEqual(
    getWeekDates(new Date(2026, 9, 19)).map(toISODate),
    ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"],
  );
});

test("date arithmetic crosses month and year boundaries", () => {
  assert.equal(toISODate(addDays(new Date(2026, 11, 31), 1)), "2027-01-01");
  assert.equal(toISODate(addDays(new Date(2027, 0, 1), -1)), "2026-12-31");
  assert.equal(toISODate(shiftWeekStart(new Date(2026, 11, 28), 1)), "2027-01-04");
});

test("date arithmetic handles leap years", () => {
  assert.equal(toISODate(addDays(new Date(2028, 1, 28), 1)), "2028-02-29");
  assert.equal(toISODate(addDays(new Date(2027, 1, 28), 1)), "2027-03-01");
});

test("ISO parsing rejects impossible dates", () => {
  assert.equal(toISODate(parseISODate("2028-02-29")), "2028-02-29");
  assert.equal(parseISODate("2027-02-29"), null);
  assert.equal(parseISODate("25.10.2026"), null);
});

test("daysBetween is stable across calendar boundaries", () => {
  assert.equal(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 7)), 7);
});
