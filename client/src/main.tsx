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

// Apply the saved theme before the first render, on every page (the 404 page too).
// The CSP blocks inline scripts, so this can't run earlier from index.html.
applyTheme(getSavedTheme());

createRoot(document.getElementById("root")!).render(<App />);
