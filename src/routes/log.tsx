import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { useJobs } from "@/lib/data";

export const Route = createFileRoute("/log")({
  head: () => ({
    meta: [
      { title: "Log — Fila IG" },
      { name: "description", content: "Uma linha por etapa: hora, usuário e erro cru." },
      { property: "og:title", content: "Log — Fila IG" },
      { property: "og:description", content: "Registro de cada etapa executada na fila." },
    ],
  }),
  component: Log,
});

function Log() {
  const { data: jobs = [] } = useJobs(100);
  const lines = useMemo(
    () => jobs.flatMap((j) => j.log.map((l, i) => ({ ...l, key: `${j.id}-${i}` }))).sort((a, b) => (a.t < b.t ? 1 : -1)).slice(0, 600),
    [jobs],
  );
  return (
    <AppShell title="Log">
      <div className="panel overflow-x-auto">
        <table className="dense-table">
          <thead><tr><th>Hora</th><th>Usuário</th><th>Etapa</th><th /><th>Mensagem</th></tr></thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={5} className="text-muted-foreground">Sem registros ainda.</td></tr>}
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="mono whitespace-nowrap text-muted-foreground">{new Date(l.t).toLocaleString("pt-BR")}</td>
                <td className="mono">@{l.username}</td>
                <td className="mono">{l.step}</td>
                <td><span className={`tag ${l.level === "ok" ? "tag-ok" : l.level === "erro" ? "tag-err" : ""}`}>{l.level}</span></td>
                <td className={`mono max-w-[720px] break-words ${l.level === "erro" ? "text-destructive/90" : ""}`}>{l.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
