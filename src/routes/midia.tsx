import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, StatusTag } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, useInvalidate, useSignedUrls, useVideos } from "@/lib/data";

export const Route = createFileRoute("/midia")({
  head: () => ({
    meta: [
      { title: "Mídia — Fila IG" },
      { name: "description", content: "Vídeos com a cena vista pela IA, legenda e hashtags." },
      { property: "og:title", content: "Mídia — Fila IG" },
      { property: "og:description", content: "Vídeos com cena, legenda e hashtags geradas por IA." },
    ],
  }),
  component: Midia,
});

function duration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null);
      URL.revokeObjectURL(v.src);
    };
    v.onerror = () => resolve(null);
    v.src = URL.createObjectURL(file);
  });
}

function Midia() {
  const { data: videos = [] } = useVideos();
  const urls = useSignedUrls("videos", videos.map((v) => v.storage_path));
  const inv = useInvalidate();
  const [busy, setBusy] = useState(false);

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const [path, dur] = await Promise.all([uploadFile("videos", f), duration(f)]);
        const { error } = await supabase.from("videos").insert({ name: f.name, storage_path: path, duration_s: dur });
        if (error) throw error;
      }
      toast.success("Vídeo enviado. O worker gera a legenda.");
      inv("videos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "erro no upload");
    } finally {
      setBusy(false);
    }
  }

  async function regerar(id: string) {
    const { error } = await supabase.from("videos").update({ status: "regerar", last_error: null }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Pedido de nova legenda enviado ao worker");
      inv("videos");
    }
  }

  async function remover(id: string, path: string) {
    if (!confirm("Remover este vídeo?")) return;
    await supabase.storage.from("videos").remove([path]);
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else inv("videos");
  }

  return (
    <AppShell
      title={`Mídia (${videos.length})`}
      actions={
        <label>
          <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Upload className="h-3.5 w-3.5" />{busy ? "Enviando…" : "Subir vídeo"}
          </span>
          <input type="file" accept="video/mp4,video/quicktime,video/*" multiple hidden disabled={busy} onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
        </label>
      }
    >
      {videos.length === 0 && <p className="text-muted-foreground">Nenhum vídeo. Suba um mp4 vertical.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {videos.map((v) => (
          <article key={v.id} className="panel flex flex-col overflow-hidden">
            <div className="aspect-[9/12] bg-muted">
              {urls.data?.[v.storage_path] ? (
                <video src={`${urls.data[v.storage_path]}#t=0.5`} preload="metadata" muted playsInline controls className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center mono text-xs text-muted-foreground">sem miniatura</div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="mono truncate text-[11px] text-muted-foreground" title={v.name}>{v.name || v.storage_path}</span>
                <StatusTag status={v.status} />
              </div>
              <div>
                <p className="panel-title">Cena vista pela IA</p>
                <p>{v.scene_label || <span className="text-muted-foreground">aguardando worker…</span>}</p>
              </div>
              <div>
                <p className="panel-title">Legenda</p>
                <p className="whitespace-pre-wrap">{v.caption || <span className="text-muted-foreground">—</span>}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {v.hashtags.map((h) => <span key={h} className="tag tag-info">{h}</span>)}
              </div>
              {v.last_error && <p className="mono text-[11px] text-destructive">{v.last_error}</p>}
              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="mono text-[11px] text-muted-foreground">{v.duration_s ? `${v.duration_s}s` : ""}</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" disabled={v.status === "gerando" || v.status === "regerar"} onClick={() => regerar(v.id)}>
                    <RefreshCw className="h-3 w-3" /> Regerar legenda
                  </Button>
                  <button aria-label="remover" className="text-muted-foreground hover:text-destructive" onClick={() => remover(v.id, v.storage_path)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
