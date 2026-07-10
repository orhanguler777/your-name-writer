import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Alanya 2026 Etkinlik Takvimi (Resmi Posterden) ──────────────
const events = [
  {
    title: '10. Uluslararası Alanya Karikatür Yarışması',
    start_date: '2026-01-13',
    end_date: '2026-04-01',
    description: 'Alanya Belediyesi tarafından düzenlenen 10. Uluslararası Karikatür Yarışması. Dünya genelinden karikatüristlerin katıldığı bu yarışma, 13 Ocak - 1 Nisan 2026 tarihleri arasında eser kabul etmektedir. Alanya\'nın kültür ve sanat hayatına büyük katkı sağlayan uluslararası bir etkinliktir.'
  },
  {
    title: 'Ramazan Meydanı Etkinlikleri',
    start_date: '2026-02-19',
    end_date: '2026-03-19',
    description: 'Ramazan Meydanı Etkinlikleri, 19 Şubat - 19 Mart 2026 tarihleri arasında Alanya\'da düzenlenecektir. Ramazan ayı boyunca iftar programları, mahya gösterileri, Hacivat-Karagöz, ilahi ve semazen gösterileri, çocuk etkinlikleri ve kültürel programlar gerçekleştirilecektir.'
  },
  {
    title: '8. Uluslararası Alanya Çocuk Festivali',
    start_date: '2026-04-25',
    end_date: '2026-04-26',
    description: '8. Uluslararası Alanya Çocuk Festivali, 25-26 Nisan 2026 tarihlerinde düzenlenecektir. Farklı ülkelerden çocuk gruplarının dans, müzik ve gösteri sunduğu bu festival, 23 Nisan Ulusal Egemenlik ve Çocuk Bayramı kutlamaları kapsamında gerçekleştirilmektedir.'
  },
  {
    title: '12. Liselerarası Tiyatro Festivali',
    start_date: '2026-05-01',
    end_date: '2026-05-31',
    description: '12. Liselerarası Tiyatro Festivali, 1-31 Mayıs 2026 tarihleri arasında düzenlenecektir. Alanya ve çevre ilçelerdeki liselerin tiyatro topluluklarının sahne aldığı bu festival, gençlerin sanat ve kültür hayatına katkı sağlamaktadır.'
  },
  {
    title: '24. Uluslararası Alanya Kültür, Sanat ve Turizm Festivali',
    start_date: '2026-05-22',
    end_date: '2026-05-24',
    description: '24. Uluslararası Alanya Kültür, Sanat ve Turizm Festivali, 22-24 Mayıs 2026 tarihlerinde düzenlenecektir. Yerli ve yabancı sanatçıların katılımıyla konserler, sergiler, halk dansları gösterileri, panel ve söyleşiler, yöresel lezzetler tanıtımı ve birçok kültürel etkinlik yapılacaktır.'
  },
  {
    title: 'Tarihi Mekanlardan Yükselen Müzik Tınıları',
    start_date: '2026-05-16',
    end_date: '2026-11-14',
    description: 'Tarihi Mekanlardan Yükselen Müzik Tınıları konserleri, 2026 yılı boyunca çeşitli tarihlerde düzenlenecektir: 16 Mayıs, 20 Haziran, 18 Temmuz, 15 Ağustos, 17 Ekim ve 14 Kasım 2026. Alanya Kalesi, Kızılkule, Tersane gibi tarihi mekanlarda klasik müzik, Türk sanat müziği ve çeşitli konserler verilecektir.'
  },
  {
    title: 'Keykubad Göç ve Kervan Yürüyüş Yolu Etkinliği',
    start_date: '2026-06-07',
    end_date: '2026-09-13',
    description: 'Keykubad Göç ve Kervan Yürüyüş Yolu Etkinliği, 7 Haziran 2026 tarihinde başlayacak olup 13 Eylül\'e kadar devam edecektir. Selçuklu Sultanı Alaaddin Keykubad\'ın Alanya fethini anımsatan tarihi bir yürüyüş rotası etkinliğidir. Doğa yürüyüşü, kültürel tanıtımlar ve tarihi canlandırmalar içermektedir.'
  },
  {
    title: '2026 Volleyball World Beach Pro Tour Challenge Turnuvası',
    start_date: '2026-06-10',
    end_date: '2026-06-14',
    description: '2026 FIVB Dünya Plaj Voleybolu Pro Tour Challenge Turnuvası, 10-14 Haziran 2026 tarihlerinde Alanya sahillerinde gerçekleşecektir. Dünyanın en iyi plaj voleybolu sporcularının yarıştığı uluslararası bir spor organizasyonudur. Ücretsiz izlenebilir.'
  },
  {
    title: '20. Geleneksel Gökbel Yağlı Pehlivan Güreşleri ve Festivali',
    start_date: '2026-07-30',
    end_date: '2026-08-02',
    description: '700 yılı aşkın geleneğe sahip 20. Geleneksel Gökbel Yağlı Pehlivan Güreşleri ve Festivali, 30 Temmuz - 2 Ağustos 2026 tarihlerinde Alanya Gökbel Yaylası\'nda düzenlenecektir. Yağlı güreş müsabakaları, konserler, yöresel ürün stantları ve kültürel etkinlikler yer almaktadır.'
  },
  {
    title: '20. Uluslararası Alanya Caz Festivali',
    start_date: '2026-09-17',
    end_date: '2026-09-20',
    description: '20. Uluslararası Alanya Caz Festivali, 17-20 Eylül 2026 tarihlerinde gerçekleşecektir. "Tropikalin Kalbi Alanya" sloganıyla düzenlenen festival, yerli ve yabancı caz sanatçılarını ağırlamaktadır. Alanya Kalesi, Kızılkule ve çeşitli açık hava sahnelerinde konserler düzenlenecektir.'
  },
  {
    title: '8. Alanya Kitap Fuarı',
    start_date: '2026-09-25',
    end_date: '2026-10-04',
    description: '8. Alanya Kitap Fuarı, 25 Eylül - 4 Ekim 2026 tarihlerinde düzenlenecektir. Yayınevleri, yazarlar ve okurların buluştuğu bu fuarda; kitap imza günleri, söyleşiler, paneller, çocuklara yönelik etkinlikler ve indirimli kitap satışları gerçekleştirilecektir.'
  },
  {
    title: '5. Alanya Tropikal Meyve Festivali',
    start_date: '2026-10-09',
    end_date: '2026-10-11',
    description: '5. Alanya Tropikal Meyve Festivali, 9-11 Ekim 2026 tarihlerinde düzenlenecektir. Alanya\'nın tropik ikliminde yetişen muz, avokado, ejder meyvesi gibi tropikal meyvelerin tanıtıldığı bu festivalde; tadım stantları, yarışmalar, konserler ve çeşitli etkinlikler yer almaktadır.'
  },
  {
    title: '35. Uluslararası Alanya Triatlonu',
    start_date: '2026-10-23',
    end_date: '2026-10-25',
    description: '35. Uluslararası Alanya Triatlonu, 23-25 Ekim 2026 tarihlerinde düzenlenecektir. Dünya Triatlon Birliği (World Triathlon) takviminde yer alan bu organizasyon, Alanya\'nın ev sahipliğinde yüzme, bisiklet ve koşu branşlarında uluslararası sporcuların mücadele ettiği prestijli bir spor etkinliğidir.'
  },
  {
    title: '21. Uluslararası Alanya Taş Heykel Sempozyumu',
    start_date: '2026-11-01',
    end_date: '2026-11-30',
    description: '21. Uluslararası Alanya Taş Heykel Sempozyumu, 1-30 Kasım 2026 tarihleri arasında düzenlenecektir. Dünya genelinden heykeltıraşların katıldığı bu sempozyumda, sanatçılar bir ay boyunca Alanya\'da taş heykel eserleri üretmektedir. Eserler şehrin çeşitli noktalarına yerleştirilmektedir.'
  },
  {
    title: '16. Uluslararası Alanya Noel Pazarı',
    start_date: '2026-12-12',
    end_date: '2026-12-19',
    description: '16. Uluslararası Alanya Noel Pazarı, 12-19 Aralık 2026 tarihlerinde düzenlenecektir. Alanya\'da yaşayan yabancı uyruklu vatandaşların ve turistlerin yoğun ilgi gösterdiği bu pazarda; yılbaşı süsleri, el sanatları, yiyecek-içecek stantları ve canlı müzik performansları yer almaktadır.'
  },
];

async function seedEvents() {
  console.log('🎉 Alanya 2026 Etkinlik Takvimi yükleniyor...\n');

  // Eski etkinlikleri temizle
  console.log('🗑️ Eski etkinlikler temizleniyor...');
  const { data: oldEvents } = await supabase.from('events').select('id');
  if (oldEvents && oldEvents.length > 0) {
    const { error: delErr } = await supabase
      .from('events')
      .delete()
      .in('id', oldEvents.map(e => e.id));
    if (delErr) {
      console.error('⚠️ Eski etkinlikler silinemedi:', delErr.message);
    } else {
      console.log(`   ${oldEvents.length} eski etkinlik silindi.`);
    }
  }

  // Yeni etkinlikleri ekle
  console.log('\n📅 2026 yılı etkinlikleri ekleniyor...');
  const { data: insertedEvents, error: evtErr } = await supabase
    .from('events')
    .insert(events)
    .select();

  if (evtErr) {
    console.error('❌ Etkinlik ekleme hatası:', evtErr.message);
  } else {
    console.log(`   ✅ ${insertedEvents.length} etkinlik başarıyla eklendi.\n`);
    
    console.log('═'.repeat(50));
    console.log('📋 Eklenen Etkinlikler:');
    console.log('═'.repeat(50));
    for (const evt of insertedEvents) {
      console.log(`   🎪 ${evt.title}`);
      console.log(`      📆 ${evt.start_date} → ${evt.end_date}`);
    }
    console.log('═'.repeat(50));
    console.log(`\n🎉 Toplam ${insertedEvents.length} etkinlik veritabanına yüklendi!`);
  }
}

seedEvents();
