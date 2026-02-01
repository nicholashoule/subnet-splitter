/**
 * client/src/main.tsx
 * 
 * Application entry point. Renders the root React App component into the DOM.
 * Mounts to the element with id='root' in index.html.
 */

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
