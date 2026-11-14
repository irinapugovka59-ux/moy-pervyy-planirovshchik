(() => {
  "use strict";

  const root = globalThis.PlannerIra;
  const { renderCalendar, getTodayWeekStart } = root.calendarView;
  const { addDays, parseISODate, shiftWeekStart, toISODate } = root.dateUtils;
  const { updateInboxCollapsed } = root.state;
  const { loadState, saveState } = root.storage;
  const { createTask, filterTasks, moveTaskInGroup, moveTaskToDate, reorderTask, toggleTaskCompleted, updateTask } = root.taskService;
  const { createCategory, deleteCategory, sortCategories, updateCategory } = root.categoryService;
  const { renderTasks } = root.taskView;

  const byId = (id) => document.getElementById(id);
  const elements = {
    previous: byId("previous-week"), next: byId("next-week"), today: byId("today-button"),
    weeks: byId("weeks-grid"), range: byId("date-range"), inboxToggle: byId("inbox-toggle"),
    inboxContent: byId("inbox-content"), inboxAdd: byId("inbox-add-task"), status: byId("status-banner"),
    newTask: byId("new-task-button"), categoriesButton: byId("categories-button"), taskDialog: byId("task-dialog"),
    taskForm: byId("task-form"), taskDialogTitle: byId("task-dialog-title"), taskDialogKicker: byId("task-dialog-kicker"),
    taskSubmit: byId("task-submit"), taskAutosave: byId("task-autosave-note"), taskTitle: byId("task-title"),
    taskDescription: byId("task-description"), taskDate: byId("task-date"), taskTime: byId("task-time"),
    taskPriority: byId("task-priority"), taskCategory: byId("task-category"), categoriesDialog: byId("categories-dialog"),
    categoryForm: byId("category-form"), categoryName: byId("category-name"), categoryColor: byId("category-color"),
    categoryCreateError: byId("category-create-error"), categoryList: byId("category-list"), closeCategories: byId("close-categories"),
    statusFilter: byId("status-filter"), carriedFilter: byId("carried-filter"), categoryFilters: byId("category-filters"),
    resetFilters: byId("reset-filters"),
    moveDialog: byId("move-dialog"), moveForm: byId("move-form"), moveDate: byId("move-date"),
    moveDateError: byId("move-date-error"), closeMoveDialog: byId("close-move-dialog"), cancelMoveDialog: byId("cancel-move-dialog"),
  };

  let browserStorage = null;
  try { browserStorage = globalThis.localStorage; } catch { /* handled by loadState */ }
  const unavailableStorage = {
    getItem() { throw new Error("Storage unavailable"); },
    setItem() { throw new Error("Storage unavailable"); },
  };
  const loaded = loadState(browserStorage ?? unavailableStorage);
  let state = loaded.state;
  let visibleWeekStart = getTodayWeekStart();
  let taskMode = "create";
  let activeTaskId = null;
  let createFormDirty = false;
  let autosaveTimer = null;
  let moveTaskId = null;
  let draggedTaskId = null;
  let touchDrag = null;
  let highlightedDropZone = null;
  const filters = { status: "all", priorities: new Set(), categories: new Set(), carried: "all" };

  function showStatus(message) {
    elements.status.hidden = !message;
    elements.status.textContent = message ?? "";
  }

  function persist(nextState) {
    const result = saveState(browserStorage ?? unavailableStorage, nextState);
    if (!result.saved) { showStatus(result.error); return false; }
    state = nextState;
    showStatus(null);
    return true;
  }

  function applyInboxState() {
    const expanded = !state.settings.inboxCollapsed;
    elements.inboxToggle.setAttribute("aria-expanded", String(expanded));
    elements.inboxContent.hidden = !expanded;
  }

  function renderCategoryOptions(selected = elements.taskCategory.value) {
    elements.taskCategory.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Без категории";
    elements.taskCategory.append(empty);
    for (const category of sortCategories(state.categories)) {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      elements.taskCategory.append(option);
    }
    elements.taskCategory.value = state.categories.some(({ id }) => id === selected) ? selected : "";
  }

  function renderCategoryFilters() {
    elements.categoryFilters.replaceChildren();
    const values = [{ id: "none", name: "Без категории" }, ...sortCategories(state.categories)];
    for (const category of values) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "category-filter";
      input.value = category.id;
      input.checked = filters.categories.has(category.id);
      label.append(input, document.createTextNode(` ${category.name}`));
      elements.categoryFilters.append(label);
    }
  }

  function renderAll() {
    renderCalendar(elements.weeks, elements.range, visibleWeekStart, new Date());
    applyInboxState();
    renderCategoryFilters();
    renderTasks(state, filterTasks(state.tasks, filters));
  }

  function taskFormValue() {
    return {
      title: elements.taskTitle.value, description: elements.taskDescription.value,
      date: elements.taskDate.value, time: elements.taskTime.value,
      priority: elements.taskPriority.value, categoryId: elements.taskCategory.value,
    };
  }

  function showTaskErrors(errors = {}) {
    for (const node of elements.taskForm.querySelectorAll("[data-error-for]")) {
      node.textContent = errors[node.dataset.errorFor] ?? "";
    }
  }

  function syncTimeAvailability() {
    const hasDate = Boolean(elements.taskDate.value);
    elements.taskTime.disabled = !hasDate;
    if (!hasDate) elements.taskTime.value = "";
  }

  function fillTaskForm(task = null, presetDate = null) {
    elements.taskTitle.value = task?.title ?? "";
    elements.taskDescription.value = task?.description ?? "";
    elements.taskDate.value = task?.date ?? presetDate ?? "";
    elements.taskTime.value = task?.time ?? "";
    elements.taskPriority.value = task?.priority ?? "normal";
    renderCategoryOptions(task?.categoryId ?? "");
    elements.taskDate.min = toISODate(new Date());
    syncTimeAvailability();
    showTaskErrors();
  }

  function openTaskDialog(taskId = null, presetDate = null) {
    clearTimeout(autosaveTimer);
    activeTaskId = taskId;
    taskMode = taskId ? "edit" : "create";
    createFormDirty = false;
    const task = taskId ? state.tasks.find(({ id }) => id === taskId) : null;
    fillTaskForm(task, presetDate);
    elements.taskDialogTitle.textContent = task ? "Редактирование задачи" : "Новая задача";
    elements.taskDialogKicker.textContent = task ? "Автосохранение" : (presetDate ? "Задача на дату" : "Входящие или дата");
    elements.taskSubmit.hidden = Boolean(task);
    elements.taskAutosave.hidden = !task;
    elements.taskDialog.showModal();
    elements.taskTitle.focus();
  }

  function autoSaveTask() {
    if (taskMode !== "edit" || !activeTaskId) return true;
    const result = updateTask(state, activeTaskId, taskFormValue(), new Date());
    showTaskErrors(result.errors);
    if (Object.keys(result.errors).length || !persist(result.state)) return false;
    renderAll();
    return true;
  }

  function scheduleAutoSave() {
    if (taskMode !== "edit") return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autoSaveTask, 220);
  }

  function closeTaskDialog() {
    clearTimeout(autosaveTimer);
    if (taskMode === "edit") {
      if (!autoSaveTask()) return;
    } else if (createFormDirty && !globalThis.confirm("Закрыть форму и потерять введённые данные?")) {
      return;
    }
    elements.taskDialog.close();
    activeTaskId = null;
    createFormDirty = false;
  }

  function renderCategories() {
    elements.categoryList.replaceChildren();
    for (const category of sortCategories(state.categories)) {
      const row = document.createElement("div");
      row.className = "category-row";
      row.dataset.categoryId = category.id;
      const color = document.createElement("input");
      color.type = "color"; color.value = category.color; color.setAttribute("aria-label", `Цвет категории «${category.name}»`);
      const name = document.createElement("input");
      name.type = "text"; name.maxLength = 40; name.value = category.name; name.setAttribute("aria-label", `Название категории «${category.name}»`);
      const save = document.createElement("button");
      save.type = "button"; save.className = "small-button"; save.dataset.action = "save-category"; save.textContent = "Сохранить";
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "task-action"; remove.dataset.action = "delete-category"; remove.textContent = "Удалить";
      const error = document.createElement("small");
      error.className = "field-error category-row-error";
      row.append(color, name, save, remove, error);
      elements.categoryList.append(row);
    }
  }

  function closeMoveDialog() {
    elements.moveDialog.close();
    moveTaskId = null;
    elements.moveDateError.textContent = "";
  }

  function openMoveDialog(taskId) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task) return;
    moveTaskId = taskId;
    elements.moveDate.min = toISODate(new Date());
    elements.moveDate.value = task.date && task.date >= elements.moveDate.min ? task.date : elements.moveDate.min;
    elements.moveDateError.textContent = "";
    elements.moveDialog.showModal();
    elements.moveDate.focus();
  }

  function moveWithoutConfirmation(taskId, targetDate) {
    const result = moveTaskToDate(state, taskId, targetDate, new Date());
    elements.moveDateError.textContent = result.errors.date ?? result.errors.form ?? "";
    if (Object.keys(result.errors).length || !persist(result.state)) return false;
    renderAll();
    return true;
  }

  function clearDropHighlight() {
    highlightedDropZone?.classList.remove("drop-target");
    highlightedDropZone = null;
  }

  function setDropHighlight(zone) {
    if (highlightedDropZone === zone) return;
    clearDropHighlight();
    highlightedDropZone = zone;
    zone?.classList.add("drop-target");
  }

  function performDrop(taskId, targetList, targetCard = null) {
    const task = state.tasks.find(({ id }) => id === taskId);
    if (!task || !targetList) return;
    const targetDate = targetList.id === "inbox-task-list" ? null : targetList.dataset.taskDate;
    const sourceKey = task.date ?? "__inbox__";
    const targetKey = targetDate ?? "__inbox__";

    if (sourceKey === targetKey) {
      const targetTaskId = targetCard?.dataset.taskId ?? null;
      const next = reorderTask(state, taskId, targetTaskId);
      if (persist(next)) renderAll();
      return;
    }

    const destination = targetDate ? `на ${targetDate.split("-").reverse().join(".")}` : "во «Входящие»";
    if (!globalThis.confirm(`Перенести задачу «${task.title}» ${destination}?`)) return;
    moveWithoutConfirmation(taskId, targetDate);
  }

  function updateFiltersFromControls() {
    filters.status = elements.statusFilter.value;
    filters.carried = elements.carriedFilter.value;
    filters.priorities = new Set([...document.querySelectorAll('[name="priority-filter"]:checked')].map(({ value }) => value));
    filters.categories = new Set([...document.querySelectorAll('[name="category-filter"]:checked')].map(({ value }) => value));
    renderAll();
  }

  elements.previous.addEventListener("click", () => { visibleWeekStart = shiftWeekStart(visibleWeekStart, -1); renderAll(); });
  elements.next.addEventListener("click", () => { visibleWeekStart = shiftWeekStart(visibleWeekStart, 1); renderAll(); });
  elements.today.addEventListener("click", () => { visibleWeekStart = getTodayWeekStart(); renderAll(); });
  elements.inboxToggle.addEventListener("click", () => {
    const next = updateInboxCollapsed(state, !state.settings.inboxCollapsed);
    if (persist(next)) applyInboxState();
  });

  elements.newTask.addEventListener("click", () => openTaskDialog());
  elements.inboxAdd.addEventListener("click", () => openTaskDialog());
  elements.weeks.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="add-day-task"]');
    if (button) openTaskDialog(null, button.dataset.date);
  });
  for (const button of document.querySelectorAll("[data-close-task]")) button.addEventListener("click", closeTaskDialog);
  elements.taskDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeTaskDialog(); });
  elements.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = createTask(state, taskFormValue(), new Date());
    showTaskErrors(result.errors);
    if (Object.keys(result.errors).length || !persist(result.state)) return;
    elements.taskDialog.close();
    renderAll();
  });
  elements.taskForm.addEventListener("input", () => {
    createFormDirty = taskMode === "create";
    syncTimeAvailability();
    scheduleAutoSave();
  });
  elements.taskForm.addEventListener("change", () => {
    createFormDirty = taskMode === "create";
    syncTimeAvailability();
    if (taskMode === "edit") autoSaveTask();
  });

  document.addEventListener("change", (event) => {
    if (event.target.dataset.action === "toggle-task") {
      const next = toggleTaskCompleted(state, event.target.dataset.taskId, new Date());
      if (persist(next)) renderAll();
    }
    if (event.target.matches('#status-filter, #carried-filter, [name="priority-filter"], [name="category-filter"]')) updateFiltersFromControls();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, taskId } = button.dataset;
    if (action === "edit-task") openTaskDialog(taskId);
    if (action === "move-task-up" || action === "move-task-down") {
      const next = moveTaskInGroup(state, taskId, action === "move-task-up" ? -1 : 1);
      if (next !== state && persist(next)) renderAll();
    }
    const task = taskId ? state.tasks.find(({ id }) => id === taskId) : null;
    if (task && action === "move-task-previous-day" && task.date) {
      moveWithoutConfirmation(taskId, toISODate(addDays(parseISODate(task.date), -1)));
    }
    if (task && action === "move-task-next-day" && task.date) {
      moveWithoutConfirmation(taskId, toISODate(addDays(parseISODate(task.date), 1)));
    }
    if (task && action === "move-task-inbox") moveWithoutConfirmation(taskId, null);
    if (task && action === "move-task-today") moveWithoutConfirmation(taskId, toISODate(new Date()));
    if (task && action === "choose-task-date") openMoveDialog(taskId);
  });

  elements.moveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (moveWithoutConfirmation(moveTaskId, elements.moveDate.value)) closeMoveDialog();
  });
  elements.closeMoveDialog.addEventListener("click", closeMoveDialog);
  elements.cancelMoveDialog.addEventListener("click", closeMoveDialog);
  elements.moveDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeMoveDialog(); });

  document.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".task-card");
    if (!card) return;
    draggedTaskId = card.dataset.taskId;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedTaskId);
  });
  document.addEventListener("dragover", (event) => {
    if (!draggedTaskId) return;
    const list = event.target.closest(".task-list");
    if (!list) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropHighlight(list);
  });
  document.addEventListener("drop", (event) => {
    if (!draggedTaskId) return;
    const list = event.target.closest(".task-list");
    if (!list) return;
    event.preventDefault();
    const card = event.target.closest(".task-card");
    const id = draggedTaskId;
    draggedTaskId = null;
    clearDropHighlight();
    performDrop(id, list, card);
  });
  document.addEventListener("dragend", () => {
    document.querySelector(".task-card.is-dragging")?.classList.remove("is-dragging");
    draggedTaskId = null;
    clearDropHighlight();
  });

  document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag-handle]");
    if (!handle) return;
    touchDrag = { taskId: handle.dataset.taskId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
    handle.setPointerCapture?.(event.pointerId);
  });
  document.addEventListener("pointermove", (event) => {
    if (!touchDrag || touchDrag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - touchDrag.startX, event.clientY - touchDrag.startY);
    if (!touchDrag.active && distance < 7) return;
    touchDrag.active = true;
    event.preventDefault();
    document.body.classList.add("touch-drag-active");
    document.querySelector(`[data-task-id="${touchDrag.taskId}"]`)?.classList.add("is-dragging");
    const below = document.elementFromPoint(event.clientX, event.clientY);
    setDropHighlight(below?.closest(".task-list") ?? null);
  });
  function finishTouchDrag(event) {
    if (!touchDrag || touchDrag.pointerId !== event.pointerId) return;
    const current = touchDrag;
    touchDrag = null;
    document.body.classList.remove("touch-drag-active");
    document.querySelector(".task-card.is-dragging")?.classList.remove("is-dragging");
    const below = document.elementFromPoint(event.clientX, event.clientY);
    const list = below?.closest(".task-list") ?? null;
    const card = below?.closest(".task-card") ?? null;
    clearDropHighlight();
    if (current.active && list) performDrop(current.taskId, list, card);
  }
  document.addEventListener("pointerup", finishTouchDrag);
  document.addEventListener("pointercancel", (event) => {
    if (!touchDrag || touchDrag.pointerId !== event.pointerId) return;
    touchDrag = null;
    document.body.classList.remove("touch-drag-active");
    document.querySelector(".task-card.is-dragging")?.classList.remove("is-dragging");
    clearDropHighlight();
  });

  elements.categoriesButton.addEventListener("click", () => {
    elements.categoryCreateError.textContent = "";
    renderCategories();
    elements.categoriesDialog.showModal();
  });
  elements.closeCategories.addEventListener("click", () => elements.categoriesDialog.close());
  elements.categoriesDialog.addEventListener("cancel", (event) => { event.preventDefault(); elements.categoriesDialog.close(); });
  elements.categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = createCategory(state, { name: elements.categoryName.value, color: elements.categoryColor.value }, new Date());
    elements.categoryCreateError.textContent = result.errors.name ?? result.errors.color ?? "";
    if (Object.keys(result.errors).length || !persist(result.state)) return;
    elements.categoryName.value = "";
    renderCategories();
    renderAll();
  });
  elements.categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const row = button.closest("[data-category-id]");
    const categoryId = row.dataset.categoryId;
    if (button.dataset.action === "save-category") {
      const result = updateCategory(state, categoryId, {
        name: row.querySelector('input[type="text"]').value,
        color: row.querySelector('input[type="color"]').value,
      }, new Date());
      row.querySelector(".category-row-error").textContent = result.errors.name ?? result.errors.color ?? "";
      if (Object.keys(result.errors).length || !persist(result.state)) return;
      renderCategories(); renderAll();
    }
    if (button.dataset.action === "delete-category") {
      filters.categories.delete(categoryId);
      const next = deleteCategory(state, categoryId);
      if (persist(next)) { renderCategories(); renderAll(); }
    }
  });

  elements.resetFilters.addEventListener("click", () => {
    filters.status = "all"; filters.carried = "all"; filters.priorities.clear(); filters.categories.clear();
    elements.statusFilter.value = "all"; elements.carriedFilter.value = "all";
    for (const input of document.querySelectorAll('[name="priority-filter"]')) input.checked = false;
    renderAll();
  });

  showStatus(loaded.warning);
  renderAll();
})();
