import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function toCleanPrefix(name) {
  return name
    .toLowerCase()
    .replace(' müdürlüğü', '')
    .replace(' mudurlugu', '')
    .replace(' birimi', '')
    .replace(' memurluğu', '')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function createDeptUsers() {
  console.log('🚀 Alanya Belediyesi Müdürlük Kullanıcıları Oluşturma Başlıyor...\n');

  // 1. Müdürlükleri DB'den çek
  const { data: depts, error: fetchErr } = await supabase.from('departments').select('id, name');
  if (fetchErr) {
    console.error('❌ Müdürlükler çekilemedi:', fetchErr.message);
    return;
  }

  console.log(`ℹ️ Toplam ${depts.length} müdürlük bulundu. Kullanıcı hesapları açılıyor...\n`);

  const createdUsers = [];

  for (const dept of depts) {
    const prefix = toCleanPrefix(dept.name);
    const email = `${prefix}@orhanguler.uk`;
    const password = 'Alanya90';

    try {
      // Önce bu email ile kullanıcı var mı kontrol et
      // Auth admin API ile sorgulama
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const userExists = existingUsers?.users?.find(u => u.email === email);

      let userId;

      if (userExists) {
        console.log(`ℹ️ ${email} zaten mevcut, profili ve rolleri güncelleniyor...`);
        userId = userExists.id;

        // Mevcut kullanıcının şifresini "Alanya90" olarak güncelle
        const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(userId, {
          password: password,
          email_confirm: true
        });
        if (updateAuthErr) {
          console.error(`⚠️ ${email} şifresi güncellenemedi:`, updateAuthErr.message);
        }
      } else {
        // Yeni kullanıcı oluştur
        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: true
        });

        if (authErr) {
          console.error(`❌ ${email} oluşturulurken hata:`, authErr.message);
          continue;
        }

        userId = authData.user.id;
        console.log(`👤 ${email} kullanıcısı başarıyla oluşturuldu.`);
      }

      // 2. Profilini güncelle/oluştur
      const { error: profileErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: `${dept.name} Görevlisi`,
          email: email,
          department_id: dept.id
        });

      if (profileErr) {
        console.error(`⚠️ ${email} için profil oluşturulamadı:`, profileErr.message);
        continue;
      }

      // 3. Kullanıcı rolünü 'mudurluk' yap
      // Önce mevcut rolü var mı kontrol edelim
      const { data: existingRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .eq('role', 'mudurluk');

      if (!existingRoles || existingRoles.length === 0) {
        const { error: roleErr } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            role: 'mudurluk'
          });

        if (roleErr) {
          console.error(`⚠️ ${email} için rol tanımlanamadı:`, roleErr.message);
          continue;
        }
      }

      createdUsers.push({
        Müdürlük: dept.name,
        Eposta: email,
        Şifre: password
      });

    } catch (err) {
      console.error(`⚠️ ${email} için beklenmeyen hata:`, err.message);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 TÜM KULLANICILAR BAŞARIYLA OLUŞTURULDU VEYA GÜNCELLENDİ!');
  console.log('═'.repeat(60));
  console.table(createdUsers);
  console.log('═'.repeat(60));
  console.log('\n💡 Artık bu e-postalar ve "Alanya90" şifresi ile müdürlük girişlerini yapabilirsiniz!');
}

createDeptUsers();
