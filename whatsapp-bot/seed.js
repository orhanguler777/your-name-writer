import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const departments = [
  { name: 'Fen İşleri Müdürlüğü', description: 'Yol, kaldırım, asfalt ve altyapı işleri' },
  { name: 'Temizlik İşleri Müdürlüğü', description: 'Çöp toplama, sokak temizliği ve atık yönetimi' },
  { name: 'Park ve Bahçeler Müdürlüğü', description: 'Parklar, yeşil alanlar, ağaç budama ve peyzaj' },
  { name: 'Ruhsat ve Denetim Müdürlüğü', description: 'İşyeri açma ve çalışma ruhsatları' },
  { name: 'İmar ve Şehircilik Müdürlüğü', description: 'İmar planları, kaçak yapı denetimi ve inşaat izinleri' },
  { name: 'Su ve Kanalizasyon Müdürlüğü', description: 'Su şebekesi, kanalizasyon, su patlakları ve altyapı' },
  { name: 'Ulaşım Hizmetleri Müdürlüğü', description: 'Toplu taşıma, duraklar ve trafik düzenlemeleri' },
  { name: 'Veteriner İşleri Müdürlüğü', description: 'Sokak hayvanları rehabilitasyon ve bakım hizmetleri' },
  { name: 'Evlendirme Memurluğu', description: 'Nikah ve evlilik işlemleri' },
  { name: 'Numarataj Birimi', description: 'Adres ve numaralandırma işlemleri' },
  { name: 'Zabıta Müdürlüğü', description: 'Denetim, gürültü kontrolü ve çevre düzeni' },
  { name: 'Kültür ve Sosyal İşler Müdürlüğü', description: 'Sosyal yardımlar ve kültürel etkinlikler' }
];

async function seed() {
  console.log('🌱 Müdürlükler veritabanına ekleniyor...');
  
  // Önce mevcut müdürlükleri kontrol et
  const { data: existing } = await supabase.from('departments').select('name');
  const existingNames = new Set(existing?.map(d => d.name) || []);

  const toInsert = departments.filter(d => !existingNames.has(d.name));

  if (toInsert.length === 0) {
    console.log('✅ Tüm müdürlükler zaten eklenmiş.');
    return;
  }

  const { error } = await supabase.from('departments').insert(toInsert);

  if (error) {
    console.error('❌ Ekleme sırasında hata oluştu:', error.message);
  } else {
    console.log(`✅ ${toInsert.length} yeni müdürlük başarıyla eklendi!`);
  }
}

seed();
