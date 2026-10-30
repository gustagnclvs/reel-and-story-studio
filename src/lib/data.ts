import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StepName } from "./ig";

export type LogEntry = { t: string; step: string; username: string; level: "ok" | "erro" | "info"; msg: string };

export type AccountRow = {
  id: string;
  username: string;
  password_last2: string;
  has_totp: boolean;
  has_session: boolean;
  proxy: string | null;
  profile_photo_url: string | null;
  story_link: string | null;
  sticker_text: string;
  status: string;
  steps_state: Partial<Record<StepName, { ok: boolean; at: string; msg?: string }>>;
  last_error: string | null;
  updated_at: string;
};

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts_safe").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AccountRow[];
    },
  });
}

export function useJobs(limit = 200) {
  return useQuery({
    queryKey: ["jobs", limit],
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, account_id, batch_id, video_id, status, step_atual, steps, log, created_at, started_at, finished_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((j) => ({ ...j, log: (j.log ?? []) as unknown as LogEntry[], steps: (j.steps ?? []) as unknown as string[] }));
    },
  });
}

export function useBatches() {
  return useQuery({
    queryKey: ["batches"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVideos() {
  return useQuery({
    queryKey: ["videos"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from("videos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSignedUrls(bucket: string, paths: string[]) {
  return useQuery({
    queryKey: ["signed", bucket, paths],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export async function setBatchStatus(id: string, status: "pausado" | "rodando" | "parado") {
  const { error } = await supabase.from("batches").update({ status }).eq("id", id);
  if (error) throw error;
  if (status === "parado") {
    await supabase.from("jobs").update({ status: "erro", finished_at: new Date().toISOString() }).eq("batch_id", id).eq("status", "fila");
  }
}

export type BatchInput = {
  accountIds: string[];
  videoIds: string[];
  steps: StepName[];
  dryRun: boolean;
  pauseS: number;
  continueOnStepError: boolean;
  storyLink: string;
  stickerText: string;
  photoPath: string | null;
  storyMedia: "video" | "imagem";
  storyImagePath: string | null;
};

export async function createBatch(b: BatchInput) {
  const { data: batch, error } = await supabase
    .from("batches")
    .insert({
      dry_run: b.dryRun,
      pause_s: b.pauseS,
      continue_on_step_error: b.continueOnStepError,
      config: {
        steps: b.steps,
        video_ids: b.videoIds,
        story_link: b.storyLink || null,
        sticker_text: b.stickerText || null,
        story_media: b.storyMedia,
      },
    })
    .select("id")
    .single();
  if (error) throw error;
  const jobs = b.accountIds.map((account_id) => ({
    batch_id: batch.id,
    account_id,
    video_id: b.videoIds[0] ?? null,
    steps: b.steps,
    params: {
      video_ids: b.videoIds,
      story_link: b.storyLink || null,
      sticker_text: b.stickerText || null,
      photo_path: b.photoPath,
      story_media: b.storyMedia,
      story_image_path: b.storyImagePath,
    },
  }));
  const { error: jErr } = await supabase.from("jobs").insert(jobs);
  if (jErr) throw jErr;
  return batch.id;
}

export async function uploadFile(bucket: "videos" | "fotos", file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, file.type ? { contentType: file.type } : {});
  if (error) throw error;
  return path;
}
