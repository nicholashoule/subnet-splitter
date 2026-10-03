/**
 * client/src/lib/theme.ts
 *
 * Light/dark theme shared by every page. The choice is saved in localStorage under
 * "theme" (the API docs page reads the same key); light is the default.
 * Storage can be unavailable (blocked cookies, some private modes), so reads fall
 * back to light and writes are skipped instead of throwing.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

export function getSavedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the theme lasts until the page is closed
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}
