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
