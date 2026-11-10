import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Docs from "./pages/Docs";
import Console from "./pages/Console";
import VfoDisplay from "./pages/VfoDisplay";
import { applyHtmlLang, readLang } from "./console/lang-store";

applyHtmlLang(readLang());

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/docs"} component={Docs} />
      <Route path={"/console/vfo-display"} component={VfoDisplay} />
      <Route path={"/console"} component={Console} />
      <Route path={"/console/:page"} component={Console} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
