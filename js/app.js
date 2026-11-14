(() => {
  "use strict";

  const root = globalThis.PlannerIra;
  const { renderCalendar, getTodayWeekStart } = root.calendarView;
  const { addDays, parseISODate, shiftWeekStart, toISODate } = root.dateUtils;
  const { updateInboxCollapsed } = root.state;
  const { loadState, saveState } = root.storage;
  const { createTask, filterTasks, moveTaskInGroup, moveTaskToDate, reorderTask, toggleTaskCompleted, updateTask } = root.taskService;
  const { createSeries, deleteRecurring, generateOccurrences, updateOccurrenceOnly, updateSeriesFromOccurrence } = root.recurrenceService;
  const { runCalendarCheck } = root.calendarService;
  const { clearTrash, deleteTask, permanentlyDeleteTask, purgeExpiredTrash, restoreTask } = root.trashService;
  const { clearAllData, importBackup, parseBackup, serializeBackup } = root.dataService;
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
    taskRecurrence: byId("task-recurrence"), taskEndMode: byId("task-end-mode"), taskEndDate: byId("task-end-date"),
    taskEndModeField: byId("task-end-mode-field"), taskEndDateField: byId("task-end-date-field"), taskScopeField: byId("task-scope-field"),
    dataButton: byId("data-button"), dataDialog: byId("data-dialog"), closeDataDialog: byId("close-data-dialog"),
    exportData: byId("export-data"), chooseImportData: byId("choose-import-data"), importData: byId("import-data"), openTrash: byId("open-trash"), trashCount: byId("trash-count"), clearData: byId("clear-data"),
    trashDialog: byId("trash-dialog"), closeTrashDialog: byId("close-trash-dialog"), doneTrash: byId("done-trash"), trashList: byId("trash-list"), emptyTrash: byId("empty-trash"),
    deleteScopeDialog: byId("delete-scope-dialog"), deleteScopeForm: byId("delete-scope-form"), closeDeleteScope: byId("close-delete-scope"), cancelDeleteScope: byId("cancel-delete-scope"),
    undoToast: byId("undo-toast"), undoMessage: byId("undo-message"), undoDelete: byId("undo-delete"),
    taskServiceInfo: byId("task-service-info"),
  };
  for (const error of document.querySelectorAll(".field-error")) error.setAttribute("aria-live", "polite");

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
  let midnightTimer = null;
  let deleteTaskId = null;
  let undoState = null;
  let undoTimer = null;
  let importBusy = false;
  const filters = { status: "all", priorities: new Set(), categories: new Set(), carried: "all" };

  function showStatus(message) {
    elements.status.hidden = !message;
    elements.status.textContent = message ?? "";
  }

  function persist(nextState, preserveUndo = false) {
    if (!preserveUndo && undoState) hideUndo();
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
    const visibleThrough = toISODate(addDays(visibleWeekStart, 13));
    const generated = generateOccurrences(state, visibleThrough, new Date());
    if (generated !== state) persist(generated);
    renderCalendar(elements.weeks, elements.range, visibleWeekStart, new Date());
    applyInboxState();
    renderCategoryFilters();
    renderTasks(state, filterTasks(state.tasks, filters));
    elements.trashCount.textContent = String(state.trash.length);
    if (elements.trashDialog.open) renderTrash();
  }

  function formatStoredDate(value) {
    if (!value) return "Без даты";
    const date = parseISODate(value);
    return date ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date) : value;
  }

  function renderTrash() {
    elements.trashList.replaceChildren();
    elements.emptyTrash.disabled = state.trash.length === 0;
    if (!state.trash.length) {
      const empty = document.createElement("p");
      empty.className = "list-empty";
      empty.textContent = "Корзина пуста";
      elements.trashList.append(empty);
      return;
    }
    for (const record of [...state.trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))) {
      const row = document.createElement("article"); row.className = "trash-item";
      const content = document.createElement("div");
      const title = document.createElement("strong"); title.className = "trash-item-title"; title.textContent = record.title;
      const meta = document.createElement("p"); meta.className = "trash-item-meta";
      meta.textContent = `Прежняя дата: ${formatStoredDate(record.previousDate)} · Удалена: ${new Date(record.deletedAt).toLocaleString("ru-RU")}`;
      content.append(title, meta);
      const actions = document.createElement("div"); actions.className = "trash-item-actions";
      for (const [label, action, className] of [["Восстановить", "restore-trash-task", "small-button"], ["Удалить навсегда", "delete-trash-task", "task-action"]]) {
        const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = label;
        button.dataset.action = action; button.dataset.taskId = record.id; actions.append(button);
      }
      row.append(content, actions); elements.trashList.append(row);
    }
  }

  function hideUndo() {
    clearTimeout(undoTimer); undoTimer = null; undoState = null; elements.undoToast.hidden = true;
  }

  function showUndo(previousState, message = "Задача перемещена в корзину") {
    clearTimeout(undoTimer); undoState = previousState; elements.undoMessage.textContent = message; elements.undoToast.hidden = false;
    undoTimer = setTimeout(hideUndo, 5000);
  }

  function commitDeletion(next, previousState, message) {
    if (next === state || !persist(next, true)) return false;
    showUndo(previousState, message);
    renderAll();
    return true;
  }

  function resetInterfaceAfterReplacement() {
    visibleWeekStart = getTodayWeekStart();
    resetFilters();
    activeTaskId = null; moveTaskId = null; deleteTaskId = null;
    for (const dialog of document.querySelectorAll("dialog[open]")) dialog.close();
    hideUndo();
  }

  function taskFormValue() {
    return {
      title: elements.taskTitle.value, description: elements.taskDescription.value,
      date: elements.taskDate.value, time: elements.taskTime.value,
      priority: elements.taskPriority.value, categoryId: elements.taskCategory.value,
      recurrence: elements.taskRecurrence.value,
      endDate: elements.taskEndMode.value === "date" ? elements.taskEndDate.value : "",
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

  function syncRecurrenceFields() {
    const recurring = elements.taskRecurrence.value !== "none";
    elements.taskEndModeField.hidden = !recurring;
    elements.taskEndDateField.hidden = !recurring || elements.taskEndMode.value !== "date";
    elements.taskEndDate.min = elements.taskDate.value || toISODate(new Date());
    if (!recurring) {
      elements.taskEndMode.value = "never";
      elements.taskEndDate.value = "";
    }
  }

  function fillTaskForm(task = null, presetDate = null) {
    const series = task?.seriesId ? state.series.find(({ id }) => id === task.seriesId) : null;
    elements.taskTitle.value = task?.title ?? "";
    elements.taskDescription.value = task?.description ?? "";
    elements.taskDate.value = task?.date ?? presetDate ?? "";
    elements.taskTime.value = task?.time ?? "";
    elements.taskPriority.value = task?.priority ?? "normal";
    renderCategoryOptions(task?.categoryId ?? "");
    const today = toISODate(new Date());
    elements.taskDate.min = task?.date && task.date < today ? task.date : today;
    elements.taskRecurrence.value = series?.type ?? "none";
    elements.taskEndMode.value = series?.endDate ? "date" : "never";
    elements.taskEndDate.value = series?.endDate ?? "";
    for (const input of elements.taskScopeField.querySelectorAll('input[name="task-scope"]')) input.checked = false;
    elements.taskScopeField.hidden = !series;
    const details = [];
    if (task?.originalDate) details.push(`Исходная дата: ${formatStoredDate(task.originalDate)}`);
    if (task?.carryCount) details.push(`Автоматических переносов: ${task.carryCount}`);
    elements.taskServiceInfo.textContent = details.join(" · ");
    elements.taskServiceInfo.hidden = details.length === 0;
    syncTimeAvailability();
    syncRecurrenceFields();
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
    const recurringEdit = Boolean(task?.seriesId);
    elements.taskSubmit.hidden = Boolean(task) && !recurringEdit;
    elements.taskSubmit.textContent = recurringEdit ? "Сохранить" : "Создать";
    elements.taskAutosave.hidden = !task || recurringEdit;
    elements.taskDialog.showModal();
    elements.taskTitle.focus();
  }

  function autoSaveTask() {
    if (taskMode !== "edit" || !activeTaskId) return true;
    const current = state.tasks.find(({ id }) => id === activeTaskId);
    if (current?.seriesId) return true;
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
    if (taskMode === "edit" && !state.tasks.find(({ id }) => id === activeTaskId)?.seriesId) {
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

  function resetFilters() {
    filters.status = "all"; filters.carried = "all"; filters.priorities.clear(); filters.categories.clear();
    elements.statusFilter.value = "all"; elements.carriedFilter.value = "all";
    for (const input of document.querySelectorAll('[name="priority-filter"], [name="category-filter"]')) input.checked = false;
  }

  function scheduleMidnightCheck() {
    clearTimeout(midnightTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
    midnightTimer = setTimeout(() => {
      processCalendarDateChange(new Date());
      scheduleMidnightCheck();
    }, Math.max(1000, next.getTime() - now.getTime()));
  }

  function processCalendarDateChange(now = new Date(), force = false) {
    const today = toISODate(now);
    if (!force && state.lastCalendarCheck === today) return false;
    const oldTodayStart = getTodayWeekStart(parseISODate(state.lastCalendarCheck) ?? now);
    const followsToday = toISODate(visibleWeekStart) === toISODate(oldTodayStart);
    const next = runCalendarCheck(state, now, true);
    if (!persist(next)) return false;
    if (followsToday) visibleWeekStart = getTodayWeekStart();
    if (elements.taskDialog.open) {
      if (taskMode === "edit" && activeTaskId) {
        const task = state.tasks.find(({ id }) => id === activeTaskId);
        if (task) {
          const oldDate = elements.taskDate.value;
          fillTaskForm(task);
          if (oldDate !== task.date) showStatus("Дата открытой задачи обновлена после смены суток.");
        }
      } else if (elements.taskDate.value && elements.taskDate.value < today) {
        showTaskErrors({ date: "Выбранная дата уже прошла. Укажите сегодняшнюю или будущую дату." });
      }
    }
    renderAll();
    return true;
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
    const value = taskFormValue();
    let result;
    if (taskMode === "edit" && activeTaskId) {
      const task = state.tasks.find(({ id }) => id === activeTaskId);
      if (!task?.seriesId) return;
      const scope = elements.taskScopeField.querySelector('input[name="task-scope"]:checked')?.value;
      if (!scope) { showTaskErrors({ scope: "Выберите область изменения." }); return; }
      result = scope === "only"
        ? updateOccurrenceOnly(state, activeTaskId, value, new Date())
        : updateSeriesFromOccurrence(state, activeTaskId, value, toISODate(addDays(visibleWeekStart, 13)), new Date());
    } else {
      result = value.recurrence === "none"
        ? createTask(state, value, new Date())
        : createSeries(state, value, toISODate(addDays(visibleWeekStart, 13)), new Date());
    }
    showTaskErrors(result.errors);
    if (Object.keys(result.errors).length || !persist(result.state)) return;
    elements.taskDialog.close();
    activeTaskId = null;
    renderAll();
    showStatus(taskMode === "edit" ? "Изменения сохранены." : "Задача создана.");
  });
  elements.taskForm.addEventListener("input", () => {
    createFormDirty = taskMode === "create";
    syncTimeAvailability();
    syncRecurrenceFields();
    scheduleAutoSave();
  });
  elements.taskForm.addEventListener("change", () => {
    createFormDirty = taskMode === "create";
    syncTimeAvailability();
    syncRecurrenceFields();
    if (taskMode === "edit") autoSaveTask();
  });

  document.addEventListener("change", (event) => {
    if (event.target.dataset.action === "toggle-task") {
      const toggled = toggleTaskCompleted(state, event.target.dataset.taskId, new Date());
      const next = runCalendarCheck(toggled, new Date(), true);
      if (persist(next)) renderAll();
    }
    if (event.target.matches('#status-filter, #carried-filter, [name="priority-filter"], [name="category-filter"]')) updateFiltersFromControls();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, taskId } = button.dataset;
    if (action === "edit-task") openTaskDialog(taskId);
    if (action === "delete-task") {
      const target = state.tasks.find(({ id }) => id === taskId);
      if (target?.seriesId) {
        deleteTaskId = taskId;
        elements.deleteScopeForm.reset();
        elements.deleteScopeDialog.showModal();
      } else if (target) {
        const previous = state;
        commitDeletion(deleteTask(state, taskId, new Date()), previous, "Задача перемещена в корзину");
      }
    }
    if (action === "restore-trash-task") {
      const next = restoreTask(state, taskId, new Date());
      if (persist(next)) { renderTrash(); renderAll(); showStatus("Задача восстановлена."); }
    }
    if (action === "delete-trash-task") {
      if (!globalThis.confirm("Удалить эту задачу навсегда? Действие нельзя отменить.")) return;
      const next = permanentlyDeleteTask(state, taskId);
      if (persist(next)) { renderTrash(); renderAll(); }
    }
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
  document.addEventListener("keydown", (event) => {
    const target = event.target.closest('.task-content[data-action="edit-task"]');
    if (!target || !["Enter", " "].includes(event.key)) return;
    event.preventDefault(); openTaskDialog(target.dataset.taskId);
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
    resetFilters();
    renderAll();
  });

  elements.deleteScopeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const scope = new FormData(elements.deleteScopeForm).get("delete-scope");
    if (!scope || !deleteTaskId) return;
    const previous = state;
    const next = deleteRecurring(state, deleteTaskId, scope, new Date());
    if (commitDeletion(next, previous, scope === "following" ? "Экземпляр и последующие перемещены в корзину" : "Задача перемещена в корзину")) {
      elements.deleteScopeDialog.close(); deleteTaskId = null;
    }
  });
  function closeDeleteScopeDialog() { elements.deleteScopeDialog.close(); deleteTaskId = null; }
  elements.closeDeleteScope.addEventListener("click", closeDeleteScopeDialog);
  elements.cancelDeleteScope.addEventListener("click", closeDeleteScopeDialog);
  elements.deleteScopeDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDeleteScopeDialog(); });

  elements.undoDelete.addEventListener("click", () => {
    if (!undoState) return;
    const previous = undoState;
    if (persist(previous)) { hideUndo(); renderAll(); showStatus("Удаление отменено."); }
  });

  elements.dataButton.addEventListener("click", () => { elements.trashCount.textContent = String(state.trash.length); elements.dataDialog.showModal(); });
  elements.closeDataDialog.addEventListener("click", () => elements.dataDialog.close());
  elements.dataDialog.addEventListener("cancel", (event) => { event.preventDefault(); elements.dataDialog.close(); });
  elements.openTrash.addEventListener("click", () => { elements.dataDialog.close(); renderTrash(); elements.trashDialog.showModal(); });
  function closeTrashDialog() { elements.trashDialog.close(); }
  elements.closeTrashDialog.addEventListener("click", closeTrashDialog);
  elements.doneTrash.addEventListener("click", closeTrashDialog);
  elements.trashDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeTrashDialog(); });
  elements.emptyTrash.addEventListener("click", () => {
    if (!state.trash.length || !globalThis.confirm("Очистить корзину навсегда? Действие нельзя отменить.")) return;
    if (persist(clearTrash(state))) { renderTrash(); renderAll(); }
  });

  elements.exportData.addEventListener("click", () => {
    const result = serializeBackup(state, new Date());
    if (result.error) { showStatus(result.error); return; }
    const blob = new Blob([result.text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `planner-ira-backup-${toISODate(new Date())}.json`;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    showStatus("Резервная копия подготовлена.");
  });

  elements.chooseImportData.addEventListener("click", () => {
    if (!importBusy) elements.importData.click();
  });

  elements.importData.addEventListener("change", async () => {
    if (importBusy) return;
    const file = elements.importData.files?.[0];
    elements.importData.value = "";
    if (!file) return;
    importBusy = true;
    elements.chooseImportData.disabled = true;
    let text;
    try { text = await file.text(); } catch { showStatus("Не удалось прочитать выбранный файл."); importBusy = false; elements.chooseImportData.disabled = false; return; }
    const checked = parseBackup(text);
    if (!checked.valid) { showStatus(checked.error); importBusy = false; elements.chooseImportData.disabled = false; return; }
    const summary = checked.summary;
    const approved = globalThis.confirm(`Импорт полностью заменит текущие данные.\nЗадач: ${summary.tasks}\nКатегорий: ${summary.categories}\nСерий: ${summary.series}\nПродолжить?`);
    if (!approved) { importBusy = false; elements.chooseImportData.disabled = false; return; }
    const result = importBackup(browserStorage ?? unavailableStorage, text, new Date());
    if (!result.imported) { showStatus(result.error); importBusy = false; elements.chooseImportData.disabled = false; return; }
    state = result.state;
    resetInterfaceAfterReplacement();
    const checkedState = runCalendarCheck(state, new Date(), true);
    if (!persist(checkedState)) { importBusy = false; elements.chooseImportData.disabled = false; return; }
    renderAll(); showStatus("Резервная копия восстановлена."); scheduleMidnightCheck();
    importBusy = false; elements.chooseImportData.disabled = false;
  });

  elements.clearData.addEventListener("click", () => {
    if (!globalThis.confirm("Удалить все задачи, категории, серии и корзину? Действие нельзя отменить.")) return;
    const result = clearAllData(browserStorage ?? unavailableStorage, new Date());
    if (!result.cleared) { showStatus(result.error); return; }
    state = result.state; resetInterfaceAfterReplacement(); renderAll(); showStatus("Все данные очищены."); scheduleMidnightCheck();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      processCalendarDateChange(new Date());
      scheduleMidnightCheck();
    }
  });

  const purgedAtStartup = purgeExpiredTrash(state, new Date());
  if (purgedAtStartup !== state) {
    const purgeSave = saveState(browserStorage ?? unavailableStorage, purgedAtStartup);
    if (purgeSave.saved) state = purgedAtStartup;
    else loaded.warning = purgeSave.error;
  }
  const initialChecked = runCalendarCheck(state, new Date(), true);
  if (initialChecked !== state) {
    const saved = saveState(browserStorage ?? unavailableStorage, initialChecked);
    if (saved.saved) state = initialChecked;
    else loaded.warning = saved.error;
  }
  showStatus(loaded.warning);
  renderAll();
  scheduleMidnightCheck();
})();
