/**
 * İmzalı denetim tutanağını esnafın WhatsApp numarasına gönderir.
 * Gönderimi yerel WhatsApp bot servisi (baileys) yapar; uygulama yalnızca tetikler.
 */
const BOT_URL = "http://localhost:3001";

export interface SendTutanakResult {
  ok: boolean;
  reason?: string;
  to?: string;
}

export async function sendTutanakWhatsapp(
  inspectionId: string,
  opts: { phone?: string | null; pdfUrl?: string | null } = {},
): Promise<SendTutanakResult> {
  try {
    const res = await fetch(`${BOT_URL}/send-inspection-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inspectionId,
        phone: opts.phone || undefined,
        pdfUrl: opts.pdfUrl || undefined,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.status === "error") {
      return { ok: false, reason: json?.reason || `Gönderim başarısız (${res.status})` };
    }
    return { ok: true, to: json?.to };
  } catch (e: any) {
    // Bot servisi kapalıysa fetch burada patlar
    return { ok: false, reason: "WhatsApp servisine ulaşılamadı (bot çalışmıyor olabilir)" };
  }
}

/** Telefon alanı WhatsApp'a gönderim için yeterli mi? */
export function isSendablePhone(phone?: string | null): boolean {
  if (!phone) return false;
  return phone.replace(/\D/g, "").length >= 10;
}
