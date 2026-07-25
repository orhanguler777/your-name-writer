/**
 * 4 seviyeli yetki hiyerarşisi için gerçek hesapları kurar.
 *
 *   Seviye 1  Başkan             baskan
 *   Seviye 2  Başkan Yardımcısı  baskan_yardimcisi  (+ profiles.deputy_mayor_id)
 *   Seviye 3  Müdür              mudur              (+ profiles.department_id)
 *   Seviye 4  Saha Personeli     zabita_memuru      (+ profiles.department_id)
 *
 * Idempotent: tekrar çalıştırılabilir, mevcut kayıtları günceller.
 * Kullanım: node setup-hierarchy-accounts.js
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PASSWORD = 'Alanya90';

/** E-posta ile kullanıcı bulur, yoksa oluşturur; şifreyi sabitler. */
async function ensureUser(email, fullName) {
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === email);

  let userId;
  if (existing) {
    userId = existing.id;
    await supabase.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
    console.log(`   ↻ mevcut: ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
    });
    if (error) throw new Error(`${email} oluşturulamadı: ${error.message}`);
    userId = data.user.id;
    console.log(`   ＋ yeni: ${email}`);
  }
  return userId;
}

/** Profili günceller (departman / başkan yardımcısı bağlantısı). */
async function upsertProfile(userId, { email, fullName, departmentId = null, deputyMayorId = null }) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId, email, full_name: fullName,
    department_id: departmentId, deputy_mayor_id: deputyMayorId,
  });
  if (error) throw new Error(`profil hatası (${email}): ${error.message}`);
}

/** Kullanıcının rollerini tam olarak verilen listeye eşitler (fazlalıkları siler). */
async function setRoles(userId, roles) {
  const { data: current } = await supabase.from('user_roles').select('role').eq('user_id', userId);
  const have = (current ?? []).map((r) => r.role);

  for (const role of roles) {
    if (!have.includes(role)) {
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
      if (error) throw new Error(`rol eklenemedi (${role}): ${error.message}`);
    }
  }
  const extra = have.filter((r) => !roles.includes(r));
  if (extra.length) {
    await supabase.from('user_roles').delete().eq('user_id', userId).in('role', extra);
  }
  console.log(`   roller: [${roles.join(', ')}]${extra.length ? `  (kaldırıldı: ${extra.join(', ')})` : ''}`);
}

async function run() {
  console.log('🏛  4 seviyeli hiyerarşi hesapları kuruluyor...\n');

  // Zabıta Müdürlüğü
  const { data: zabitaDept } = await supabase
    .from('departments').select('id, name').ilike('name', '%abıta%').maybeSingle();
  if (!zabitaDept) throw new Error('Zabıta Müdürlüğü bulunamadı');

  // ── SEVİYE 2: Başkan Yardımcısı ────────────────────────────────────────────
  console.log('② Başkan Yardımcısı');
  let { data: deputy } = await supabase
    .from('deputy_mayors').select('id, full_name').eq('email', 'bskyrd@orhanguler.uk').maybeSingle();
  if (!deputy) {
    const { data, error } = await supabase.from('deputy_mayors')
      .insert({ full_name: 'Mehmet Demir', email: 'bskyrd@orhanguler.uk' })
      .select('id, full_name').single();
    if (error) throw new Error(`başkan yardımcısı kaydı: ${error.message}`);
    deputy = data;
    console.log(`   ＋ deputy_mayors kaydı: ${deputy.full_name}`);
  } else {
    console.log(`   ↻ mevcut deputy_mayors kaydı: ${deputy.full_name}`);
  }

  const deputyUserId = await ensureUser('bskyrd@orhanguler.uk', 'Mehmet Demir (Başkan Yardımcısı)');
  await upsertProfile(deputyUserId, {
    email: 'bskyrd@orhanguler.uk',
    fullName: 'Mehmet Demir',
    deputyMayorId: deputy.id,
  });
  await setRoles(deputyUserId, ['baskan_yardimcisi']);

  // Bu başkan yardımcısına bağlı müdürlükler (kapsam testi için)
  const bagli = ['Zabıta Müdürlüğü', 'Fen İşleri Müdürlüğü', 'Temizlik İşleri Müdürlüğü'];
  for (const name of bagli) {
    const { data: d } = await supabase.from('departments').select('id').eq('name', name).maybeSingle();
    if (d) await supabase.from('departments').update({ deputy_mayor_id: deputy.id }).eq('id', d.id);
  }
  console.log(`   bağlı müdürlükler: ${bagli.join(', ')}\n`);

  // ── SEVİYE 3: Zabıta Müdürü ────────────────────────────────────────────────
  console.log('③ Zabıta Müdürü');
  const mudurId = await ensureUser('zabita@orhanguler.uk', 'Zabıta Müdürü');
  await upsertProfile(mudurId, {
    email: 'zabita@orhanguler.uk',
    fullName: 'Zabıta Müdürü',
    departmentId: zabitaDept.id,
  });
  await setRoles(mudurId, ['mudur']);
  console.log('');

  // ── SEVİYE 4: Saha Zabıta Memuru ───────────────────────────────────────────
  console.log('④ Saha Zabıta Memuru');
  const memurId = await ensureUser('zabita.memur@orhanguler.uk', 'Ali Saha (Zabıta Memuru)');
  await upsertProfile(memurId, {
    email: 'zabita.memur@orhanguler.uk',
    fullName: 'Ali Saha',
    departmentId: zabitaDept.id,
  });
  await setRoles(memurId, ['zabita_memuru']);

  console.log('\n' + '═'.repeat(64));
  console.log('✅ HAZIR — Tüm hesaplar şifresi: ' + PASSWORD);
  console.table([
    { Seviye: '1 Başkan', 'E-posta': 'orhan777@gmail.com', Rol: 'baskan + admin' },
    { Seviye: '2 Başkan Yrd.', 'E-posta': 'bskyrd@orhanguler.uk', Rol: 'baskan_yardimcisi' },
    { Seviye: '3 Zabıta Müdürü', 'E-posta': 'zabita@orhanguler.uk', Rol: 'mudur' },
    { Seviye: '4 Saha Memuru', 'E-posta': 'zabita.memur@orhanguler.uk', Rol: 'zabita_memuru' },
  ]);
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
