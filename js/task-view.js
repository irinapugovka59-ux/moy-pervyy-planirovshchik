(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const { getGroupTasks } = root.taskService;
  const { sortCategories } = root.categoryService;
  const { toISODate } = root.dateUtils;

  const priorityLabels = {
    low: "Низкий",
    normal: "Обычный",
    urgent: "Срочный",
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function actionButton(label, action, taskId, disabled = false) {
    const button = element("button", "task-action", label);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.taskId = taskId;
    button.disabled = disabled;
    const names = { "move-task-up": "Переместить выше", "move-task-down": "Переместить ниже", "edit-task": "Редактировать" };
    button.setAttribute("aria-label", names[action] ?? label);
    button.title = names[action] ?? label;
    return button;
  }

  function createTaskCard(task, group, categories) {
    const category = categories.find(({ id }) => id === task.categoryId);
    const card = element("article", `task-card${task.completed ? " completed" : ""}`);
    card.dataset.taskId = task.id;
    card.draggable = true;
    card.style.setProperty("--category-color", category?.color ?? "#a9d8cc");

    const main = element("div", "task-card-main");
    const handle = element("button", "drag-handle", "⋮⋮");
    handle.type = "button";
    handle.dataset.dragHandle = "";
    handle.dataset.taskId = task.id;
    handle.setAttribute("aria-label", `Перетащить задачу «${task.title}»`);
    handle.title = "Перетащить";
    const checkbox = element("input", "task-complete");
    checkbox.type = "checkbox";
    checkbox.checked = task.completed;
    checkbox.dataset.action = "toggle-task";
    checkbox.dataset.taskId = task.id;
    checkbox.setAttribute("aria-label", task.completed ? `Вернуть задачу «${task.title}» в работу` : `Выполнить задачу «${task.title}»`);

    const content = element("div", "task-content");
    content.append(element("strong", "task-title", task.title));
    const meta = element("div", "task-meta");
    if (task.time) meta.append(element("span", "task-chip", task.time));
    meta.append(element("span", `task-chip priority-${task.priority}`, priorityLabels[task.priority]));
    meta.append(element("span", "task-chip", category?.name ?? "Без категории"));
    if (task.carryCount > 0) meta.append(element("span", "task-chip", "Перенесена"));
    content.append(meta);
    main.append(handle, checkbox, content);

    const actions = element("div", "task-actions");
    const index = group.findIndex(({ id }) => id === task.id);
    const moveMenu = element("details", "task-move-menu");
    const moveSummary = element("summary", "task-action", "Перенести");
    const moveOptions = element("div", "task-move-options");
    const today = toISODate(new Date());
    if (task.date) {
      moveOptions.append(
        actionButton("На день назад", "move-task-previous-day", task.id, task.date <= today),
        actionButton("На день вперёд", "move-task-next-day", task.id),
        actionButton("Выбрать дату", "choose-task-date", task.id),
        actionButton("Во входящие", "move-task-inbox", task.id),
      );
    } else {
      moveOptions.append(
        actionButton("На сегодня", "move-task-today", task.id),
        actionButton("Выбрать дату", "choose-task-date", task.id),
      );
    }
    moveMenu.append(moveSummary, moveOptions);

    const mainActions = element("div", "task-main-actions");
    mainActions.append(
      moveMenu,
      actionButton("Изменить", "edit-task", task.id),
    );

    actions.append(
      actionButton("↑", "move-task-up", task.id, index <= 0),
      actionButton("↓", "move-task-down", task.id, index === group.length - 1),
      mainActions,
    );
    card.append(main, actions);
    return card;
  }

  function renderList(container, visibleTasks, allTasks, categories, emptyLabel) {
    container.replaceChildren();
    if (visibleTasks.length === 0) {
      const text = allTasks.length ? "Нет задач по выбранным фильтрам" : emptyLabel;
      container.append(element("div", allTasks.length ? "filtered-empty" : "list-empty", text));
      return;
    }
    for (const task of visibleTasks) {
      container.append(createTaskCard(task, allTasks, categories));
    }
  }

  function renderTasks(state, visibleTasks) {
    const categories = sortCategories(state.categories);
    const visibleIds = new Set(visibleTasks.map(({ id }) => id));
    const inboxAll = getGroupTasks(state.tasks, null);
    const inboxVisible = inboxAll.filter(({ id }) => visibleIds.has(id));
    renderList(
      document.querySelector("#inbox-task-list"),
      inboxVisible,
      inboxAll,
      categories,
      "Во входящих пока нет задач",
    );

    const badge = document.querySelector(".count-badge");
    badge.textContent = String(inboxAll.length);
    badge.setAttribute("aria-label", `${inboxAll.length} задач`);

    for (const container of document.querySelectorAll("[data-task-date]")) {
      const date = container.dataset.taskDate;
      const all = getGroupTasks(state.tasks, date);
      const visible = all.filter(({ id }) => visibleIds.has(id));
      renderList(container, visible, all, categories, "Задач нет");
    }
  }

  root.taskView = Object.freeze({ priorityLabels, renderTasks });
})();
