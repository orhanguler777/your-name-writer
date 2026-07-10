-- Fix Noel Pazarı end_date (image shows 19 Aralık, not 13 Aralık)
UPDATE public.events
SET end_date = '2026-12-19'
WHERE title = '16. Uluslararası Alanya Noel Pazarı';

-- Enrich all event descriptions with detailed Turkish info for WhatsApp bot
UPDATE public.events SET description = 'Alanya Belediyesi tarafından düzenlenen 10. Uluslararası Karikatür Yarışması. Dünya genelinden karikatüristlerin katıldığı bu yarışma, 13 Ocak - 1 Nisan 2026 tarihleri arasında eser kabul etmektedir. Alanya''nın kültür ve sanat hayatına büyük katkı sağlayan uluslararası bir etkinliktir.'
WHERE title = '10. Uluslararası Alanya Karikatür Yarışması';

UPDATE public.events SET description = '2026 FIVB Dünya Plaj Voleybolu Pro Tour Challenge Turnuvası, 10-14 Haziran 2026 tarihlerinde Alanya sahillerinde gerçekleşecektir. Dünyanın en iyi plaj voleybolu sporcularının yarıştığı uluslararası bir spor organizasyonudur. Ücretsiz izlenebilir.'
WHERE title = '2026 Volleyball World Beach Pro Tour Challenge Turnuvası';

UPDATE public.events SET description = '700 yılı aşkın geleneğe sahip 20. Geleneksel Gökbel Yağlı Pehlivan Güreşleri ve Festivali, 30 Temmuz - 2 Ağustos 2026 tarihlerinde Alanya Gökbel Yaylası''nda düzenlenecektir. Yağlı güreş müsabakaları, konserler, yöresel ürün stantları ve kültürel etkinlikler yer almaktadır.'
WHERE title = '20. Geleneksel Gökbel Yağlı Pehlivan Güreşleri ve Festivali';

UPDATE public.events SET description = '20. Uluslararası Alanya Caz Festivali, 17-20 Eylül 2026 tarihlerinde gerçekleşecektir. "Tropikalin Kalbi Alanya" sloganıyla düzenlenen festival, yerli ve yabancı caz sanatçılarını ağırlamaktadır. Alanya Kalesi, Kızılkule ve çeşitli açık hava sahnelerinde konserler düzenlenecektir.'
WHERE title = '20. Uluslararası Alanya Caz Festivali';

UPDATE public.events SET description = '5. Alanya Tropikal Meyve Festivali, 9-11 Ekim 2026 tarihlerinde düzenlenecektir. Alanya''nın tropik ikliminde yetişen muz, avokado, ejder meyvesi gibi tropikal meyvelerin tanıtıldığı bu festivalde; tadım stantları, yarışmalar, konserler ve çeşitli etkinlikler yer almaktadır.'
WHERE title = '5. Alanya Tropikal Meyve Festivali';

UPDATE public.events SET description = 'Ramazan Meydanı Etkinlikleri, 19 Şubat - 19 Mart 2026 tarihleri arasında Alanya''da düzenlenecektir. Ramazan ayı boyunca iftar programları, mahya gösterileri, Hacivat-Karagöz, ilahi ve semazen gösterileri, çocuk etkinlikleri ve kültürel programlar gerçekleştirilecektir.'
WHERE title = 'Ramazan Meydanı Etkinlikleri';

UPDATE public.events SET description = '8. Uluslararası Alanya Çocuk Festivali, 25-26 Nisan 2026 tarihlerinde düzenlenecektir. Farklı ülkelerden çocuk gruplarının dans, müzik ve gösteri sunduğu bu festival, 23 Nisan Ulusal Egemenlik ve Çocuk Bayramı kutlamaları kapsamında gerçekleştirilmektedir.'
WHERE title = '8. Uluslararası Alanya Çocuk Festivali';

UPDATE public.events SET description = '12. Liselerarası Tiyatro Festivali, 1-31 Mayıs 2026 tarihleri arasında düzenlenecektir. Alanya ve çevre ilçelerdeki liselerin tiyatro topluluklarının sahne aldığı bu festival, gençlerin sanat ve kültür hayatına katkı sağlamaktadır.'
WHERE title = '12. Liselerarası Tiyatro Festivali';

UPDATE public.events SET description = 'Tarihi Mekanlardan Yükselen Müzik Tınıları konserleri, 2026 yılı boyunca çeşitli tarihlerde düzenlenecektir: 16 Mayıs, 20 Haziran, 18 Temmuz, 15 Ağustos, 17 Ekim ve 14 Kasım 2026. Alanya Kalesi, Kızılkule, Tersane gibi tarihi mekanlarda klasik müzik, Türk sanat müziği ve çeşitli konserler verilecektir.'
WHERE title = 'Tarihi Mekanlardan Yükselen Müzik Tınıları';

UPDATE public.events SET description = '24. Uluslararası Alanya Kültür, Sanat ve Turizm Festivali, 22-24 Mayıs 2026 tarihlerinde düzenlenecektir. Yerli ve yabancı sanatçıların katılımıyla konserler, sergiler, halk dansları gösterileri, panel ve söyleşiler, yöresel lezzetler tanıtımı ve birçok kültürel etkinlik yapılacaktır.'
WHERE title = '24. Uluslararası Alanya Kültür, Sanat ve Turizm Festivali';

UPDATE public.events SET description = 'Keykubad Göç ve Kervan Yürüyüş Yolu Etkinliği, 7 Haziran 2026 tarihinde başlayacak olup 13 Eylül''e kadar devam edecektir. Selçuklu Sultanı Alaaddin Keykubad''ın Alanya fethini anımsatan tarihi bir yürüyüş rotası etkinliğidir. Doğa yürüyüşü, kültürel tanıtımlar ve tarihi canlandırmalar içermektedir.'
WHERE title = 'Keykubad Göç ve Kervan Yürüyüş Yolu Etkinliği';

UPDATE public.events SET description = '8. Alanya Kitap Fuarı, 25 Eylül - 4 Ekim 2026 tarihlerinde düzenlenecektir. Yayınevleri, yazarlar ve okurların buluştuğu bu fuarda; kitap imza günleri, söyleşiler, paneller, çocuklara yönelik etkinlikler ve indirimli kitap satışları gerçekleştirilecektir.'
WHERE title = '8. Alanya Kitap Fuarı';

UPDATE public.events SET description = '35. Uluslararası Alanya Triatlonu, 23-25 Ekim 2026 tarihlerinde düzenlenecektir. Dünya Triatlon Birliği (World Triathlon) takviminde yer alan bu organizasyon, Alanya''nın ev sahipliğinde yüzme, bisiklet ve koşu branşlarında uluslararası sporcuların mücadele ettiği prestijli bir spor etkinliğidir.'
WHERE title = '35. Uluslararası Alanya Triatlonu';

UPDATE public.events SET description = '21. Uluslararası Alanya Taş Heykel Sempozyumu, 1-30 Kasım 2026 tarihleri arasında düzenlenecektir. Dünya genelinden heykeltıraşların katıldığı bu sempozyumda, sanatçılar bir ay boyunca Alanya''da taş heykel eserleri üretmektedir. Eserler şehrin çeşitli noktalarına yerleştirilmektedir.'
WHERE title = '21. Uluslararası Alanya Taş Heykel Sempozyumu';

UPDATE public.events SET description = '16. Uluslararası Alanya Noel Pazarı, 12-19 Aralık 2026 tarihlerinde düzenlenecektir. Alanya''da yaşayan yabancı uyruklu vatandaşların ve turistlerin yoğun ilgi gösterdiği bu pazarda; yılbaşı süsleri, el sanatları, yiyecek-içecek stantları ve canlı müzik performansları yer almaktadır.'
WHERE title = '16. Uluslararası Alanya Noel Pazarı';
