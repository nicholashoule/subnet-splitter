/**
 * client/src/App.tsx
 * 
 * Root React component. Sets up:
 * - React Router with wouter for client-side navigation
 * - Radix UI Tooltip provider for tooltip context
 * - Toast notifications system
 * - Error boundary for error handling
 *
 * Routes:
 * - / -> Calculator page (main application)
 * - /* -> Not Found page (404)
 */

import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";
import Calculator from "@/pages/calculator";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Calculator} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
