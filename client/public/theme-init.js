/*
 * client/public/theme-init.js
 *
 * Applies the saved theme before the page first paints, so a dark-theme visitor
 * never sees a flash of the light theme. index.html loads it as a classic,
 * render-blocking script in <head>; the CSP (script-src 'self') allows this
 * same-origin file but would block the same code inline. Vite copies public/ to
 * the build unchanged.
 *
 * Same rule as client/src/lib/theme.ts, the runtime API: key "theme", dark only
 * when it holds "dark", light when storage is empty or unavailable.
 */
(function () {
  try {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    // Storage unavailable (blocked cookies, some private modes): keep the light default
  }
})();
