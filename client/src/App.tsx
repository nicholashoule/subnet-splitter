/**
 * client/src/App.tsx
 *
 * Root React component. Sets up:
 * - Radix UI Tooltip provider for tooltip context
 * - Toast notifications system
 * - Error boundary for error handling
 *
 * Routes (single page, so no router library is needed):
 * - / -> Calculator page (main application)
 * - /* -> Not Found page (404)
 */

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Calculator from "@/pages/calculator";

function App() {
  const isHome = window.location.pathname === "/";
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        {isHome ? <Calculator /> : <NotFound />}
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
