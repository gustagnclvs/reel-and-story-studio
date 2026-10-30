import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell, StatusTag } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createBatch, uploadFile, useAccounts, useInvalidate } from "@/lib/data";
import { MIN_PAUSE_S, STEPS, STEP_LABEL, maskPassword } from "@/lib/ig";

export const Route = createFileRoute("/contas")({
  head: () => ({
    meta: [
      { title: "Contas — Fila IG" },
      { name: "description", content: "Contas do Instagram com status de cada etapa." },
      { property: "og:title", content: "Contas — Fila IG" },
      { property: "og:description", content: "Contas do Instagram com status de cada etapa." },
    ],
  }),
  component: Contas,
});

function Contas() {
  const { data = [], isLoading } = useAccounts();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const inv = useInvalidate();

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function conectar(id: string) {
    try {
      await createBatch({
        accountIds: [id], videoIds: [], steps: ["login"], dryRun: false, pauseS: MIN_PAUSE_S,
        continueOnStepError: true, storyLink: "", stickerText: "", photoPath: null, storyMedia: "imagem", storyImagePath: null,
      });
      toast.success("Login enfileirado");
      inv("jobs", "batches");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "erro");
    }
  }

  async function foto(id: string, file: File) {
    try {
      const path = await uploadFile("fotos", file);
      const { error } = await supabase.from("accounts").update({ profile_photo_url: `storage:fotos/${path}` }).eq("id", id);
      if (error) throw error;
      toast.success("Foto da conta salva");
      inv("accounts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "erro");
    }
  }

  async function remover(id: string, username: string) {
    if (!confirm(`Remover @${username}?`)) return;
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else inv("accounts");
  }

  return (
    <AppShell
      title={`Contas (${data.length})`}
      actions={
        <Button size="sm" disabled={!sel.size} onClick={() => navigate({ to: "/lote", search: { ids: [...sel].join(",") } })}>
          Rodar lote ({sel.size})
        </Button>
      }
    >
      <div className="panel overflow-x-auto">
        <table className="dense-table">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="todas" checked={!!data.length && sel.size === data.length} onChange={(e) => setSel(e.target.checked ? new Set(data.map((a) => a.id)) : new Set())} /></th>
              <th>Usuário</th><th>Senha</th><th>2FA</th><th>Status</th>
              {STEPS.map((s) => <th key={s}>{STEP_LABEL[s]}</th>)}
              <th>Último erro</th><th />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={12} className="text-muted-foreground">carregando…</td></tr>}
            {!isLoading && data.length === 0 && (
              <tr><td colSpan={12} className="text-muted-foreground">Nenhuma conta. Use Importar.</td></tr>
            )}
            {data.map((a) => (
              <tr key={a.id}>
                <td><input type="checkbox" aria-label={`selecionar ${a.username}`} checked={sel.has(a.id)} onChange={() => toggle(a.id)} /></td>
                <td className="mono">@{a.username}</td>
                <td className="mono text-muted-foreground">{maskPassword(a.password_last2)}</td>
                <td>{a.has_totp ? <span className="tag tag-ok">totp</span> : <span className="tag">sem</span>}</td>
                <td><StatusTag status={a.status} /></td>
                {STEPS.map((s) => {
                  const st = a.steps_state?.[s];
                  return (
                    <td key={s} title={st?.msg ?? ""}>
                      {st ? <span className={`tag ${st.ok ? "tag-ok" : "tag-err"}`}>{st.ok ? "ok" : "erro"}</span> : <span className="text-muted-foreground">·</span>}
                    </td>
                  );
                })}
                <td className="max-w-[260px] truncate mono text-destructive/90" title={a.last_error ?? ""}>{a.last_error ?? ""}</td>
                <td>
                  <div className="flex items-center justify-end gap-1.5">
                    <label className="tag cursor-pointer hover:text-foreground" title={a.profile_photo_url ? "trocar foto desta conta" : "foto desta conta"}>
                      <ImagePlus className="h-3 w-3" />{a.profile_photo_url ? "foto ✓" : "foto"}
                      <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && foto(a.id, e.target.files[0])} />
                    </label>
                    <Button size="sm" variant="secondary" onClick={() => conectar(a.id)}>Conectar</Button>
                    <button aria-label="remover" className="text-muted-foreground hover:text-destructive" onClick={() => remover(a.id, a.username)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
