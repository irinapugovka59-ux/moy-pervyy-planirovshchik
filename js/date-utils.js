(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const DAY_IN_MS = 24 * 60 * 60 * 1000;

  function startOfDay(value) {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(value, amount) {
    const date = startOfDay(value);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function startOfWeek(value) {
    const date = startOfDay(value);
    const mondayOffset = (date.getDay() + 6) % 7;
    return addDays(date, -mondayOffset);
  }

  function getWeekDates(weekStart) {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }

  function toISODate(value) {
    const date = startOfDay(value);
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function isSameDay(first, second) {
    return toISODate(first) === toISODate(second);
  }

  function isWeekend(value) {
    const day = startOfDay(value).getDay();
    return day === 0 || day === 6;
  }

  function shiftWeekStart(weekStart, amount) {
    return addDays(weekStart, amount * 7);
  }

  function daysBetween(first, second) {
    const firstUtc = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
    const secondUtc = Date.UTC(second.getFullYear(), second.getMonth(), second.getDate());
    return Math.round((secondUtc - firstUtc) / DAY_IN_MS);
  }

  root.dateUtils = Object.freeze({
    addDays,
    daysBetween,
    getWeekDates,
    isSameDay,
    isWeekend,
    parseISODate,
    shiftWeekStart,
    startOfDay,
    startOfWeek,
    toISODate,
  });
})();
