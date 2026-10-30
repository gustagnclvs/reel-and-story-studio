import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Fila IG" },
      { name: "description", content: "Acesso do operador ao painel Fila IG." },
      { property: "og:title", content: "Entrar — Fila IG" },
      { property: "og:description", content: "Acesso do operador ao painel Fila IG." },
    ],
  }),
  component: Login,
});

function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) toast.success("Cadastro criado. Confirme pelo e-mail e depois entre.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-3 p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="mono text-sm font-medium tracking-wide">FILA IG</span>
        </div>
        <p className="panel-title">{mode === "in" ? "login do operador" : "criar operador"}</p>
        <Input type="email" required placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" required minLength={8} placeholder="senha (mín. 8)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy}>
          {mode === "in" ? "Entrar" : "Cadastrar"}
        </Button>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Primeiro acesso? Criar operador" : "Já tenho conta"}
        </button>
        {mode === "up" && (
          <p className="text-[11px] text-muted-foreground">Só o primeiro cadastro vira operador. Os seguintes não enxergam nada.</p>
        )}
      </form>
    </div>
  );
}
