(() => {
  "use strict";

  const root = (globalThis.PlannerIra ??= {});
  root.config = Object.freeze({
    APP_NAME: "Планировщик Иры",
    STORAGE_KEY: "planner-ira:state",
    EMERGENCY_KEY_PREFIX: "planner-ira:recovery",
    SCHEMA_VERSION: 1,
    DEFAULT_CATEGORIES: Object.freeze([
      Object.freeze({ id: "category-personal", name: "Личные", color: "#79bfb0" }),
      Object.freeze({ id: "category-work", name: "Рабочие", color: "#5e9fa5" }),
    ]),
  });
})();
