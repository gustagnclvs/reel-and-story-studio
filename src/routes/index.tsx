import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell, StatusTag } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { setBatchStatus, useAccounts, useBatches, useInvalidate, useJobs } from "@/lib/data";
import { STEP_LABEL, type StepName } from "@/lib/ig";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início — Fila IG" },
      { name: "description", content: "Resumo da fila: contas na fila, ok, erro e job rodando agora." },
      { property: "og:title", content: "Início — Fila IG" },
      { property: "og:description", content: "Resumo da fila de contas do Instagram." },
    ],
  }),
  component: Home,
});

function Home() {
  const jobs = useJobs(300);
  const accounts = useAccounts();
  const batches = useBatches();
  const inv = useInvalidate();
  const list = jobs.data ?? [];
  const user = new Map((accounts.data ?? []).map((a) => [a.id, a.username]));
  const running = list.find((j) => j.status === "rodando");
  const count = (s: string) => list.filter((j) => j.status === s).length;
  const active = (batches.data ?? []).filter((b) => ["fila", "rodando", "pausado"].includes(b.status));

  async function ctl(id: string, s: "pausado" | "rodando" | "parado") {
    try {
      await setBatchStatus(id, s);
      inv("batches", "jobs");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "erro");
    }
  }

  return (
    <AppShell title="Início">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Na fila" value={count("fila")} />
        <Stat label="Rodando" value={count("rodando")} tone="text-info" />
        <Stat label="OK" value={count("ok")} tone="text-success" />
        <Stat label="Erro" value={count("erro")} tone="text-destructive" />
      </div>

      <section className="panel mt-4 p-4">
        <p className="panel-title mb-2">Rodando agora</p>
        {running ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="mono text-base">@{user.get(running.account_id) ?? "?"}</span>
            <StatusTag status="rodando" />
            <span className="text-muted-foreground">etapa</span>
            <span className="mono">{running.step_atual ? STEP_LABEL[running.step_atual as StepName] ?? running.step_atual : "iniciando"}</span>
            <span className="mono text-muted-foreground">desde {running.started_at ? new Date(running.started_at).toLocaleTimeString("pt-BR") : "-"}</span>
            {running.log.at(-1) && <span className="mono truncate text-xs text-muted-foreground">› {running.log.at(-1)!.msg}</span>}
          </div>
        ) : (
          <p className="text-muted-foreground">Nenhum job rodando. O worker pega o próximo da fila sozinho.</p>
        )}
      </section>

      <section className="panel mt-4">
        <p className="panel-title px-4 pt-3">Lotes ativos</p>
        <table className="dense-table mt-2">
          <thead>
            <tr><th>Criado</th><th>Status</th><th>Modo</th><th>Pausa</th><th>Etapas</th><th /></tr>
          </thead>
          <tbody>
            {active.length === 0 && (
              <tr><td colSpan={6} className="text-muted-foreground">Nenhum lote ativo.</td></tr>
            )}
            {active.map((b) => {
              const cfg = (b.config ?? {}) as { steps?: string[] };
              return (
                <tr key={b.id}>
                  <td className="mono">{new Date(b.created_at).toLocaleString("pt-BR")}</td>
                  <td><StatusTag status={b.status} /></td>
                  <td>{b.dry_run ? <span className="tag tag-warn">dry-run</span> : <span className="tag tag-info">real</span>}</td>
                  <td className="mono">{b.pause_s}s</td>
                  <td className="mono text-muted-foreground">{(cfg.steps ?? []).join(" · ")}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {b.status === "pausado" ? (
                        <Button size="sm" variant="secondary" onClick={() => ctl(b.id, "rodando")}>Retomar</Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => ctl(b.id, "pausado")}>Pausar</Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => ctl(b.id, "parado")}>Parar</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="panel p-4">
      <p className="panel-title">{label}</p>
      <p className={`mono mt-1 text-3xl ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
