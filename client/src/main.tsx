/**
 * client/src/main.tsx
 *
 * Application entry point. Renders the root React App component into the DOM.
 * Mounts to the element with id='root' in index.html.
 */

import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, getSavedTheme } from "./lib/theme";
import "./index.css";

// public/theme-init.js, loaded by index.html, already applied the saved theme before
// first paint (a same-origin file, which the CSP's script-src 'self' allows). Applying
// it again here keeps every page (the 404 page too) right if that file failed to load.
applyTheme(getSavedTheme());

createRoot(document.getElementById("root")!).render(<App />);
