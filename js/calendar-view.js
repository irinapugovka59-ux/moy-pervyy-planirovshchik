(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const {
    addDays,
    daysBetween,
    getWeekDates,
    isSameDay,
    isWeekend,
    startOfWeek,
    toISODate,
  } = root.dateUtils;

  const weekdayFormatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
  const monthDayFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  const fullDateFormatter = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function formatWeekRange(weekStart) {
    const weekEnd = addDays(weekStart, 6);
    return `${monthDayFormatter.format(weekStart)} — ${fullDateFormatter.format(weekEnd)}`;
  }

  function createDay(date, today) {
    const day = createElement("section", "day-card");
    if (isWeekend(date)) day.classList.add("weekend");
    if (isSameDay(date, today)) day.classList.add("today");
    day.dataset.date = toISODate(date);

    const heading = createElement("div", "day-heading");
    const dateBlock = createElement("div");
    dateBlock.append(
      createElement("span", "weekday", capitalize(weekdayFormatter.format(date).replace(".", ""))),
      createElement("span", "day-number", String(date.getDate())),
    );
    const actions = createElement("div", "day-header-actions");

    if (isSameDay(date, today)) {
      actions.append(createElement("span", "today-label", "Сегодня"));
      day.setAttribute("aria-current", "date");
    }

    const addButton = createElement("button", "day-add-button", "+");
    addButton.type = "button";
    addButton.dataset.action = "add-day-task";
    addButton.dataset.date = toISODate(date);
    addButton.setAttribute("aria-label", `Добавить задачу на ${fullDateFormatter.format(date)}`);
    actions.append(addButton);
    heading.append(dateBlock, actions);

    const taskList = createElement("div", "task-list");
    taskList.dataset.taskDate = toISODate(date);
    day.append(heading, taskList);
    return day;
  }

  function getWeekTitle(weekStart, today) {
    const currentWeekStart = startOfWeek(today);
    const offset = daysBetween(currentWeekStart, weekStart) / 7;
    if (offset === -1) return "Предыдущая неделя";
    if (offset === 0) return "Текущая неделя";
    if (offset === 1) return "Следующая неделя";
    return "Календарная неделя";
  }

  function createWeek(weekStart, today) {
    const article = createElement("article", "week-card");
    const heading = createElement("header", "week-heading");
    heading.append(
      createElement("h3", "", getWeekTitle(weekStart, today)),
      createElement("p", "week-range", formatWeekRange(weekStart)),
    );

    const days = createElement("div", "days-grid");
    days.setAttribute("aria-label", `Неделя: ${formatWeekRange(weekStart)}`);
    for (const date of getWeekDates(weekStart)) {
      days.append(createDay(date, today));
    }

    article.append(heading, days);
    return article;
  }

  function renderCalendar(container, rangeElement, visibleWeekStart, today = new Date()) {
    const secondWeekStart = addDays(visibleWeekStart, 7);
    const periodEnd = addDays(visibleWeekStart, 13);
    container.replaceChildren(
      createWeek(visibleWeekStart, today),
      createWeek(secondWeekStart, today),
    );
    rangeElement.textContent = `${fullDateFormatter.format(visibleWeekStart)} — ${fullDateFormatter.format(periodEnd)}`;
  }

  function getTodayWeekStart(now = new Date()) {
    return startOfWeek(now);
  }

  root.calendarView = Object.freeze({ getTodayWeekStart, renderCalendar });
})();
