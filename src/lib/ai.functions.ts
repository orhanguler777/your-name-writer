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
    const defaults = {
      selfChatOnly: true,
      koksalChatOnly: false,
      slaLimitHours: 120,
      crisisLimitHours: 1,
      crisisLimitCount: 4,
    };
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, "utf-8");
        return { ...defaults, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error("Failed to read bot settings", e);
    }
    return defaults;
  });

export const updateBotSettings = createServerFn({ method: "POST" })
  .inputValidator((input: any) =>
    z.object({
      selfChatOnly: z.boolean().optional(),
      koksalChatOnly: z.boolean().optional(),
      slaLimitHours: z.number().optional(),
      crisisLimitHours: z.number().optional(),
      crisisLimitCount: z.number().optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const fs = await import("fs");
    const path = await import("path");
    const settingsPath = path.resolve("./whatsapp-bot/bot-settings.json");
    try {
      let existing: any = {};
      if (fs.existsSync(settingsPath)) {
        existing = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      }
      const updated = { ...existing, ...data };
      fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2));
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

const RankedItem = z.object({
  name: z.string(),
  count: z.number(),
  pct: z.number(),
});

const DashboardInsightInput = z.object({
  stats: z.object({
    total: z.number(),
    open: z.number(),
    resolved: z.number(),
    resolvedPct: z.number(),
    avgResolutionHours: z.number(),
    topCategory: z.string(),
    topNeighborhood: z.string(),
    topDepartment: z.string().optional(),
    departmentName: z.string().nullable().optional(),
    satisfaction: z.number().optional(),
    awaitingCitizen: z.number().optional(),
    highPriorityOpen: z.number().optional(),
    inReview: z.number().optional(),
    trendLabel: z.string().optional(),
    trendPct: z.number().optional(),
    topNeighborhoods: z.array(RankedItem).optional(),
    topCategories: z.array(RankedItem).optional(),
    topDepartments: z.array(RankedItem).optional(),
    last7Total: z.number().optional(),
    last7Resolved: z.number().optional(),
    foreignTotal: z.number().optional(),
    foreignResolved: z.number().optional(),
    foreignSatisfaction: z.number().optional(),
  }),
  role: z.enum(["baskan", "mudurluk", "admin", "cozum_masasi"]),
});

function formatRankedList(items: { name: string; count: number; pct: number }[] | undefined) {
  if (!items?.length) return "Veri yok";
  return items.map((i) => `${i.name} (${i.count} adet, %${i.pct.toFixed(1)})`).join(", ");
}

function buildFallbackInsight(
  role: z.infer<typeof DashboardInsightInput>["role"],
  s: z.infer<typeof DashboardInsightInput>["stats"],
) {
  const nbrList = formatRankedList(s.topNeighborhoods);
  const catList = formatRankedList(s.topCategories);
  const deptList = formatRankedList(s.topDepartments);

  if (role === "baskan" || role === "admin") {
    return [
      `Genel Durum: Sistemde toplam ${s.total} şikayet kayıtlıdır. ${s.open} şikayet halen açık, ${s.resolved} şikayet çözülmüştür (çözüm oranı %${Number(s.resolvedPct).toFixed(1)}). Ortalama çözüm süresi ${s.avgResolutionHours.toFixed(1)} saattir.${s.trendLabel ? ` Son 7 günde ${s.trendLabel}.` : ""}`,
      `Mahalle Analizi: En yoğun mahalle ${s.topNeighborhood} olup ilk beş mahalle sıralaması şöyledir: ${nbrList}. Bu dağılım, saha ekiplerinin öncelikli yönlendirilmesi için dikkate alınmalıdır.`,
      `Kategori ve Müdürlük Yoğunluğu: En sık bildirilen kategori ${s.topCategory}. Kategori dağılımı: ${catList}. Müdürlük bazında yoğunluk: ${deptList}.${s.highPriorityOpen ? ` ${s.highPriorityOpen} yüksek öncelikli açık şikayet acil takip gerektirmektedir.` : ""}${s.awaitingCitizen ? ` ${s.awaitingCitizen} şikayette vatandaş yanıtı beklenmektedir.` : ""}`,
      `Yabancı Vatandaş Analizi: Yabancı dilde açılan toplam ${s.foreignTotal || 0} şikayetin ${s.foreignResolved || 0} tanesi çözülmüştür. ${s.foreignSatisfaction ? `Yabancı uyrukluların memnuniyet oranı %${(s.foreignSatisfaction * 20).toFixed(0)} civarındadır.` : ""}`,
      `Yönetim Önerisi: Yoğun mahallelerde proaktif denetim artırılmalı, açık şikayetlerde özellikle yüksek öncelikli dosyalar günlük olarak izlenmeli ve çözüm oranının sürdürülebilirliği için müdürlükler arası koordinasyon güçlendirilmelidir.`,
    ].join("\n\n");
  }

  return [
    `Birim Performansı: ${s.departmentName ?? "Birim"} kapsamında toplam ${s.total} şikayet bulunmaktadır. Açık ${s.open}, çözülen ${s.resolved} (çözüm oranı %${Number(s.resolvedPct).toFixed(1)}). Ortalama çözüm süresi ${s.avgResolutionHours.toFixed(1)} saattir.`,
    `Mahalle ve Kategori Dağılımı: En yoğun mahalle ${s.topNeighborhood}. Mahalle sıralaması: ${nbrList}. En sık kategori ${s.topCategory}; kategori dağılımı: ${catList}.${s.awaitingCitizen ? ` ${s.awaitingCitizen} şikayette vatandaş yanıtı beklenmektedir.` : ""}`,
    `Operasyonel Tavsiye: Açık dosyalar öncelik sırasına göre günlük takip edilmeli, yoğun mahallelerde saha kapasitesi artırılmalı ve vatandaş yanıtı bekleyen kayıtlar gecikmeden sonuçlandırılmalıdır.`,
  ].join("\n\n");
}

export const generateDashboardInsight = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DashboardInsightInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.OPENAI_API_KEY;
    const s = data.stats;
    const fallback = buildFallbackInsight(data.role, s);
    const isExecutive = data.role === "baskan" || data.role === "admin";

    if (!key) return { insight: fallback };

    try {
      const gateway = createLovableGateway();
      const audience = isExecutive
        ? "belediye başkanına ve üst yönetime"
        : `${s.departmentName ?? "ilgili müdürlük"} müdürüne`;

      const prompt = `Sen Alanya Belediyesi'nin kıdemli yapay zeka yönetim danışmanısın. ${audience} hitaben resmi, profesyonel ve veri odaklı bir yönetim brifingi yaz.

KURALLAR:
- Türkçe yaz, resmi ama anlaşılır bir dil kullan
- 4 paragraf üret; paragraflar arasında boş satır bırak
- Markdown, JSON, madde işareti veya başlık sembolü (#, *) kullanma
- Her paragraf 2-3 cümle olsun
- Somut rakam, mahalle adı, kategori ve müdürlük isimlerini mutlaka kullan
- Genel geçer ifadelerden kaçın; veriye dayalı yorum yap

VERİ SETİ:
- Toplam şikayet: ${s.total}
- Açık şikayet: ${s.open}
- Çözülen şikayet: ${s.resolved} (çözüm oranı %${Number(s.resolvedPct).toFixed(1)})
- Ortalama çözüm süresi: ${s.avgResolutionHours.toFixed(1)} saat
- İncelemede: ${s.inReview ?? 0}
- Vatandaş yanıtı bekleyen: ${s.awaitingCitizen ?? 0}
- Yüksek öncelikli açık: ${s.highPriorityOpen ?? 0}
- Son 7 gün toplam: ${s.last7Total ?? 0}, çözülen: ${s.last7Resolved ?? 0}
- Trend: ${s.trendLabel ?? "belirsiz"}${s.trendPct !== undefined ? ` (%${Math.abs(s.trendPct).toFixed(0)} değişim)` : ""}
- En yoğun mahalle: ${s.topNeighborhood}
- En yoğun kategori: ${s.topCategory}
- En yoğun müdürlük: ${s.topDepartment ?? "—"}
- Mahalle sıralaması (ilk 5): ${formatRankedList(s.topNeighborhoods)}
- Kategori sıralaması (ilk 5): ${formatRankedList(s.topCategories)}
- Müdürlük sıralaması (ilk 5): ${formatRankedList(s.topDepartments)}
${s.satisfaction ? `- Memnuniyet skoru: %${(s.satisfaction * 20).toFixed(0)}` : ""}
${s.departmentName ? `- Birim adı: ${s.departmentName}` : ""}
${s.foreignTotal !== undefined ? `- Yabancı dildeki (turist/yerleşik yabancı) şikayet sayısı: ${s.foreignTotal}` : ""}
${s.foreignResolved !== undefined ? `- Çözülen yabancı şikayet sayısı: ${s.foreignResolved}` : ""}
${s.foreignSatisfaction ? `- Yabancı memnuniyet skoru: %${(s.foreignSatisfaction * 20).toFixed(0)}` : ""}

PARAGRAF YAPISI:
1) Genel operasyonel durum ve çözüm performansı
2) Mahalle bazlı yoğunluk analizi (hangi mahalleler öne çıkıyor, ne anlama geliyor)
3) Kategori/müdürlük yoğunluğu ve yabancılardan/turistlerden gelen şikayetlerin durumu
4) Somut yönetim önerileri (kaynak planlaması, saha müdahalesi, koordinasyon)`;

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

export const fetchCitizensData = createServerFn({ method: "GET" })
  .inputValidator((input: any) =>
    z.object({
      search: z.string().optional(),
      language: z.string().optional(),
      kvkkStatus: z.string().optional(),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: complaints, error } = await supabaseAdmin
      .from("complaints")
      .select("id, citizen_phone, citizen_name, language, address, created_at, status, category, complaint_text")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("fetchCitizensData error:", error);
      return [];
    }

    const isFullName = (str?: string | null) => {
      if (!str || typeof str !== "string") return false;
      const cleaned = str.trim();
      if (cleaned.toLowerCase() === "vatandaş" || cleaned.length < 3) return false;
      const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
      return words.length >= 2;
    };

    const KNOWN_LID_MAP: Record<string, string> = {
      "16690377154811": "905543662725",
      "78902861029557": "905454597000",
    };

    const map = new Map<string, any>();

    for (const c of complaints || []) {
      let phone = c.citizen_phone || "bilinmiyor";
      if (KNOWN_LID_MAP[phone]) phone = KNOWN_LID_MAP[phone];
      if (!map.has(phone)) {
        map.set(phone, {
          phone,
          name: c.citizen_name || "Vatandaş",
          language: (c.language || "tr").toLowerCase(),
          kvkkAccepted: isFullName(c.citizen_name),
          complaintCount: 1,
          lastActivity: c.created_at,
          lastAddress: c.address,
          categories: [c.category].filter(Boolean),
          history: [{ id: c.id, text: c.complaint_text || "Şikayet", status: c.status, date: c.created_at }],
        });
      } else {
        const item = map.get(phone);
        item.complaintCount += 1;
        if (c.category && !item.categories.includes(c.category)) {
          item.categories.push(c.category);
        }
        if (!item.kvkkAccepted && isFullName(c.citizen_name)) {
          item.name = c.citizen_name;
          item.kvkkAccepted = true;
        }
        item.history.push({ id: c.id, text: c.complaint_text || "Şikayet", status: c.status, date: c.created_at });
      }
    }

    let result = Array.from(map.values());

    if (data.search) {
      const s = data.search.toLowerCase();
      result = result.filter(
        (r) => r.phone.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)
      );
    }

    if (data.language && data.language !== "all") {
      result = result.filter((r) => r.language === data.language);
    }

    if (data.kvkkStatus && data.kvkkStatus !== "all") {
      if (data.kvkkStatus === "approved") {
        result = result.filter((r) => r.kvkkAccepted);
      } else if (data.kvkkStatus === "pending") {
        result = result.filter((r) => !r.kvkkAccepted);
      }
    }

    return result;
  });

