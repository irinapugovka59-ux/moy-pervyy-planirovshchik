(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  const collator = new Intl.Collator("ru-RU", { sensitivity: "base" });

  function makeId() {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `category-${random}`;
  }

  function sortCategories(categories) {
    return [...categories].sort((first, second) =>
      collator.compare(first.name, second.name) ||
      first.createdAt.localeCompare(second.createdAt) ||
      first.id.localeCompare(second.id));
  }

  function validateCategory(categories, input, excludedId = null) {
    const name = String(input.name ?? "").trim();
    const errors = {};
    if (!name) errors.name = "Введите название категории.";
    else if (name.length > 40) errors.name = "Название должно быть не длиннее 40 символов.";
    else if (categories.some((category) => category.id !== excludedId && collator.compare(category.name, name) === 0)) {
      errors.name = "Категория с таким названием уже существует.";
    }
    if (!/^#[0-9a-f]{6}$/i.test(String(input.color ?? ""))) errors.color = "Выберите корректный цвет.";
    return { valid: Object.keys(errors).length === 0, errors, name };
  }

  function createCategory(state, input, now = new Date()) {
    const validation = validateCategory(state.categories, input);
    if (!validation.valid) return { state, category: null, errors: validation.errors };
    const timestamp = now.toISOString();
    const category = {
      id: makeId(),
      name: validation.name,
      color: input.color,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return { state: { ...state, categories: [...state.categories, category] }, category, errors: {} };
  }

  function updateCategory(state, categoryId, input, now = new Date()) {
    const existing = state.categories.find(({ id }) => id === categoryId);
    if (!existing) return { state, category: null, errors: { form: "Категория не найдена." } };
    const validation = validateCategory(state.categories, input, categoryId);
    if (!validation.valid) return { state, category: existing, errors: validation.errors };
    const category = { ...existing, name: validation.name, color: input.color, updatedAt: now.toISOString() };
    return {
      state: { ...state, categories: state.categories.map((item) => item.id === categoryId ? category : item) },
      category,
      errors: {},
    };
  }

  function deleteCategory(state, categoryId) {
    if (!state.categories.some(({ id }) => id === categoryId)) return state;
    return {
      ...state,
      categories: state.categories.filter(({ id }) => id !== categoryId),
      tasks: state.tasks.map((task) => task.categoryId === categoryId ? { ...task, categoryId: null } : task),
      trash: state.trash.map((task) => task.categoryId === categoryId ? { ...task, categoryId: null } : task),
      series: state.series.map((series) => series.template.categoryId === categoryId
        ? { ...series, template: { ...series.template, categoryId: null } }
        : series),
    };
  }

  root.categoryService = Object.freeze({ createCategory, deleteCategory, sortCategories, updateCategory, validateCategory });
})();
