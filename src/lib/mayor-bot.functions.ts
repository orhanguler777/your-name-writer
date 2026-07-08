import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableGateway } from "@/lib/ai-gateway.server";

const Input = z.object({ question: z.string().min(3) });

export const askMayorBot = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }) => {
    // Import server-only supabase admin inside handler
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pull compact snapshots for grounding
    const [{ data: complaints }, { data: depts }, { data: nbrs }, { data: vehicles }, { data: attendance }] = await Promise.all([
      supabaseAdmin.from("complaints").select("category, status, priority, satisfaction_score, created_at, resolved_at, assigned_department_id, neighborhood_id, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name)").limit(500),
      supabaseAdmin.from("departments").select("id, name, deputy_mayors(full_name)"),
      supabaseAdmin.from("neighborhoods").select("id, name"),
      supabaseAdmin.from("vehicles").select("plate_number, status, maintenance_start_date, maintenance_reason, departments(name)"),
      supabaseAdmin.from("personnel_attendance").select("date, is_late, has_overtime, missing_checkout, personnel(department_id, departments(name))").limit(300),
    ]);

    // Build compact aggregates for the prompt
    const total = complaints?.length ?? 0;
    const byNbr = tally(complaints ?? [], (c: any) => c.neighborhoods?.name);
    const byDept = tally(complaints ?? [], (c: any) => c.departments?.name);
    const byStatus = tally(complaints ?? [], (c: any) => c.status);
    const avgResHours: Record<string, number> = {};
    const cntRes: Record<string, number> = {};
    (complaints ?? []).forEach((c: any) => {
      if (c.status === "cozuldu" && c.resolved_at && c.departments?.name) {
        const h = (new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 36e5;
        avgResHours[c.departments.name] = (avgResHours[c.departments.name] ?? 0) + h;
        cntRes[c.departments.name] = (cntRes[c.departments.name] ?? 0) + 1;
      }
    });
    const deptAvg: Record<string, number> = {};
    Object.keys(avgResHours).forEach((k) => { deptAvg[k] = avgResHours[k] / cntRes[k]; });

    const inMaintenance = (vehicles ?? []).filter((v: any) => v.status === "bakimda").map((v: any) => `${v.plate_number} (${v.departments?.name ?? "—"}, sebep: ${v.maintenance_reason})`);
    const lateByDept = tally((attendance ?? []).filter((a: any) => a.is_late), (a: any) => a.personnel?.departments?.name);

    const context = `
BELEDİYE VERİ ÖZETİ:
- Toplam şikayet: ${total}
- Mahalle bazında şikayet: ${JSON.stringify(byNbr)}
- Müdürlük bazında şikayet: ${JSON.stringify(byDept)}
- Durum dağılımı: ${JSON.stringify(byStatus)}
- Müdürlük ortalama çözüm süresi (saat): ${JSON.stringify(deptAvg)}
- Bakımdaki araçlar: ${inMaintenance.join(", ") || "yok"}
- Geç giriş dağılımı (son 10 gün): ${JSON.stringify(lateByDept)}
`;

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { answer: buildLocalAnswer(data.question, { total, byNbr, byDept, deptAvg, inMaintenance }) };
    }

    try {
      const gateway = createLovableGateway();
      const prompt = `Sen Türk bir belediye başkanının kişisel AI asistanısın. Aşağıdaki gerçek belediye verileriyle başkanın sorusunu Türkçe olarak cevapla.

${context}

Cevap formatı:
**Özet:** 1-2 cümle
**Öne Çıkan Bulgular:** madde madde 3 bulgu
**Önerilen Aksiyon:** kısa öneri
**İlgili Kayıtlar:** rakamlar / mahalle / müdürlük referansları

Başkanın sorusu: "${data.question}"`;

      const r = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });

      // log
      await supabaseAdmin.from("ai_bot_logs").insert({
        user_id: null, question: data.question, answer: r.text,
      }).then(() => {}, () => {});

      return { answer: r.text };
    } catch (e: any) {
      return { answer: buildLocalAnswer(data.question, { total, byNbr, byDept, deptAvg, inMaintenance }) };
    }
  });

function tally<T>(arr: T[], key: (x: T) => string | undefined): Record<string, number> {
  return arr.reduce((acc, x) => {
    const k = key(x); if (!k) return acc;
    acc[k] = (acc[k] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);
}

function buildLocalAnswer(q: string, d: { total: number; byNbr: Record<string, number>; byDept: Record<string, number>; deptAvg: Record<string, number>; inMaintenance: string[] }): string {
  const topNbr = Object.entries(d.byNbr).sort((a, b) => b[1] - a[1])[0];
  const topDept = Object.entries(d.byDept).sort((a, b) => b[1] - a[1])[0];
  const fastest = Object.entries(d.deptAvg).sort((a, b) => a[1] - b[1])[0];
  return `**Özet:** Belediyenizde toplam ${d.total} şikayet takip edilmektedir.

**Öne Çıkan Bulgular:**
- En yoğun şikayet ${topNbr?.[0] ?? "—"} mahallesinden (${topNbr?.[1] ?? 0} kayıt) gelmiştir.
- En çok başvuru ${topDept?.[0] ?? "—"} müdürlüğüne yapılmıştır.
- En hızlı çözüm süresi ${fastest?.[0] ?? "—"} müdürlüğündedir (~${fastest?.[1]?.toFixed(1) ?? "—"} saat).

**Önerilen Aksiyon:** ${topNbr?.[0]} mahallesi için haftalık saha kontrolü planlayabilirsiniz.

**İlgili Kayıtlar:** Bakımdaki araçlar: ${d.inMaintenance.slice(0, 3).join(", ") || "yok"}.`;
}
