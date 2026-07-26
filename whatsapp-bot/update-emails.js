import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateEmailsAndCreateCozumMasasi() {
  console.log("🚀 E-posta adresleri güncelleniyor ve Çözüm Masası hesabı oluşturuluyor...\n");

  // 1. Mevcut kullanıcıları çek ve e-postalarını güncelle
  const { data: users, error: fetchErr } = await supabase.auth.admin.listUsers();

  if (fetchErr) {
    console.error("❌ Kullanıcılar çekilemedi:", fetchErr.message);
    return;
  }

  let updatedCount = 0;

  for (const user of users.users) {
    if (user.email.endsWith("@alanya.bel.tr")) {
      const newEmail = user.email.replace("@alanya.bel.tr", "@orhanguler.uk");

      try {
        // Auth güncelle
        const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(user.id, {
          email: newEmail,
          email_confirm: true,
        });

        if (updateAuthErr) {
          console.error(
            `⚠️ ${user.email} -> ${newEmail} (Auth) güncellenemedi:`,
            updateAuthErr.message,
          );
          continue;
        }

        // Profile güncelle
        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ email: newEmail })
          .eq("id", user.id);

        if (profileErr) {
          console.error(
            `⚠️ ${user.email} -> ${newEmail} (Profile) güncellenemedi:`,
            profileErr.message,
          );
          continue;
        }

        console.log(`✅ Güncellendi: ${user.email} -> ${newEmail}`);
        updatedCount++;
      } catch (e) {
        console.error(`Beklenmeyen hata: ${user.email}`, e.message);
      }
    }
  }
  console.log(`\n✅ Toplam ${updatedCount} müdürlük e-postası güncellendi.\n`);

  // 2. Çözüm Masası Hesabı Oluşturma
  const cozumEmail = "cozummasasi@orhanguler.uk";
  const password = "Alanya90";

  console.log(`🚀 Çözüm Masası hesabı oluşturuluyor: ${cozumEmail} ...`);

  let userId;
  const userExists = users.users.find((u) => u.email === cozumEmail);

  if (userExists) {
    console.log(`ℹ️ ${cozumEmail} zaten mevcut, profili güncelleniyor...`);
    userId = userExists.id;
    // Şifreyi de garanti edelim
    await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
  } else {
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: cozumEmail,
      password: password,
      email_confirm: true,
    });

    if (authErr) {
      console.error(`❌ Çözüm masası hesabı oluşturulamadı:`, authErr.message);
      return;
    }
    userId = authData.user.id;
    console.log(`✅ Çözüm masası hesabı auth tarafında oluşturuldu.`);
  }

  // Çözüm masası profil
  const { error: profileErr } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: `Çözüm Masası Görevlisi`,
    email: cozumEmail,
    // department_id null olabilir veya ilgili id ise eklenebilir, cozum masası ana hesap olduğu için null bırakıyoruz
  });

  if (profileErr) {
    console.error(`⚠️ Çözüm masası profil oluşturulamadı:`, profileErr.message);
  }

  // Çözüm masası rolü
  const { data: existingRoles } = await supabase
    .from("user_roles")
    .select("*")
    .eq("user_id", userId)
    .eq("role", "cozum_masasi");

  if (!existingRoles || existingRoles.length === 0) {
    const { error: roleErr } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "cozum_masasi",
    });

    if (roleErr) {
      console.error(`⚠️ Çözüm masası rolü eklenemedi:`, roleErr.message);
    } else {
      console.log(`✅ Çözüm masası rolü atandı.`);
    }
  } else {
    console.log(`✅ Çözüm masası rolü zaten mevcut.`);
  }

  console.log("\n🎉 İŞLEM TAMAMLANDI!");
  console.log("Müdürlük Hesapları: [mudurluk]@orhanguler.uk | Şifre: Alanya90");
  console.log(`Çözüm Masası Hesabı: ${cozumEmail} | Şifre: Alanya90`);
}

updateEmailsAndCreateCozumMasasi();
