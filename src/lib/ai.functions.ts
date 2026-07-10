import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { classifyLocally } from "@/lib/turkish";

const ClassifyInput = z.object({
  text: z.string().min(3),
});

export const classifyComplaint = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ClassifyInput.parse(input))
  .handler(async ({ data }) => {
    const local = classifyLocally(data.text);

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        ...local,
        language: "tr",
        auto_response: `Şikayetiniz alındı, ${local.department} birimine yönlendirilecektir. En kısa sürede geri dönüş yapılacaktır.`,
        source: "keyword",
      };
    }

    try {
      const gateway = createLovableGateway();
      const prompt = `Sen bir belediye AI asistanısın. Aşağıdaki vatandaş şikayetini analiz et.
Şikayet: "${data.text}"

Kategoriler: Yol / Altyapı, Temizlik, Park ve Bahçeler, İmar, Su / Kanalizasyon, Ulaşım, Gürültü, Sokak Hayvanları, Evlendirme, Ruhsat, Numarataj, Diğer.
Müdürlükler: Fen İşleri Müdürlüğü, Temizlik İşleri Müdürlüğü, Park ve Bahçeler Müdürlüğü, Ruhsat ve Denetim Müdürlüğü, İmar ve Şehircilik Müdürlüğü, Su ve Kanalizasyon Müdürlüğü, Ulaşım Hizmetleri Müdürlüğü, Veteriner İşleri Müdürlüğü, Evlendirme Memurluğu, Numarataj Birimi, Zabıta Müdürlüğü, Kültür ve Sosyal İşler Müdürlüğü.

Sadece geçerli JSON döndür (başka metin yok):
{"category":"...","department":"...","priority":"yuksek|orta|dusuk","language":"tr|en|ar|de","confidence":0.0-1.0,"auto_response":"Vatandaşa Türkçe kısa cevap (2 cümle)"}`;

      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      const jsonText = result.text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(jsonText);
      return {
        category: parsed.category ?? local.category,
        department: parsed.department ?? local.department,
        priority: parsed.priority ?? local.priority,
        language: parsed.language ?? "tr",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : local.confidence,
        auto_response: parsed.auto_response ?? "Şikayetiniz alındı, en kısa sürede geri dönüş yapılacaktır.",
        source: "ai",
      };
    } catch (e) {
      console.error("AI classify failed", e);
      return {
        ...local,
        language: "tr",
        auto_response: `Şikayetiniz alındı, ${local.department} birimine yönlendirilecektir. En kısa sürede geri dönüş yapılacaktır.`,
        source: "keyword-fallback",
      };
    }
  });

export const getBotSettings = createServerFn({ method: "GET" })
  .handler(async () => {
    const fs = await import("fs");
    const path = await import("path");
    const settingsPath = path.resolve("./whatsapp-bot/bot-settings.json");
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, "utf-8");
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("Failed to read bot settings", e);
    }
    return { selfChatOnly: true }; // Varsayılan olarak kendi kendimize test modu açık
  });

export const updateBotSettings = createServerFn({ method: "POST" })
  .inputValidator((input: any) => z.object({ selfChatOnly: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const fs = await import("fs");
    const path = await import("path");
    const settingsPath = path.resolve("./whatsapp-bot/bot-settings.json");
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2));
      return { success: true };
    } catch (e: any) {
      console.error("Failed to write bot settings", e);
      return { success: false, error: e.message };
    }
  });

export const fetchBilgiTalepleri = createServerFn({ method: "GET" })
  .inputValidator((input: any) => z.object({
    search: z.string().optional(),
    departmentId: z.string().nullable().optional(),
    isMudurluk: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let departmentName: string | null = null;
    if (data.isMudurluk && data.departmentId) {
      const { data: dept } = await supabaseAdmin
        .from("departments")
        .select("name")
        .eq("id", data.departmentId)
        .maybeSingle();
      if (dept) {
        departmentName = dept.name;
      }
    }

    let q = supabaseAdmin
      .from("ai_bot_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (data.search) q = q.ilike("question", `%${data.search}%`);

    if (data.isMudurluk && departmentName) {
      q = q.eq("related_filters->>department", departmentName);
    }

    const { data: logs, error } = await q;
    if (error) {
      console.error("fetchBilgiTalepleri error:", error);
      return [];
    }
    return logs ?? [];
  });

const DashboardInsightInput = z.object({
  stats: z.object({
    total: z.number(),
    open: z.number(),
    resolved: z.number(),
    avgResolutionHours: z.number(),
    topCategory: z.string(),
    topNeighborhood: z.string(),
    departmentName: z.string().nullable().optional(),
    satisfaction: z.number().optional(),
  }),
  role: z.enum(["baskan", "mudurluk", "admin", "cozum_masasi"]),
});

export const generateDashboardInsight = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DashboardInsightInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    const s = data.stats;
    const resolvedPct = s.total > 0 ? ((s.resolved / s.total) * 100).toFixed(0) : "0";

    // Fallback if no AI key
    const fallback = data.role === "baskan"
      ? `Toplam ${s.total} şikayet alınmış, bunların %${resolvedPct}'ü çözülmüştür. En yoğun kategori: ${s.topCategory}. En fazla şikayet gelen mahalle: ${s.topNeighborhood}. Ortalama çözüm süresi ${s.avgResolutionHours.toFixed(1)} saattir.`
      : `${s.departmentName ?? "Birim"}: Toplam ${s.total} şikayet, %${resolvedPct} çözüm oranı. En yoğun kategori: ${s.topCategory}. Ortalama çözüm süresi: ${s.avgResolutionHours.toFixed(1)} saat.`;

    if (!key) return { insight: fallback };

    try {
      const gateway = createLovableGateway();
      const prompt = data.role === "baskan"
        ? `Sen bir belediye yapay zeka danışmanısın. Başkana hitaben kısa ve profesyonel (3-4 cümle) bir günlük yönetim özeti ve tavsiye yaz.
Veriler: Toplam Şikayet: ${s.total}, Açık: ${s.open}, Çözülen: ${s.resolved} (%${resolvedPct}), Ort. Çözüm Süresi: ${s.avgResolutionHours.toFixed(1)} saat, En Yoğun Kategori: ${s.topCategory}, En Yoğun Mahalle: ${s.topNeighborhood}${s.satisfaction ? `, Memnuniyet: %${(s.satisfaction * 20).toFixed(0)}` : ""}.
Sadece Türkçe düz metin döndür, JSON veya markdown kullanma.`
        : `Sen bir belediye yapay zeka danışmanısın. ${s.departmentName ?? "Bu birim"} müdürüne hitaben kısa ve profesyonel (3-4 cümle) bir performans analizi ve tavsiye yaz.
Veriler: Toplam Şikayet: ${s.total}, Açık: ${s.open}, Çözülen: ${s.resolved} (%${resolvedPct}), Ort. Çözüm Süresi: ${s.avgResolutionHours.toFixed(1)} saat, En Yoğun Kategori: ${s.topCategory}, En Yoğun Mahalle: ${s.topNeighborhood}.
Sadece Türkçe düz metin döndür, JSON veya markdown kullanma.`;

      const result = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        prompt,
      });
      return { insight: result.text.trim() || fallback };
    } catch (e) {
      console.error("AI insight failed", e);
      return { insight: fallback };
    }
  });
