import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { importAccounts } from "@/lib/accounts.functions";
import { parseAccounts, maskPassword } from "@/lib/ig";
import { useInvalidate } from "@/lib/data";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importar contas — Fila IG" },
      { name: "description", content: "Importe contas por CSV ou texto colado, com prévia antes de salvar." },
      { property: "og:title", content: "Importar contas — Fila IG" },
      { property: "og:description", content: "Importe contas por CSV ou texto colado." },
    ],
  }),
  component: Importar,
});

const HEADER = "username,password,totp_secret,proxy,profile_photo,story_link,sticker_text";

function Importar() {
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(importAccounts);
  const navigate = useNavigate();
  const inv = useInvalidate();
  const rows = useMemo(() => parseAccounts(text), [text]);
  const bad = rows.filter((r) => r.errors.length).length;

  async function readFile(f: File) {
    setText(await f.text());
  }

  async function salvar() {
    setBusy(true);
    try {
      const res = await save({ data: { rows: rows.map((r) => r.row) } });
      toast.success(`${res.created} nova(s), ${res.updated} atualizada(s)`);
      setText("");
      inv("accounts");
      navigate({ to: "/contas" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Importar">
      <div className="grid gap-4 lg:grid-cols-2">
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && readFile(e.dataTransfer.files[0]); }}
          className={`panel flex h-40 cursor-pointer flex-col items-center justify-center gap-1 border-dashed text-muted-foreground ${drag ? "border-primary text-foreground" : ""}`}
        >
          <span className="mono text-sm">solte o CSV aqui ou clique</span>
          <span className="text-[11px]">vírgula ou ponto e vírgula</span>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
        </label>
        <div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`${HEADER}\nmeuuser;minhasenha;JBSWY3DPEHPK3PXP;;;https://site.com/x;Clica aqui 😉❤️`}
            className="mono h-40 text-xs"
            spellCheck={false}
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Colunas: <span className="mono">{HEADER}</span>. username sem @. totp_secret é a chave base32, não o código de 6 dígitos.
      </p>

      <div className="panel mt-4 overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="panel-title">Prévia · {rows.length} linha(s){bad ? ` · ${bad} com erro` : ""}</p>
          <Button size="sm" disabled={!rows.length || !!bad || busy} onClick={salvar}>
            {busy ? "Salvando…" : "Salvar contas"}
          </Button>
        </div>
        <table className="dense-table mt-2">
          <thead>
            <tr><th>#</th><th>Usuário</th><th>Senha</th><th>TOTP</th><th>Proxy</th><th>Foto</th><th>Link story</th><th>Sticker</th><th>Problemas</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="text-muted-foreground">Nada para mostrar.</td></tr>}
            {rows.map((r) => (
              <tr key={r.line}>
                <td className="mono text-muted-foreground">{r.line}</td>
                <td className="mono">@{r.row.username}</td>
                <td className="mono text-muted-foreground">{maskPassword(r.row.password.slice(-2))}</td>
                <td className="mono">{r.row.totp_secret ? `${r.row.totp_secret.slice(0, 4)}…` : "—"}</td>
                <td className="mono">{r.row.proxy ? "sim" : "—"}</td>
                <td className="mono max-w-[140px] truncate">{r.row.profile_photo || "—"}</td>
                <td className="mono max-w-[160px] truncate">{r.row.story_link || "—"}</td>
                <td>{r.row.sticker_text || "—"}</td>
                <td className="text-destructive">{r.errors.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
