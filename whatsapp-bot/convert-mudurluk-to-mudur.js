/**
 * Eski "mudurluk" rolündeki birim hesaplarını yeni hiyerarşiye taşır:
 *   mudurluk  →  mudur   (Birim Müdürü, 3. seviye)
 *
 * Her müdürlüğün tek hesabı olduğu için bunlar o birimin müdürü kabul edilir.
 * Görevli (personel) hesapları ayrıca açılır — bu script mevcut hesapları taşır.
 *
 * Kullanım:
 *   node convert-mudurluk-to-mudur.js          → sadece raporlar (değişiklik yapmaz)
 *   node convert-mudurluk-to-mudur.js --apply  → uygular
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

/** Müdürlük adını e-posta önekine çevirir (hesapları açan seed script'iyle aynı kural). */
function toCleanPrefix(name) {
  return name
    .toLowerCase()
    .replace(' müdürlüğü', '').replace(' mudurlugu', '')
    .replace(' birimi', '').replace(' memurluğu', '')
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

async function run() {
  const [{ data: roles }, { data: profiles }, { data: depts }] = await Promise.all([
    supabase.from('user_roles').select('user_id, role'),
    supabase.from('profiles').select('id, email, full_name, department_id'),
    supabase.from('departments').select('id, name'),
  ]);

  const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const rolesByUser = new Map();
  (roles ?? []).forEach((r) => {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
    rolesByUser.get(r.user_id).push(r.role);
  });

  // Dönüştürülecekler: 'mudurluk' rolü olup daha üst kademesi olmayanlar
  const UPPER = ['admin', 'superuser', 'baskan', 'baskan_yardimcisi', 'cozum_masasi'];
  const targets = (profiles ?? []).filter((p) => {
    const rs = rolesByUser.get(p.id) ?? [];
    return rs.includes('mudurluk') && !rs.some((r) => UPPER.includes(r));
  });

  console.log(`${APPLY ? '⚙️  UYGULANIYOR' : '🔍 ÖN İZLEME (değişiklik yapılmıyor)'} — ${targets.length} hesap\n`);

  // E-posta önekinden doğru müdürlüğü bul (hesap adları müdürlük adından üretilmişti)
  const deptByPrefix = new Map((depts ?? []).map((d) => [toCleanPrefix(d.name), d]));

  const rows = [];
  let noDept = 0;
  let fixedDept = 0;

  for (const p of targets) {
    const rs = rolesByUser.get(p.id) ?? [];
    const dept = p.department_id ? deptName.get(p.department_id) : null;
    const prefix = String(p.email ?? '').split('@')[0];
    const expected = deptByPrefix.get(prefix) ?? null;
    // Beklenen birim biliniyor ve mevcut birim farklıysa onarılacak
    const needsFix = !!expected && expected.id !== p.department_id;
    if (!dept && !expected) noDept++;
    if (needsFix) fixedDept++;

    rows.push({
      'E-posta': p.email,
      Birim: dept ?? '— BİRİM YOK —',
      'Birim düzeltmesi': needsFix ? `→ ${expected.name}` : '',
      'Eski roller': rs.join(', '),
      'Yeni rol': 'mudur',
    });

    if (APPLY && needsFix) {
      const { error: dErr } = await supabase
        .from('profiles').update({ department_id: expected.id }).eq('id', p.id);
      if (dErr) console.error(`⚠️ ${p.email} birim düzeltilemedi: ${dErr.message}`);
    }

    if (APPLY) {
      // Tek kademe = tek rol
      const { error: delErr } = await supabase.from('user_roles').delete().eq('user_id', p.id);
      if (delErr) { console.error(`❌ ${p.email}: ${delErr.message}`); continue; }
      const { error: insErr } = await supabase.from('user_roles').insert({ user_id: p.id, role: 'mudur' });
      if (insErr) console.error(`❌ ${p.email}: ${insErr.message}`);
    }
  }

  console.table(rows);
  if (fixedDept > 0) {
    console.log(`🔧 ${fixedDept} hesabın birimi e-posta önekine göre düzeltilecek/düzeltildi.`);
  }
  if (noDept > 0) {
    console.log(`⚠️  ${noDept} hesabın birimi tanımlı değil — Rol & Birim Atama ekranından birim seçilmeli.`);
  }
  if (!APPLY) {
    console.log('\nUygulamak için:  node convert-mudurluk-to-mudur.js --apply');
  } else {
    console.log('\n✅ Tamamlandı. Etkilenen kullanıcılar yeniden giriş yaptığında yeni menülerini görür.');
  }
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
