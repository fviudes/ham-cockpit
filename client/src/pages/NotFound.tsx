import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useSiteLang } from "./site-lang";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { t } = useSiteLang();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0d1b2a]">
      <Card className="mx-4 w-full max-w-lg border-[rgba(79,195,247,0.16)] bg-[#0b1520]">
        <CardContent className="pb-8 pt-8 text-center">
          <div className="mb-6 flex justify-center">
            <AlertCircle className="h-16 w-16 text-[#4fc3f7]" />
          </div>
          <h1 className="mb-2 font-['Space_Grotesk'] text-4xl font-bold text-white">404</h1>
          <h2 className="mb-4 text-xl font-semibold text-[#c5d4e0]">
            {t({ pt: "Página não encontrada", en: "Page not found" })}
          </h2>
          <p className="mb-8 leading-relaxed text-[#94a3b8]">
            {t({
              pt: "Essa rota não existe. Pode ter sido movida ou apagada.",
              en: "That route does not exist. It may have been moved or deleted.",
            })}
          </p>
          <Button
            onClick={() => setLocation("/")}
            className="rounded-lg bg-[#4fc3f7] px-6 py-2.5 text-[#0d1b2a] hover:bg-[#80d8ff]"
          >
            <Home className="mr-2 h-4 w-4" />
            {t({ pt: "Voltar ao início", en: "Back to home" })}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
