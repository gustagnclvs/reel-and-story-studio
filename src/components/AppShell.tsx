import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Activity, FileUp, Film, Layers, LogOut, ScrollText, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const NAV = [
  { to: "/", label: "Início", icon: Activity },
  { to: "/contas", label: "Contas", icon: Users },
  { to: "/importar", label: "Importar", icon: FileUp },
  { to: "/midia", label: "Mídia", icon: Film },
  { to: "/lote", label: "Lote", icon: Layers },
  { to: "/log", label: "Log", icon: ScrollText },
] as const;

export function AppShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { user, loading, isOperator, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user || isOperator === null) {
    return <div className="flex min-h-screen items-center justify-center mono text-muted-foreground">carregando…</div>;
  }

  if (!isOperator) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="mono text-sm">Esta conta não é operadora deste painel.</p>
        <button className="tag" onClick={signOut}>sair</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-48 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-12 items-center gap-2 border-b border-sidebar-border px-4">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="mono text-sm font-medium tracking-wide">FILA IG</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-primary" }}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <p className="mono truncate text-[10.5px] text-muted-foreground">{user.email}</p>
          <button onClick={signOut} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="h-3 w-3" /> sair
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur">
          <h1 className="text-sm font-semibold">{title}</h1>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <div className="p-5">{children}</div>
      </main>
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const cls =
    status === "ok" || status === "pronta" || status === "conectada"
      ? "tag-ok"
      : status === "erro" || status === "parado"
        ? "tag-err"
        : status === "rodando" || status === "gerando"
          ? "tag-info"
          : status === "pausado" || status === "regerar"
            ? "tag-warn"
            : "";
  return <span className={`tag ${cls}`}>{status}</span>;
}
