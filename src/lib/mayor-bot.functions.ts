import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";

const Input = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  // Sesli modda cevaplar kısa ve konuşma diline uygun üretilir.
  voice: z.boolean().optional(),
});

const NAV_MAP = `
PANEL SAYFALARI (ilgili konuda mutlaka Markdown linki ver):
- Şikayet detayı: /sikayetler/<ID>
- Tüm şikayetler: /sikayetler
- Çözüm masası: /cozum-masasi
- Memnuniyet analizi: /memnuniyet
- Müdürlük performansı: /mudurluk
- Personel analizi: /personel-analizi
- Araç bakım: /arac-bakim
- Zabıta denetimleri: /zabita-denetim
- İşyeri kayıtları: /zabita-isyerleri
- Tutanak arşivi: /tutanak-arsivi
- Duyurular: /duyurular
- Anketler: /anketler
- Günlük mesajlar: /gunluk-mesajlar
- Vatandaşlar: /vatandaslar
- WhatsApp: /whatsapp
`.trim();

export const askMayorBot = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getMayorSnapshot } = await import("@/lib/mayor-bot.snapshot.server");

    const snapshot = await getMayorSnapshot(Date.now());
    const { context, facts } = snapshot;
    const question = data.messages[data.messages.length - 1]?.content ?? "";

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return { answer: buildLocalAnswer(question, facts) };
    }

    try {
      const systemPrompt = `Sen Alanya Belediyesi başkanının kişisel AI danışmanısın. Aşağıdaki GERÇEK belediye verilerini kullanarak başkanın sorularına Türkçe cevap ver. Bugünün tarihi: ${new Date().toISOString().slice(0, 10)}.

ÇALIŞMA BİÇİMİ:
1. ÖNCE VERİYİ TARA: Cevap vermeden önce aşağıdaki tüm bölümleri (genel durum, müdürlük performansı, SLA/gecikme, memnuniyet, mahalleler, araç, personel, zabıta, duyuru/etkinlik/anket, açık şikayet listesi) gözden geçir ve soruyla ilgili TÜM bölümleri birlikte kullan. Tek bir rakamla yetinme.
2. ÇAPRAZ ANALİZ YAP: Veriler arasındaki ilişkileri kur:
   - Şikayeti yoğun ama memnuniyet puanı düşük mahalleler hangileri? ("riskli mahalleler" bölümüne bak)
   - Çözüm süresi uzayan müdürlüklerin memnuniyet puanı nasıl etkilenmiş?
   - Nüfusa göre 1000 kişi başına şikayet oranı hangi mahallede anormal?
   - Gecikmiş (7+ gün) şikayetler hangi müdürlükte birikmiş, personel/araç kapasitesiyle (bakımdaki araç, geç giriş, personel sayısı) ilişkisi var mı?
   - Yaklaşan etkinlikler ile o bölgedeki açık altyapı/temizlik şikayetleri çakışıyor mu?
3. SOMUT AKSİYON ÖNER: Her cevabı 1-3 maddelik, sorumlusu ve süresi belli bir aksiyon önerisiyle bitir (örn: "X Müdürlüğü'nden 3 gün içinde Y mahallesindeki 4 açık kaydın kapatılmasını isteyin").
4. KAYIT REFERANSI VER: Belirli bir şikayetten bahsederken MUTLAKA tıklanabilir Markdown linki kullan: [İncele](/sikayetler/<ID>). Konu bazında ilgili panel sayfasına da link ver.
5. VERİDE YOKSA UYDURMA: İlgili veri yoksa "bu veri sistemde kayıtlı değil" de. Rakamları asla tahmin etme, yalnızca aşağıdaki verilerden hesapla.

TERİM AYRIMI (çok önemli):
- "Çözüm oranı / genel başarı": çözülen şikayet / toplam şikayet = %${facts.resolutionRate.toFixed(1)}.
- "Anket memnuniyeti / vatandaş puanı": vatandaşların WhatsApp'tan verdiği 1-5 yıldız ortalaması = ${facts.avgSatisfactionScore.toFixed(
        2,
      )} / 5.0, mutlu vatandaş oranı %${facts.satisfactionRate.toFixed(1)}.
- Birim/mahalle memnuniyeti sorulursa müdürlük ve mahalle ortalama puan tablolarını sun.

BİÇİM KURALLARI:
- Asla LaTeX kullanma (\\[ \\], \\frac, \\text yasak). Formülleri düz metin yaz: "Oran = (18 / 29) * 100 = %62".
- Kısa başlıklar ve madde işaretleri kullan, gereksiz tekrar yapma.
- Profesyonel, doğrudan, rakama sadık bir yönetici dili kullan.

${NAV_MAP}

${context}`;

      const voiceStyle = `
SESLİ KONUŞMA MODU AKTİF: Cevabın yüksek sesle okunacak.
- En fazla 5-6 kısa cümle kur, toplam 90 kelimeyi geçme.
- Madde işareti, tablo, yıldız, markdown link, emoji, parantez içi teknik not KULLANMA. Düz konuşma metni yaz.
- Rakamları konuşma diline uygun ver ("yüzde altmış iki", "dört nokta iki puan" gibi).
- "Başkanım" diye hitap et, sonunda tek bir net aksiyon önerisi söyle.
- Detay listesi gerekiyorsa "detayları panelde listeledim" de ve en kritik 2-3 maddeyi say.`;

      const model = process.env.MAYOR_BOT_MODEL || "gpt-4o";

      const r = await generateText({
        model: openai(model),
        system: data.voice ? systemPrompt + "\n\n" + voiceStyle : systemPrompt,
        messages: data.messages,
        temperature: 0.3,
        maxOutputTokens: data.voice ? 400 : 1800,
      });

      await supabaseAdmin
        .from("ai_bot_logs")
        .insert({ user_id: null, question, answer: r.text })
        .then(
          () => {},
          () => {},
        );

      return { answer: r.text };
    } catch (e: any) {
      return { answer: buildLocalAnswer(question, facts) };
    }
  });

function buildLocalAnswer(
  _q: string,
  d: {
    total: number;
    byNbr: Record<string, number>;
    byDept: Record<string, number>;
    deptAvg: Record<string, number>;
    inMaintenance: string[];
    resolutionRate: number;
    avgSatisfactionScore: number;
  },
): string {
  const topNbr = Object.entries(d.byNbr).sort((a, b) => b[1] - a[1])[0];
  const topDept = Object.entries(d.byDept).sort((a, b) => b[1] - a[1])[0];
  const fastest = Object.entries(d.deptAvg).sort((a, b) => a[1] - b[1])[0];
  return `**Özet:** Belediyenizde toplam ${d.total} şikayet takip edilmektedir. Çözüm oranı %${d.resolutionRate.toFixed(
    1,
  )}, vatandaş anket puanı ${d.avgSatisfactionScore.toFixed(2)} / 5.0.

**Öne Çıkan Bulgular:**
- En yoğun şikayet ${topNbr?.[0] ?? "—"} mahallesinden (${topNbr?.[1] ?? 0} kayıt) gelmiştir.
- En çok başvuru ${topDept?.[0] ?? "—"} müdürlüğüne yapılmıştır.
- En hızlı çözüm süresi ${fastest?.[0] ?? "—"} müdürlüğündedir (~${fastest?.[1]?.toFixed(1) ?? "—"} saat).

**Önerilen Aksiyon:** ${topNbr?.[0] ?? "Öne çıkan mahalle"} için haftalık saha kontrolü planlayabilirsiniz.

**İlgili Kayıtlar:** Bakımdaki araçlar: ${d.inMaintenance.slice(0, 3).join(", ") || "yok"}.`;
}
