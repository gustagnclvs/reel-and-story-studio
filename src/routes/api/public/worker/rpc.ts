import { createFileRoute } from "@tanstack/react-router";

// Endpoint used ONLY by the Python worker (/worker). It is public by prefix,
// so every request must carry the shared WORKER_TOKEN. The Instagram
// credentials stay encrypted here; the worker decrypts them with IG_ENC_KEY.

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ACCOUNT_PATCH = ["status", "last_error", "steps_state", "sessionid_enc"];
const JOB_PATCH = ["status", "step_atual", "started_at", "finished_at"];
const VIDEO_PATCH = ["scene_label", "caption", "hashtags", "status", "last_error", "duration_s"];

function pick(obj: Record<string, unknown> | undefined, allowed: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of allowed) if (obj && k in obj) out[k] = obj[k];
  return out;
}

export const Route = createFileRoute("/api/public/worker/rpc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env['WORKER_TOKEN'];
        const auth = request.headers.get("authorization") ?? "";
        if (!token || !auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), token)) {
          return json({ error: "unauthorized" }, 401);
        }
        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const nowIso = () => new Date().toISOString();

        try {
          switch (body.op) {
            case "reset_stale": {
              await db
                .from("jobs")
                .update({ status: "erro", finished_at: nowIso() })
                .eq("status", "rodando");
              return json({ ok: true });
            }

            case "claim_job": {
              // jobs of stopped batches never run
              const { data: stopped } = await db.from("batches").select("id").eq("status", "parado");
              const stoppedIds = (stopped ?? []).map((b: any) => b.id);
              if (stoppedIds.length) {
                await db
                  .from("jobs")
                  .update({ status: "erro", finished_at: nowIso() })
                  .in("batch_id", stoppedIds)
                  .eq("status", "fila");
              }
              const { data: queued } = await db
                .from("jobs")
                .select("*")
                .eq("status", "fila")
                .order("created_at", { ascending: true })
                .limit(200);
              const batchIds = [...new Set((queued ?? []).map((j: any) => j.batch_id).filter(Boolean))];
              const { data: batches } = batchIds.length
                ? await db.from("batches").select("*").in("id", batchIds)
                : { data: [] };
              const bmap = new Map<string, any>((batches ?? []).map((b: any) => [b.id, b]));
              let wait = Infinity;
              let chosen: any = null;
              for (const j of queued ?? []) {
                const b = j.batch_id ? bmap.get(j.batch_id) : null;
                if (b && (b.status === "pausado" || b.status === "parado")) continue;
                if (b && !body.force && b.last_job_finished_at) {
                  const left = b.pause_s - (Date.now() - new Date(b.last_job_finished_at).getTime()) / 1000;
                  if (left > 0) {
                    wait = Math.min(wait, left);
                    continue;
                  }
                }
                chosen = j;
                break;
              }
              if (!chosen) return json({ job: null, wait_s: Number.isFinite(wait) ? Math.ceil(wait) : null });
              const { data: claimed } = await db
                .from("jobs")
                .update({ status: "rodando", started_at: nowIso(), step_atual: null })
                .eq("id", chosen.id)
                .eq("status", "fila")
                .select("*")
                .maybeSingle();
              if (!claimed) return json({ job: null, wait_s: 1 });
              if (chosen.batch_id) await db.from("batches").update({ status: "rodando" }).eq("id", chosen.batch_id);
              const { data: account } = await db.from("accounts").select("*").eq("id", chosen.account_id).single();
              const vids: string[] = chosen.params?.video_ids ?? (chosen.video_id ? [chosen.video_id] : []);
              const { data: videos } = vids.length ? await db.from("videos").select("*").in("id", vids) : { data: [] };
              const order = new Map(vids.map((v, i) => [v, i]));
              (videos ?? []).sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
              return json({ job: claimed, account, batch: chosen.batch_id ? bmap.get(chosen.batch_id) : null, videos: videos ?? [] });
            }

            case "batch_status": {
              const { data } = await db.from("batches").select("status").eq("id", body.id).maybeSingle();
              return json({ status: data?.status ?? null });
            }

            case "update_job": {
              await db.from("jobs").update(pick(body.patch, JOB_PATCH)).eq("id", body.id);
              return json({ ok: true });
            }

            case "append_log": {
              const { data } = await db.from("jobs").select("log").eq("id", body.id).single();
              const log = [...(data?.log ?? []), ...(body.entries ?? [])].slice(-300);
              await db.from("jobs").update({ log }).eq("id", body.id);
              return json({ ok: true });
            }

            case "update_account": {
              await db.from("accounts").update(pick(body.patch, ACCOUNT_PATCH)).eq("id", body.id);
              return json({ ok: true });
            }

            case "finish_job": {
              if (body.batch_id) {
                await db.from("batches").update({ last_job_finished_at: nowIso() }).eq("id", body.batch_id);
                const { count } = await db
                  .from("jobs")
                  .select("id", { count: "exact", head: true })
                  .eq("batch_id", body.batch_id)
                  .in("status", ["fila", "rodando"]);
                if (!count) {
                  await db.from("batches").update({ status: "ok" }).eq("id", body.batch_id).in("status", ["rodando", "fila"]);
                }
              }
              return json({ ok: true });
            }

            case "claim_video": {
              const { data } = await db
                .from("videos")
                .select("*")
                .in("status", ["pendente", "regerar"])
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              if (!data) return json({ video: null });
              await db.from("videos").update({ status: "gerando" }).eq("id", data.id);
              return json({ video: data });
            }

            case "get_video": {
              const { data } = await db.from("videos").select("*").eq("id", body.id).maybeSingle();
              return json({ video: data });
            }

            case "update_video": {
              await db.from("videos").update(pick(body.patch, VIDEO_PATCH)).eq("id", body.id);
              return json({ ok: true });
            }

            case "signed_url": {
              if (!["videos", "fotos"].includes(body.bucket)) return json({ error: "bucket" }, 400);
              const { data, error } = await db.storage.from(body.bucket).createSignedUrl(body.path, 600);
              if (error) return json({ error: error.message }, 404);
              return json({ url: data.signedUrl });
            }

            default:
              return json({ error: "unknown op" }, 400);
          }
        } catch (e) {
          console.error("worker rpc error", body?.op, e instanceof Error ? e.message : e);
          return json({ error: "internal" }, 500);
        }
      },
    },
  },
});
