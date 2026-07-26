import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function makeAdmin() {
  console.log("🔍 Kullanıcılar taranıyor...");

  // Tüm profilleri çek
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id, full_name, email");

  if (profileErr) {
    console.error("❌ Profiller çekilemedi:", profileErr.message);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log("⚠️ Veritabanında henüz kayıtlı profil bulunamadı.");
    return;
  }

  console.log("👥 Kayıtlı Kullanıcılar:");
  profiles.forEach((p) => console.log(`- ID: ${p.id} | İsim: ${p.full_name} | Email: ${p.email}`));

  // 'yonetici' ismindeki veya listedeki ilk kullanıcıyı admin yapalım
  const targetUser = profiles.find((p) => p.full_name === "yonetici") || profiles[0];

  console.log(`\n👑 Yetkilendirilecek Kullanıcı: ${targetUser.full_name} (${targetUser.email})`);

  // Mevcut rollerini kontrol et
  const { data: existingRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUser.id);

  const roles = existingRoles?.map((r) => r.role) || [];
  console.log(`📋 Mevcut Rolleri: ${roles.join(", ")}`);

  if (roles.includes("admin")) {
    console.log("✅ Bu kullanıcı zaten ADMIN yetkisine sahip.");
    return;
  }

  // Admin rolünü ekle
  const { error: insertErr } = await supabase.from("user_roles").insert({
    user_id: targetUser.id,
    role: "admin",
  });

  if (insertErr) {
    console.error("❌ Yetkilendirme hatası:", insertErr.message);
  } else {
    console.log(`🎉 ${targetUser.full_name} kullanıcısına başarıyla ADMIN yetkisi tanımlandı!`);
    console.log(
      "ℹ️ Değişikliğin geçerli olması için web panelinden çıkış yapıp tekrar giriş yapın.",
    );
  }
}

makeAdmin();
