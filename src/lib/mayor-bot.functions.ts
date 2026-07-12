import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";

const Input = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })),
});

export const askMayorBot = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data }) => {
    // Import server-only supabase admin inside handler
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pull compact snapshots for grounding
    const [{ data: complaints }, { data: depts }, { data: nbrs }, { data: vehicles }, { data: attendance }, { data: openComplaints }] = await Promise.all([
      supabaseAdmin.from("complaints").select("category, status, priority, satisfaction_score, complaint_text, created_at, resolved_at, assigned_department_id, neighborhood_id, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name)").limit(1000),
      supabaseAdmin.from("departments").select("id, name, deputy_mayors(full_name)"),
      supabaseAdmin.from("neighborhoods").select("id, name, mukhtar_name, mukhtar_phone"),
      supabaseAdmin.from("vehicles").select("plate_number, status, maintenance_start_date, maintenance_reason, departments(name)"),
      supabaseAdmin.from("personnel_attendance").select("date, is_late, has_overtime, missing_checkout, personnel(department_id, departments(name))").limit(300),
      supabaseAdmin.from("complaints")
        .select("id, complaint_text, category, neighborhoods(name), created_at")
        .in("status", ["yeni", "incelemede", "personele_atandi", "devam_ediyor", "vatandas_yaniti_bekleniyor"])
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    // Build compact aggregates for the prompt
    const total = complaints?.length ?? 0;
    const byNbr = tally(complaints ?? [], (c: any) => c.neighborhoods?.name);
    const byDept = tally(complaints ?? [], (c: any) => c.departments?.name);
    const byStatus = tally(complaints ?? [], (c: any) => c.status);
    
    // Memnuniyet hesaplama
    const ratedComplaints = (complaints ?? []).filter((c: any) => c.satisfaction_score !== null && c.satisfaction_score !== undefined);
    const totalRated = ratedComplaints.length;
    const totalSatScore = ratedComplaints.reduce((acc: number, c: any) => acc + (c.satisfaction_score || 0), 0);
    const avgSatisfactionScore = totalRated > 0 ? (totalSatScore / totalRated) : 0;
    const happyCount = ratedComplaints.filter((c: any) => (c.satisfaction_score || 0) >= 4).length;
    const satisfactionRate = totalRated > 0 ? (happyCount / totalRated) * 100 : 0;

    // Birim bazlı memnuniyet
    const deptSatTotal: Record<string, number> = {};
    const deptSatCount: Record<string, number> = {};
    ratedComplaints.forEach((c: any) => {
      const deptName = c.departments?.name;
      if (deptName) {
        deptSatTotal[deptName] = (deptSatTotal[deptName] ?? 0) + (c.satisfaction_score || 0);
        deptSatCount[deptName] = (deptSatCount[deptName] ?? 0) + 1;
      }
    });
    const deptSatAvg: Record<string, number> = {};
    Object.keys(deptSatCount).forEach((k) => {
      deptSatAvg[k] = parseFloat((deptSatTotal[k] / deptSatCount[k]).toFixed(2));
    });

    // Mahalle bazlı memnuniyet
    const nbrSatTotal: Record<string, number> = {};
    const nbrSatCount: Record<string, number> = {};
    ratedComplaints.forEach((c: any) => {
      const nbrName = c.neighborhoods?.name;
      if (nbrName) {
        nbrSatTotal[nbrName] = (nbrSatTotal[nbrName] ?? 0) + (c.satisfaction_score || 0);
        nbrSatCount[nbrName] = (nbrSatCount[nbrName] ?? 0) + 1;
      }
    });
    const nbrSatAvg: Record<string, number> = {};
    Object.keys(nbrSatCount).forEach((k) => {
      nbrSatAvg[k] = parseFloat((nbrSatTotal[k] / nbrSatCount[k]).toFixed(2));
    });

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

    const openIssues = (openComplaints ?? []).map((c: any) =>
      `[ID: ${c.id}] Mahalle: ${c.neighborhoods?.name ?? "Bilinmiyor"} | Kategori: ${c.category} | Metin: ${c.complaint_text}`
    ).join("\n");

    const mukhtarsList = (nbrs ?? [])
      .filter((n: any) => n.mukhtar_name)
      .map((n: any) => `${n.name}: ${n.mukhtar_name} (${n.mukhtar_phone || '—'})`)
      .join(", ");

    const context = `
BELEDİYE VERİ ÖZETİ:
- Toplam şikayet: ${total}
- Mahalle bazında şikayet: ${JSON.stringify(byNbr)}
- Müdürlük bazında şikayet: ${JSON.stringify(byDept)}
- Durum dağılımı: ${JSON.stringify(byStatus)}
- Müdürlük ortalama çözüm süresi (saat): ${JSON.stringify(deptAvg)}
- Bakımdaki araçlar: ${inMaintenance.join(", ") || "yok"}
- Geç giriş dağılımı (son 10 gün): ${JSON.stringify(lateByDept)}
- ALANYA MAHALLE MUHTARLARI: ${mukhtarsList}

MEMNUNİYET ANKETİ VERİLERİ (Çözülen şikayetler sonrası vatandaş oyları, 1-5 yıldız):
- Memnuniyet puanı olan toplam şikayet sayısı: ${totalRated}
- Ortalama vatandaş memnuniyet puanı (1-5 yıldız): ${avgSatisfactionScore.toFixed(2)} / 5.0
- Mutlu vatandaş oranı (4 veya 5 puan verenler): %${satisfactionRate.toFixed(1)}
- Müdürlüklere göre memnuniyet ortalaması (1-5 yıldız): ${JSON.stringify(deptSatAvg)}
- Mahallelere göre memnuniyet ortalaması (1-5 yıldız): ${JSON.stringify(nbrSatAvg)}

SON AÇIK (ÇÖZÜLMEMİŞ) ŞİKAYETLER (Detay istendiğinde bu veriyi kullan):
${openIssues}
`;

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return { answer: buildLocalAnswer(data.messages[data.messages.length - 1].content, { total, byNbr, byDept, deptAvg, inMaintenance }) };
    }

    try {
      const systemPrompt = `Sen Türk bir belediye başkanının kişisel AI asistanısın. Aşağıdaki gerçek belediye verilerini kullanarak başkanın sorularına Türkçe cevap ver.
Eğer belirli bir şikayetin detayından bahsediyorsan, MUTLAKA tıklanabilir Markdown linki formatında /sikayetler/ID şeklinde link ver (Örn: [İncele](/sikayetler/1234-5678)).

KULLANIM VE DİL KURALLARI:
- DERİN ÇIKARIM VE BÜTÜNSEL BAKIŞ: Sadece kuru istatistik vermekle yetinme. Veriler arasındaki ilişkileri analiz et. Örneğin:
  - Hangi mahallelerde şikayet sayısı yüksek olmasına rağmen memnuniyet oranı veya anket puanı düşük?
  - Hangi müdürlüklerin çözüm süreleri çok uzuyor ve bu durum vatandaş memnuniyetine (anket skorlarına) nasıl yansıyor?
  - Altyapı, temizlik gibi kritik kategorilerdeki açık şikayetlerin genel gidişata etkisi nedir?
  - Muhtarların bölgelerindeki şikayet yoğunlukları ile oradaki genel memnuniyet arasında bir korelasyon var mı?
- Vatandaş Memnuniyeti Soruları: Başkan, vatandaş memnuniyeti, memnuniyet anketi puanları, birimlerin memnuniyet oranları veya mahallelere göre memnuniyet durumunu sorduğunda, yukarıda "MEMNUNİYET ANKETİ VERİLERİ" başlığı altındaki verileri kullanacaksın. 
- Genel memnuniyet oranını sormak ile "anket sonuçlarına göre memnuniyet puanını" sormak farklıdır:
  1) Şikayet çözüm oranı/Genel memnuniyet oranı derse: Çözülen şikayetlerin toplam şikayetlere oranıdır (örn: 18 / 29 = %62).
  2) Anket memnuniyeti/Vatandaş puanı derse: Vatandaşların WhatsApp üzerinden 1-5 arası verdiği oyların ortalamasını (örn: ${avgSatisfactionScore.toFixed(2)} / 5.0) ve memnuniyet oranını (örn: %${satisfactionRate.toFixed(1)}) vereceksin.
  3) Birim/Müdürlük ve Mahalle memnuniyetleri derse: yukarıdaki deptSatAvg ve nbrSatAvg detaylarını sunacaksın.
- MATEMATİKSEL İFADELERDE YAZIM KURALI: Matematiksel formülleri veya oranları gösterirken asla LaTeX biçimlendirmesi (örn: \\[ \\], \\frac, \\text vb.) kullanma. Tüm matematiksel hesaplamaları ve oranları sade bir metin olarak yaz (Örn: "Memnuniyet Oranı = (Çözülen Şikayetler / Toplam Şikayetler) * 100 = (18 / 29) * 100 = %62" veya doğrudan "%62" şeklinde yaz).
- Her zaman doğrudan, profesyonel, yapıcı ve rakamsal verilere sadık cevaplar hazırla. Belediye yönetiminin verimliliğini artıracak stratejik çıkarımlar yap.

${context}`;

      const r = await generateText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        messages: data.messages,
      });

      // log
      await supabaseAdmin.from("ai_bot_logs").insert({
        user_id: null, question: data.messages[data.messages.length - 1].content, answer: r.text,
      }).then(() => {}, () => {});

      return { answer: r.text };
    } catch (e: any) {
      return { answer: buildLocalAnswer(data.messages[data.messages.length - 1].content, { total, byNbr, byDept, deptAvg, inMaintenance }) };
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
