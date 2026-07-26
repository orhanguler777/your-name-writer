import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// ─── Alanya Belediyesi Müdürlükleri (alanya.bel.tr) ──────────────
const departments = [
  {
    name: "Afet İşleri ve Risk Yönetimi Müdürlüğü",
    description: "Afet koordinasyonu, risk değerlendirmesi ve acil durum yönetimi",
  },
  {
    name: "Bilgi İşlem Müdürlüğü",
    description: "Bilişim altyapısı, yazılım ve donanım hizmetleri",
  },
  {
    name: "Destek Hizmetleri Müdürlüğü",
    description: "İdari destek, satın alma ve lojistik hizmetler",
  },
  {
    name: "Dış İlişkiler Müdürlüğü",
    description: "Uluslararası ilişkiler, kardeş şehirler ve protokol",
  },
  {
    name: "Emlak ve İstimlak Müdürlüğü",
    description: "Taşınmaz mal yönetimi, kamulaştırma ve kira işlemleri",
  },
  {
    name: "Fen İşleri Müdürlüğü",
    description: "Yol, asfalt, kaldırım, köprü ve altyapı çalışmaları",
  },
  {
    name: "Gelirler Müdürlüğü",
    description: "Belediye gelirleri, vergi ve harç tahsilat işlemleri",
  },
  {
    name: "Gençlik ve Spor Hizmetleri Müdürlüğü",
    description: "Gençlik merkezleri, spor tesisleri ve sportif etkinlikler",
  },
  {
    name: "Hukuk İşleri Müdürlüğü",
    description: "Hukuki danışmanlık, dava takibi ve sözleşme yönetimi",
  },
  {
    name: "İklim Değişikliği ve Sıfır Atık Müdürlüğü",
    description: "Çevre koruma, geri dönüşüm ve sıfır atık politikaları",
  },
  {
    name: "İmar ve Şehircilik Müdürlüğü",
    description: "İmar planları, yapı ruhsatları, kaçak yapı denetimi ve şehir planlama",
  },
  {
    name: "İnsan Kaynakları ve Eğitim Müdürlüğü",
    description: "Personel yönetimi, işe alım ve hizmet içi eğitimler",
  },
  {
    name: "İşletme ve İştirakler Müdürlüğü",
    description: "Belediye işletmeleri ve şirket iştirakleri yönetimi",
  },
  {
    name: "Kentsel Dönüşüm Müdürlüğü",
    description: "Kentsel dönüşüm projeleri ve riskli yapı tespit işlemleri",
  },
  {
    name: "Kentsel Tasarım Müdürlüğü",
    description: "Şehir estetiği, peyzaj düzenlemesi ve kentsel tasarım projeleri",
  },
  {
    name: "Kırsal Hizmetler Müdürlüğü",
    description: "Kırsal alan altyapısı, tarımsal destek ve köy hizmetleri",
  },
  {
    name: "Kültür, Sanat ve Sosyal İşler Müdürlüğü",
    description: "Kültürel etkinlikler, sanat faaliyetleri ve sosyal projeler",
  },
  { name: "Kütüphane ve Müzeler Müdürlüğü", description: "Halk kütüphaneleri ve müze yönetimi" },
  {
    name: "Makina İkmal Bakım ve Onarım Müdürlüğü",
    description: "Araç filosu bakımı, onarımı ve yedek parça tedariki",
  },
  { name: "Mali Hizmetler Müdürlüğü", description: "Bütçe hazırlama, muhasebe ve mali raporlama" },
  {
    name: "Muhtarlık İşleri Müdürlüğü",
    description: "Muhtarlık koordinasyonu ve mahalle talep yönetimi",
  },
  {
    name: "Özel Kalem Müdürlüğü",
    description: "Başkanlık sekretaryası, randevu ve protokol işleri",
  },
  {
    name: "Park ve Bahçeler Müdürlüğü",
    description: "Parklar, yeşil alanlar, ağaç budama, çiçeklendirme ve peyzaj",
  },
  {
    name: "Plan ve Proje Müdürlüğü",
    description: "Proje geliştirme, ihale hazırlık ve teknik planlama",
  },
  {
    name: "Ruhsat ve Denetim Müdürlüğü",
    description: "İşyeri açma ve çalışma ruhsatları, denetim faaliyetleri",
  },
  {
    name: "Sosyal Hizmetler Müdürlüğü",
    description: "Sosyal yardımlar, engelli hizmetleri ve toplumsal destek",
  },
  {
    name: "Strateji Geliştirme Müdürlüğü",
    description: "Stratejik planlama, performans yönetimi ve kurumsal gelişim",
  },
  { name: "Teftiş Kurulu Müdürlüğü", description: "İç denetim, teftiş ve soruşturma işlemleri" },
  {
    name: "Temizlik İşleri Müdürlüğü",
    description: "Çöp toplama, sokak temizliği, konteyner yönetimi ve atık bertarafı",
  },
  {
    name: "Veteriner İşleri Müdürlüğü",
    description: "Sokak hayvanları rehabilitasyonu, aşılama ve hayvan barınağı",
  },
  {
    name: "Yapı Kontrol Müdürlüğü",
    description: "Yapı denetimi, iskân ruhsatları ve bina güvenliği",
  },
  {
    name: "Yazı İşleri Müdürlüğü",
    description: "Resmi yazışmalar, meclis kararları ve evrak yönetimi",
  },
  {
    name: "Zabıta Müdürlüğü",
    description: "Çevre düzeni, gürültü denetimi, seyyar satıcı kontrolü ve kamu düzeni",
  },
];

// ─── Alanya Mahalleleri (102 Mahalle) ────────────────────────────
const neighborhoods = [
  { name: "Akçatı", district: "Alanya" },
  { name: "Akdam", district: "Alanya" },
  { name: "Alacami", district: "Alanya" },
  { name: "Alara", district: "Alanya" },
  { name: "Aliefendi", district: "Alanya" },
  { name: "Asmaca", district: "Alanya" },
  { name: "Avsallar", district: "Alanya" },
  { name: "Bademağacı", district: "Alanya" },
  { name: "Basırlı", district: "Alanya" },
  { name: "Başköy", district: "Alanya" },
  { name: "Bayır", district: "Alanya" },
  { name: "Bayırkozağacı", district: "Alanya" },
  { name: "Bektaş", district: "Alanya" },
  { name: "Beldibi", district: "Alanya" },
  { name: "Beyreli", district: "Alanya" },
  { name: "Bıçakçı", district: "Alanya" },
  { name: "Bucakköy", district: "Alanya" },
  { name: "Burçaklar", district: "Alanya" },
  { name: "Büyükhasbahçe", district: "Alanya" },
  { name: "Büyükpınar", district: "Alanya" },
  { name: "Cikcilli", district: "Alanya" },
  { name: "Cumhuriyet", district: "Alanya" },
  { name: "Çakallar", district: "Alanya" },
  { name: "Çamlıca", district: "Alanya" },
  { name: "Çarşı", district: "Alanya" },
  { name: "Çıplaklı", district: "Alanya" },
  { name: "Değirmendere", district: "Alanya" },
  { name: "Demirtaş", district: "Alanya" },
  { name: "Dereköy", district: "Alanya" },
  { name: "Dinek", district: "Alanya" },
  { name: "Elikesik", district: "Alanya" },
  { name: "Emişbeleni", district: "Alanya" },
  { name: "Fakırcalı", district: "Alanya" },
  { name: "Fığla", district: "Alanya" },
  { name: "Gözübüyük", district: "Alanya" },
  { name: "Gözüküçüklü", district: "Alanya" },
  { name: "Güllerpınarı", district: "Alanya" },
  { name: "Gümüşgöze", district: "Alanya" },
  { name: "Gümüşkavak", district: "Alanya" },
  { name: "Güneyköy", district: "Alanya" },
  { name: "Güzelbağ", district: "Alanya" },
  { name: "Hacet", district: "Alanya" },
  { name: "Hacıkerimler", district: "Alanya" },
  { name: "Hacımehmetli", district: "Alanya" },
  { name: "Hisariçi", district: "Alanya" },
  { name: "Hocalar", district: "Alanya" },
  { name: "İmamlı", district: "Alanya" },
  { name: "İncekum", district: "Alanya" },
  { name: "İshaklı", district: "Alanya" },
  { name: "İspatlı", district: "Alanya" },
  { name: "Kadıpaşa", district: "Alanya" },
  { name: "Karakocalı", district: "Alanya" },
  { name: "Karamanlar", district: "Alanya" },
  { name: "Karapınar", district: "Alanya" },
  { name: "Kargıcak", district: "Alanya" },
  { name: "Kayabaşı", district: "Alanya" },
  { name: "Kestel", district: "Alanya" },
  { name: "Keşefli", district: "Alanya" },
  { name: "Kızılcaşehir", district: "Alanya" },
  { name: "Kızlarpınarı", district: "Alanya" },
  { name: "Kocaoğlanlı", district: "Alanya" },
  { name: "Konaklı", district: "Alanya" },
  { name: "Kuzyaka", district: "Alanya" },
  { name: "Küçükhasbahçe", district: "Alanya" },
  { name: "Mahmutlar", district: "Alanya" },
  { name: "Mahmutseydi", district: "Alanya" },
  { name: "Oba", district: "Alanya" },
  { name: "Obaalacami", district: "Alanya" },
  { name: "Okurcalar", district: "Alanya" },
  { name: "Orhanköy", district: "Alanya" },
  { name: "Öteköy", district: "Alanya" },
  { name: "Özvadi", district: "Alanya" },
  { name: "Paşaköy", district: "Alanya" },
  { name: "Payallar", district: "Alanya" },
  { name: "Saburlar", district: "Alanya" },
  { name: "Sapadere", district: "Alanya" },
  { name: "Saray", district: "Alanya" },
  { name: "Seki", district: "Alanya" },
  { name: "Soğukpınar", district: "Alanya" },
  { name: "Sugözü", district: "Alanya" },
  { name: "Süleymanlar", district: "Alanya" },
  { name: "Şekerhane", district: "Alanya" },
  { name: "Şeyhler", district: "Alanya" },
  { name: "Taşbaşı", district: "Alanya" },
  { name: "Tepe", district: "Alanya" },
  { name: "Tırılar", district: "Alanya" },
  { name: "Tophane", district: "Alanya" },
  { name: "Toslak", district: "Alanya" },
  { name: "Tosmur", district: "Alanya" },
  { name: "Türkler", district: "Alanya" },
  { name: "Türktaş", district: "Alanya" },
  { name: "Uğrak", district: "Alanya" },
  { name: "Uğurlu", district: "Alanya" },
  { name: "Uzunöz", district: "Alanya" },
  { name: "Üzümlü", district: "Alanya" },
  { name: "Yalçı", district: "Alanya" },
  { name: "Yasırali", district: "Alanya" },
  { name: "Yaylakonak", district: "Alanya" },
  { name: "Yaylalı", district: "Alanya" },
  { name: "Yenice", district: "Alanya" },
  { name: "Yeşilöz", district: "Alanya" },
  { name: "Yeşilvadi", district: "Alanya" },
];

async function seedAlanya() {
  console.log("🏛️ Alanya Belediyesi veritabanı tohumlama başlıyor...\n");

  // ── 1. Eski dummy müdürlükleri sil ──
  console.log("🗑️ Eski müdürlükler temizleniyor...");
  const { data: oldDepts } = await supabase.from("departments").select("id, name");
  if (oldDepts && oldDepts.length > 0) {
    const { error: delErr } = await supabase
      .from("departments")
      .delete()
      .in(
        "id",
        oldDepts.map((d) => d.id),
      );
    if (delErr) {
      console.error("⚠️ Eski müdürlükler silinemedi:", delErr.message);
    } else {
      console.log(`   ${oldDepts.length} eski müdürlük silindi.`);
    }
  }

  // ── 2. Eski dummy mahalleleri sil ──
  console.log("🗑️ Eski mahalleler temizleniyor...");
  const { data: oldNeighborhoods } = await supabase.from("neighborhoods").select("id");
  if (oldNeighborhoods && oldNeighborhoods.length > 0) {
    const { error: delErr } = await supabase
      .from("neighborhoods")
      .delete()
      .in(
        "id",
        oldNeighborhoods.map((n) => n.id),
      );
    if (delErr) {
      console.error("⚠️ Eski mahalleler silinemedi:", delErr.message);
    } else {
      console.log(`   ${oldNeighborhoods.length} eski mahalle silindi.`);
    }
  }

  // ── 3. Gerçek Alanya müdürlüklerini ekle ──
  console.log("\n🏢 Alanya Belediyesi müdürlükleri ekleniyor...");
  const { data: insertedDepts, error: deptErr } = await supabase
    .from("departments")
    .insert(departments)
    .select();

  if (deptErr) {
    console.error("❌ Müdürlük ekleme hatası:", deptErr.message);
  } else {
    console.log(`   ✅ ${insertedDepts.length} müdürlük başarıyla eklendi.`);
  }

  // ── 4. Gerçek Alanya mahallelerini ekle ──
  console.log("\n🏘️ Alanya mahalleleri ekleniyor...");
  const { data: insertedNeighborhoods, error: neighErr } = await supabase
    .from("neighborhoods")
    .insert(neighborhoods)
    .select();

  if (neighErr) {
    console.error("❌ Mahalle ekleme hatası:", neighErr.message);
  } else {
    console.log(`   ✅ ${insertedNeighborhoods.length} mahalle başarıyla eklendi.`);
  }

  // ── 5. Eski dummy şikayetleri sil ──
  console.log("\n🗑️ Test şikayetleri temizleniyor...");
  const { data: oldComplaints } = await supabase.from("complaints").select("id");
  if (oldComplaints && oldComplaints.length > 0) {
    // Önce ilişkili ekleri sil
    await supabase
      .from("complaint_attachments")
      .delete()
      .in(
        "complaint_id",
        oldComplaints.map((c) => c.id),
      );
    // Sonra şikayetleri sil
    const { error: delErr } = await supabase
      .from("complaints")
      .delete()
      .in(
        "id",
        oldComplaints.map((c) => c.id),
      );
    if (delErr) {
      console.error("⚠️ Eski şikayetler silinemedi:", delErr.message);
    } else {
      console.log(`   ${oldComplaints.length} eski şikayet silindi.`);
    }
  }

  // ── Özet ──
  console.log("\n" + "═".repeat(50));
  console.log("🎉 Alanya Belediyesi veritabanı hazır!");
  console.log(`   🏢 ${departments.length} Müdürlük`);
  console.log(`   🏘️ ${neighborhoods.length} Mahalle`);
  console.log("   👤 Belediye Başkanı: Osman Tarık Özçelik");
  console.log("═".repeat(50));
}

seedAlanya();
