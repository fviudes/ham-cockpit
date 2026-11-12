import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Home from "@/pages/Home";
import Docs from "@/pages/Docs";
import Manual from "@/pages/Manual";
import Download from "@/pages/Download";
import LicensePage from "@/pages/LicensePage";
import BuyPage from "@/pages/BuyPage";
import BuyReturnPage from "@/pages/BuyReturnPage";
import AdminPortalPage from "@/pages/AdminPortalPage";
import { applyHtmlLang, readLang } from "@/console/lang-store";

applyHtmlLang(readLang());

/** Rotas do portal (Cloudflare Pages). Não inclui o console do dispositivo. */
function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/download"} component={Download} />
      <Route path={"/manual"} component={Manual} />
      <Route path={"/docs"} component={Docs} />
      <Route path={"/licenca"} component={LicensePage} />
      <Route path={"/comprar/retorno"} component={BuyReturnPage} />
      <Route path={"/comprar"} component={BuyPage} />
      <Route path={"/admin"} component={AdminPortalPage} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function PortalApp() {
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
