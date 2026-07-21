// theme.js
// Alternancia de tema claro/oscuro, compartida por index.html y theory.html.
// El tema inicial se fija en un pequeño script inline en el <head> de cada
// página (para evitar el parpadeo de color al cargar); aquí solo cableamos el
// botón y persistimos la preferencia en localStorage.
//
// Script clásico (sin import/export): ver nota en body.js.

(function () {
  window.NB = window.NB || {};

  const STORAGE_KEY = "orbitas-newton:tema";

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* almacenamiento no disponible: el tema simplemente no persiste */
    }
    updateToggleIcon(theme);
  }

  function updateToggleIcon(theme) {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    // El icono muestra el tema al que se cambiará al pulsar.
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
    btn.setAttribute(
      "aria-label",
      theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
    );
    btn.title = btn.getAttribute("aria-label");
  }

  function initTheme() {
    updateToggleIcon(currentTheme());
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    }
  }

  window.NB.applyTheme = applyTheme;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})();
