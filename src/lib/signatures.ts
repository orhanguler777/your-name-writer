import { supabase } from "@/integrations/supabase/client";

// Fotoğraflarla aynı public bucket; imzalar denetim id'sine bağlı sabit yola yazılır.
const BUCKET = "attachments";
const base = (inspectionId: string) => `signatures/${inspectionId}`;

export interface SignatureCapture {
  inspectorDataUrl?: string | null;
  merchantDataUrl?: string | null;
  merchantName?: string | null;
  declined?: boolean;
}

export interface LoadedSignatures {
  inspectorUrl?: string | null;
  merchantUrl?: string | null;
  merchantName?: string | null;
  declined?: boolean;
  signedAt?: string | null;
  hasAny: boolean;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

/** İmzalı tutanak PDF'ini storage'a arşivler ve public URL'ini döner. */
export async function uploadTutanakPdf(inspectionId: string, blob: Blob): Promise<string> {
  const path = `tutanak/${inspectionId}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** İmzaları (memur + esnaf) ve meta bilgisini denetim id klasörüne yükler. */
export async function uploadSignatures(inspectionId: string, cap: SignatureCapture): Promise<void> {
  const b = base(inspectionId);
  const tasks: Promise<unknown>[] = [];

  if (cap.inspectorDataUrl) {
    const blob = await dataUrlToBlob(cap.inspectorDataUrl);
    tasks.push(
      supabase.storage.from(BUCKET).upload(`${b}/inspector.png`, blob, { upsert: true, contentType: "image/png" })
    );
  }
  if (cap.merchantDataUrl && !cap.declined) {
    const blob = await dataUrlToBlob(cap.merchantDataUrl);
    tasks.push(
      supabase.storage.from(BUCKET).upload(`${b}/merchant.png`, blob, { upsert: true, contentType: "image/png" })
    );
  }

  const meta = {
    merchantName: cap.merchantName ?? null,
    declined: !!cap.declined,
    signedAt: new Date().toISOString(),
    hasInspector: !!cap.inspectorDataUrl,
    hasMerchant: !!cap.merchantDataUrl && !cap.declined,
  };
  const metaBlob = new Blob([JSON.stringify(meta)], { type: "application/json" });
  tasks.push(
    supabase.storage.from(BUCKET).upload(`${b}/meta.json`, metaBlob, { upsert: true, contentType: "application/json" })
  );

  await Promise.all(tasks);
}

/**
 * Bir denetim için kayıtlı imzaları getirir. Public URL üzerinden meta.json okunur
 * (public bucket okuması RLS'e takılmaz); imza görselleri de public URL olarak döner.
 */
export async function loadSignatures(inspectionId?: string | null): Promise<LoadedSignatures> {
  if (!inspectionId) return { hasAny: false };
  const b = base(inspectionId);
  const pub = (name: string) => supabase.storage.from(BUCKET).getPublicUrl(`${b}/${name}`).data.publicUrl;

  let meta: {
    merchantName?: string | null;
    declined?: boolean;
    signedAt?: string | null;
    hasInspector?: boolean;
    hasMerchant?: boolean;
  } | null = null;

  try {
    const res = await fetch(pub("meta.json") + `?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) meta = await res.json();
  } catch {
    /* meta yoksa/okunamazsa imza yok kabul edilir */
  }

  if (!meta) return { hasAny: false };

  return {
    inspectorUrl: meta.hasInspector ? pub("inspector.png") : null,
    merchantUrl: meta.hasMerchant ? pub("merchant.png") : null,
    merchantName: meta.merchantName ?? null,
    declined: !!meta.declined,
    signedAt: meta.signedAt ?? null,
    hasAny: true,
  };
}
