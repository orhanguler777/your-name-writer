import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.join(__dirname, 'assets', 'nikah-evraklari.pdf');

// Klasör yoksa oluştur
if (!fs.existsSync(path.join(__dirname, 'assets'))) {
  fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true });
}

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 }
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Türkçe karakter desteği için macOS üzerindeki Arial fontunu bulalım
let fontRegistered = false;
const fontPaths = [
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/Library/Fonts/Arial.ttf',
  '/Library/Fonts/Microsoft/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
];

for (const fp of fontPaths) {
  if (fs.existsSync(fp)) {
    doc.registerFont('Arial', fp);
    doc.font('Arial');
    fontRegistered = true;
    break;
  }
}

if (!fontRegistered) {
  console.log('⚠️ Arial fontu bulunamadı, varsayılan font kullanılacak. Türkçe karakterler bazı PDF okuyucularda hatalı görünebilir.');
  doc.font('Helvetica');
}

// ─── PDF Tasarım Öğeleri ──────────────────────────────────────────
const primaryColor = '#8A1538'; // Alanya Belediyesi Kırmızısı
const secondaryColor = '#2F3E46'; // Koyu Gri/Füme
const lightBgColor = '#F8F9FA'; // Açık gri arka plan
const dividerColor = '#E9ECEF';

// Üst Başlık (Branding)
doc.fillColor(primaryColor)
   .fontSize(20)
   .font(fontRegistered ? 'Arial' : 'Helvetica-Bold')
   .text('ALANYA BELEDİYESİ', { align: 'center' });

doc.fontSize(14)
   .fillColor(secondaryColor)
   .text('EVLENDİRME MEMURLUĞU', { align: 'center' });

doc.fontSize(10)
   .fillColor('#6C757D')
   .text('İrtibat Tel: 0 242 513 22 52', { align: 'center' })
   .moveDown(1.5);

// Ayraç Çizgisi
doc.strokeColor(primaryColor)
   .lineWidth(2)
   .moveTo(50, doc.y)
   .lineTo(545, doc.y)
   .stroke()
   .moveDown(1.5);

// 1. TÜRK VATANDAŞLARI İÇİN GEREKLİ BELGELER
doc.fontSize(12)
   .fillColor(primaryColor)
   .text('1. TÜRK VATANDAŞLARI İÇİN GEREKLİ BELGELER', { underline: true })
   .moveDown(0.8);

doc.fontSize(10)
   .fillColor(secondaryColor);

const turkBelgeleri = [
  'Fotoğraflı Nüfus Cüzdanı\'nın aslı ve birer fotokopisi (Sürücü belgesi vb. belgelerle işlem yapılmaz.)',
  'Evlenme İşlerine Mahsus Sağlık Raporu. Akdeniz anemisi (Talasemi) kan testi sonucu ile birlikte "Aile Hekimliği veya Özel Sağlık kurum ve kuruluşlarından" alınacaktır.',
  '5\'er adet Vesikalık Resim. Evlendirme Yönetmeliğine uygun olarak son 6 ay içinde çekilmiş olmalıdır. Biometrik fotoğraflar kabul edilmemektedir.',
  'Evlenecek çiftlerin müracaata birlikte gelmeleri gerekmektedir.',
  'Başvurular saat 08:30 ile 12:30 ve 13:30 ile 16:00 saatleri arası alınmaktadır. Cuma günleri nikah salonunda başvuru ve nikah işlemleri yapılmamaktadır.',
  'İkametgah adresleri Alanya dışında olanların E-devlet üzerinden barkodlu adres beyanı getirmeleri gerekmektedir.'
];

turkBelgeleri.forEach((item, index) => {
  doc.text(`${index + 1}. ${item}`, {
    align: 'justify',
    paragraphGap: 6,
    lineGap: 2
  });
});

doc.moveDown(1.5);

// 2. YABANCI ÜLKE VATANDAŞLARI İÇİN GEREKLİ BELGELER
doc.fontSize(12)
   .fillColor(primaryColor)
   .text('2. YABANCI ÜLKE VATANDAŞLARI İÇİN GEREKLİ BELGELER', { underline: true })
   .moveDown(0.8);

const yabanciBelgeleri = [
  'DOĞUM BELGESİ: Kişinin adı, soyadı, doğum yeri, doğum tarihinin açıkça yazılı olduğu, Türkiye\'deki tercüme büroları tarafından tercüme edilmiş ve noter tasdikli hali.',
  'EVLENME EHLİYET BELGESİ: Kişinin evlenmesine engel bir hali olmadığını, bekar/boşanmış veya dul olduğunu belirtir Türkiye\'deki tercüme büroları tarafından tercüme edilmiş ve noter tasdikli belge.',
  'PASAPORT: Türkiye\'deki tercüme büroları tarafından tercüme edilmiş ve Noter tasdikli hali.',
  'BOŞANMA VEYA EŞ ÖLÜMÜ: Gerçekleşmiş ise noter tasdikli boşanma veya ölüm belgesi.',
  'YASAL KALIŞ BELGESİ: Ülkemizde yasal kalış hakkının olduğunu gösteren (vize, ikamet izni, çalışma izni) belge.'
];

yabanciBelgeleri.forEach((item, index) => {
  doc.text(`• ${item}`, {
    align: 'justify',
    paragraphGap: 6,
    lineGap: 2
  });
});

doc.moveDown(1.5);

// 3. YABANCI EVLİLİKLERLE İLGİLİ PROSEDÜRLER
doc.fontSize(12)
   .fillColor(primaryColor)
   .text('3. YABANCI EVLİLİKLERLE İLGİLİ PROSEDÜRLER', { underline: true })
   .moveDown(0.8);

const yabanciProsedurler = [
  'Ahvali Şahsiye Sözleşmesine Taraf Ülkeler (Almanya, Hollanda, Belçika, İtalya, Fransa, Avusturya vb.): Doğum Belgesi ve Evlenme Ehliyet Belgesini "Çok Dilli" olarak alacaklardır.',
  'Lahey Sözleşmesine Üye Ülkeler (Rusya, Azerbaycan, Kırgızistan, Kazakistan, Türkmenistan, Özbekistan, Ukrayna vb.): Doğum Belgesi ve Evlenme Ehliyet Belgesini "Apostilli" olarak alacaklardır. Türkiye\'de tercüme ve noter tasdiki zorunludur.',
  'Sözleşmeye Taraf Olmayan Ülkeler (Suriye, İran, Irak, Ürdün, Fas, Cezayir, Suudi Arabistan vb.): Ülkelerinden aldıkları evrakları önce Ankara\'daki Konsolosluklarına, ardından Türkiye Dışişleri Bakanlığı\'na tasdik ettirip, tercüme ve noter onaylı getireceklerdir.',
  'Konsolosluk Tasdikleri: Konsolosluk Ankara\'da ise Dışişleri Bakanlığı\'na, diğer illerde ise o ilin Valiliği\'ne tasdik ettirilmelidir.'
];

yabanciProsedurler.forEach((item) => {
  doc.text(`• ${item}`, {
    align: 'justify',
    paragraphGap: 6,
    lineGap: 2
  });
});

doc.addPage(); // İkinci sayfaya geçelim

// Logo / Header tekrar (ikinci sayfa için ufak başlık)
doc.fillColor(primaryColor)
   .fontSize(12)
   .text('ALANYA BELEDİYESİ EVLENDİRME MEMURLUĞU', { align: 'center' })
   .moveDown(0.5);

doc.strokeColor(dividerColor)
   .lineWidth(1)
   .moveTo(50, doc.y)
   .lineTo(545, doc.y)
   .stroke()
   .moveDown(1);

// 4. EVLİLİKLE İLGİLİ HUKUKİ BİLGİLER
doc.fontSize(12)
   .fillColor(primaryColor)
   .text('4. ÖNEMLİ HUKUKİ BİLGİLER VE KURALLAR', { underline: true })
   .moveDown(0.8);

doc.fontSize(10)
   .fillColor(secondaryColor);

const hukukiBilgiler = [
  'Yaş Sınırı: Erkek ve kadın 17 yaşını doldurmadıkça evlenemez. İstisnai durumlarda mahkeme kararı ile 16 yaş kabul edilebilir. 17 yaşını doldurmamış adaylar anne-baba rızası veya noter onaylı muvafakatname getirmelidir.',
  'Kadınlar İçin Bekleme Süresi (İddet Müddeti): Boşanmış veya dul kalmış kadınların yeniden evlenebilmesi için 300 gün geçmesi gerekir. Bu süreyi beklemek istemeyenlerin Aile Mahkemesi\'nden "İddet Müddetinin Kaldırılması" kararı getirmesi şarttır.',
  '65 Yaş ve Üstü: 65 yaş ve üzerindeki adaylardan, Devlet Hastaneleri veya Üniversite Hastanelerinden alınmış "Evlenmesinde Akli ve Bedeni Engel Yoktur" ibareli Heyet Raporu talep edilir.',
  'Belge Geçerliliği: Evrakların geçerlilik süresi alındığı tarihten itibaren 6 (altı) aydır.',
  'Kimlik Durumu: Boşanmış veya dul kalmış kişilerin kimliklerinde hala "Evli" yazıyorsa işlem yapılmaz; kimliklerin yenilenmiş olması gerekir.',
  'Nikah Şahitleri: Nikah esnasında en az iki şahit bulunmalı ve şahitlerin resmi kimlikleri yanlarında olmalıdır.'
];

hukukiBilgiler.forEach((item, index) => {
  doc.text(`${index + 1}. ${item}`, {
    align: 'justify',
    paragraphGap: 8,
    lineGap: 2
  });
});

doc.moveDown(2);

// Footer / İletişim Bilgileri Kutusu
doc.rect(50, 650, 495, 80)
   .fillAndStroke(lightBgColor, primaryColor);

doc.fillColor(primaryColor)
   .fontSize(10)
   .text('ALANYA BELEDİYESİ NİKAH DAİRESİ', 60, 660, { font: fontRegistered ? 'Arial' : 'Helvetica-Bold' })
   .fillColor(secondaryColor)
   .fontSize(9)
   .text('Adres: Saray Mahallesi İsmet Hilmi Balcı Caddesi No:11/D Alanya/Antalya', 60, 675)
   .text('İletişim: 0 242 513 22 52  |  Çalışma Saatleri: Cuma günleri hariç 08:30 - 16:00', 60, 690)
   .fillColor('#8A1538')
   .text('Mutluluklar Dileriz.', 60, 705, { align: 'right', width: 475 });

doc.end();

writeStream.on('finish', () => {
  console.log('✅ Nikah evrakları PDF dosyası başarıyla oluşturuldu:', outputPath);
});
