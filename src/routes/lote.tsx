import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell, StatusTag } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBatch, uploadFile, useAccounts, useVideos } from "@/lib/data";
import {
  DEFAULT_PAUSE_S, DEFAULT_STICKER_TEXT, MIN_PAUSE_S, STEPS, STEP_LABEL, STICKER_MAX, clampPause, validateUrl, type StepName,
} from "@/lib/ig";

export const Route = createFileRoute("/lote")({
  validateSearch: (s: Record<string, unknown>) => ({ ids: typeof s.ids === "string" ? s.ids : "" }),
  head: () => ({
    meta: [
      { title: "Lote — Fila IG" },
      { name: "description", content: "Monte um lote: contas, vídeos, link do story, etapas e pausa entre contas." },
      { property: "og:title", content: "Lote — Fila IG" },
      { property: "og:description", content: "Monte e enfileire um lote de contas." },
    ],
  }),
  component: Lote,
});

function Lote() {
  const { ids } = Route.useSearch();
  const navigate = useNavigate();
  const { data: accounts = [] } = useAccounts();
  const { data: videos = [] } = useVideos();
  const [accSel, setAccSel] = useState<Set<string>>(new Set(ids ? ids.split(",") : []));
  const [vidSel, setVidSel] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState<Set<StepName>>(new Set(STEPS));
  const [link, setLink] = useState("");
  const [sticker, setSticker] = useState(DEFAULT_STICKER_TEXT);
  const [pause, setPause] = useState(DEFAULT_PAUSE_S);
  const [dry, setDry] = useState(true);
  const [cont, setCont] = useState(true);
  const [photoMode, setPhotoMode] = useState<"conta" | "mesma">("conta");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [storyMedia, setStoryMedia] = useState<"video" | "imagem">("imagem");
  const [storyImg, setStoryImg] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ids) setAccSel(new Set(ids.split(",")));
  }, [ids]);

  const flip = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    apply(n);
  };

  async function enfileirar() {
    if (!accSel.size) return toast.error("Escolha ao menos uma conta");
    if (steps.has("postar_reel") && !vidSel.size) return toast.error("Escolha ao menos um vídeo para o Reel");
    if (steps.has("postar_story")) {
      if (!link) return toast.error("Informe o link do story");
      const e = validateUrl(link);
      if (e) return toast.error(e);
      if (!sticker.trim()) return toast.error("Texto do sticker vazio");
    }
    if (steps.has("foto_perfil") && photoMode === "mesma" && !photoFile) return toast.error("Envie a foto do lote");
    if (steps.has("postar_story") && storyMedia === "video" && !vidSel.size) return toast.error("Story em vídeo precisa de um vídeo selecionado");
    setBusy(true);
    try {
      const photoPath = photoMode === "mesma" && photoFile ? `storage:fotos/${await uploadFile("fotos", photoFile)}` : null;
      const storyImagePath = storyMedia === "imagem" && storyImg ? `storage:fotos/${await uploadFile("fotos", storyImg)}` : null;
      await createBatch({
        accountIds: [...accSel],
        videoIds: [...vidSel],
        steps: STEPS.filter((s) => steps.has(s)),
        dryRun: dry,
        pauseS: clampPause(pause),
        continueOnStepError: cont,
        storyLink: link,
        stickerText: sticker.trim(),
        photoPath,
        storyMedia,
        storyImagePath,
      });
      toast.success(`${accSel.size} conta(s) na fila${dry ? " (dry-run)" : ""}`);
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Lote" actions={<Button size="sm" onClick={enfileirar} disabled={busy}>{busy ? "Enfileirando…" : "Enfileirar lote"}</Button>}>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="panel-title">Contas ({accSel.size}/{accounts.length})</p>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAccSel(accSel.size === accounts.length ? new Set() : new Set(accounts.map((a) => a.id)))}>todas/nenhuma</button>
          </div>
          <div className="max-h-64 space-y-1 overflow-auto">
            {accounts.map((a) => (
              <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/40">
                <input type="checkbox" checked={accSel.has(a.id)} onChange={() => flip(accSel, a.id, setAccSel)} />
                <span className="mono">@{a.username}</span>
                <StatusTag status={a.status} />
              </label>
            ))}
            {!accounts.length && <p className="text-muted-foreground">Sem contas.</p>}
          </div>
        </section>

        <section className="panel p-4">
          <p className="panel-title mb-2">Vídeos para o Reel ({vidSel.size})</p>
          <div className="max-h-64 space-y-1 overflow-auto">
            {videos.map((v) => (
              <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/40">
                <input type="checkbox" checked={vidSel.has(v.id)} onChange={() => flip(vidSel, v.id, setVidSel)} />
                <span className="mono truncate">{v.name || v.storage_path}</span>
                <span className="truncate text-muted-foreground">{v.scene_label ?? "sem legenda ainda"}</span>
              </label>
            ))}
            {!videos.length && <p className="text-muted-foreground">Sem vídeos.</p>}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Cada vídeo marcado vira um Reel em cada conta. O mesmo vídeo pode ir para várias contas.</p>
        </section>

        <section className="panel space-y-3 p-4">
          <p className="panel-title">Etapas</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {STEPS.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input type="checkbox" checked={steps.has(s)} onChange={() => flip(steps, s, setSteps)} />
                {STEP_LABEL[s]} <span className="mono text-[10.5px] text-muted-foreground">{s}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Mesmo sem "Login" marcado, o worker precisa de uma sessão válida para as outras etapas.</p>

          <p className="panel-title pt-2">Foto de perfil</p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5"><input type="radio" checked={photoMode === "conta"} onChange={() => setPhotoMode("conta")} /> uma por conta (coluna/Contas)</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={photoMode === "mesma"} onChange={() => setPhotoMode("mesma")} /> a mesma para o lote</label>
          </div>
          {photoMode === "mesma" && <Input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />}
        </section>

        <section className="panel space-y-3 p-4">
          <p className="panel-title">Story com link</p>
          <Input placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
          <div>
            <Input value={sticker} maxLength={STICKER_MAX} onChange={(e) => setSticker(e.target.value)} />
            <p className="mono mt-1 text-[10.5px] text-muted-foreground">{sticker.length}/{STICKER_MAX} · texto do pill (sticker nativo, não desenhado na imagem)</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5"><input type="radio" checked={storyMedia === "imagem"} onChange={() => setStoryMedia("imagem")} /> foto 1080×1920</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={storyMedia === "video"} onChange={() => setStoryMedia("video")} /> primeiro vídeo marcado</label>
          </div>
          {storyMedia === "imagem" && (
            <div>
              <Input type="file" accept="image/*" onChange={(e) => setStoryImg(e.target.files?.[0] ?? null)} />
              <p className="mt-1 text-[11px] text-muted-foreground">Sem imagem enviada, usa a foto de perfil da conta.</p>
            </div>
          )}
        </section>

        <section className="panel space-y-3 p-4 xl:col-span-2">
          <p className="panel-title">Execução</p>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2">
              pausa entre contas (s)
              <Input type="number" min={MIN_PAUSE_S} value={pause} onChange={(e) => setPause(Number(e.target.value))} onBlur={() => setPause(clampPause(pause))} className="mono h-8 w-24" />
              <span className="text-[11px] text-muted-foreground">mín. {MIN_PAUSE_S}</span>
            </label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={dry} onChange={(e) => setDry(e.target.checked)} /> dry-run <span className="text-[11px] text-muted-foreground">(login, valida URL, gera legenda; não troca foto, não converte, não posta)</span></label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={cont} onChange={(e) => setCont(e.target.checked)} /> pular etapa que falhar e seguir</label>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
