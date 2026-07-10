import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.join(__dirname, 'assets', 'ruhsat-evraklari.pdf');

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
  console.log('⚠️ Arial fontu bulunamadı, varsayılan font kullanılacak.');
  doc.font('Helvetica');
}

// Tasarım Renkleri
const primaryColor = '#1D3557'; // Lacivert (Kurumsal)
const secondaryColor = '#2F3E46'; // Koyu Gri
const lightBgColor = '#F8F9FA'; // Açık gri arka plan
const dividerColor = '#E9ECEF';

// Üst Başlık (Branding)
doc.fillColor(primaryColor)
   .fontSize(20)
   .font(fontRegistered ? 'Arial' : 'Helvetica-Bold')
   .text('ALANYA BELEDİYESİ', { align: 'center' });

doc.fontSize(14)
   .fillColor(secondaryColor)
   .text('RUHSAT VE DENETİM MÜDÜRLÜĞÜ', { align: 'center' });

doc.fontSize(10)
   .fillColor('#6C757D')
   .text('İletişim: 444 82 07', { align: 'center' })
   .moveDown(1.5);

// Ayraç Çizgisi
doc.strokeColor(primaryColor)
   .lineWidth(2)
   .moveTo(50, doc.y)
   .lineTo(545, doc.y)
   .stroke()
   .moveDown(1.5);

// 1. GENEL BAŞVURU EVRAKLARI
doc.fontSize(12)
   .fillColor(primaryColor)
   .text('1. İŞYERİ AÇMA VE ÇALIŞMA RUHSATI GENEL BAŞVURU EVRAKLARI', { underline: true })
   .moveDown(0.8);

doc.fontSize(10)
   .fillColor(secondaryColor);

const genelEvraklar = [
  'Başvuru Beyan Formu (Belediyeden veya online sistemden alınır)',
  'Tapu Fotokopisi (İşyerinin bulunduğu binaya ait)',
  'Yapı Kullanma İzin Belgesi (İskân belgesi)',
  'Kira Sözleşmesi (İşyeri kiralık ise noter onaylı veya aslı ve fotokopisi)',
  'Vergi Levhası Fotokopisi',
  'Esnaf veya Ticaret Odası Kayıt Belgesi',
  'Şahıslar için: T.C. Kimlik Kartı fotokopisi, 2 adet biyometrik fotoğraf',
  'Şirketler için: Ticaret Sicil Gazetesi, İmza Sirküleri ve yetki belgesi',
  'İtfaiye Uygunluk Raporu (Antalya Büyükşehir İtfaiye Daire Başkanlığı\'ndan alınır)',
  'Çevre Temizlik Vergisi borcu yoktur yazısı (Alanya Belediyesi Veznesinden alınır)'
];

genelEvraklar.forEach((item, index) => {
  doc.text(`${index + 1}. ${item}`, {
    align: 'justify',
    paragraphGap: 6,
    lineGap: 2
  });
});

doc.moveDown(1.5);

// 2. UMUMA AÇIK YERLER İÇİN İSTENEN BELGELER
doc.fontSize(12)
   .fillColor(primaryColor)
   .text('2. UMUMA AÇIK İSTİRAHAT VE EĞLENCE YERLERİ İÇİN EK BELGELER', { underline: true })
   .moveDown(0.8);

const umumaAcikEvraklar = [
  'Mesafe Krokisi (Okul, ibadethane ve öğrenci yurtlarına mevzuatın belirlediği uzaklık şartını sağladığını gösteren yetkili mühendis onaylı belge)',
  'Kat Maliklerinin Oy Birliği Kararı (Kat Mülkiyeti Kanununa göre apartman altındaki işyerleri için tüm kat maliklerinin imzalı muvafakatnamesi)',
  'Adli Sicil Kaydı (Şahıs veya şirket temsilcisi için)',
  'Yetkili makamlardan alınacak güvenlik soruşturması veya asayiş görüş yazısı'
];

umumaAcikEvraklar.forEach((item, index) => {
  doc.text(`• ${item}`, {
    align: 'justify',
    paragraphGap: 6,
    lineGap: 2
  });
});

doc.addPage(); // İkinci Sayfa

// Logo / Header tekrar (ikinci sayfa için ufak başlık)
doc.fillColor(primaryColor)
   .fontSize(12)
   .text('ALANYA BELEDİYESİ RUHSAT VE DENETİM MÜDÜRLÜĞÜ', { align: 'center' })
   .moveDown(0.5);

doc.strokeColor(dividerColor)
   .lineWidth(1)
   .moveTo(50, doc.y)
   .lineTo(545, doc.y)
   .stroke()
   .moveDown(1);

// 3. RUHSAT SÜRECİ VE İNCELEME ADIMLARI
doc.fontSize(12)
   .fillColor(primaryColor)
   .text('3. RUHSAT BAŞVURU VE ONAY SÜRECİ', { underline: true })
   .moveDown(0.8);

doc.fontSize(10)
   .fillColor(secondaryColor);

const surecAdimlari = [
  'Evrak Kontrolü: Belgeler eksiksiz şekilde Ruhsat ve Denetim Müdürlüğü\'ne teslim edilir.',
  'Harç Ödemeleri: Evrak incelemesi sonrası işyerinin metrekaresine ve sınıfına göre ruhsat harçları Alanya Belediyesi veznelerine yatırılır.',
  'Komisyon Denetimi: Zabıta, İmar, Sağlık ve Çevre müdürlüklerinden oluşan ruhsat komisyonu işyerini yerinde ziyaret ederek denetler.',
  'Ruhsat Teslimi: Denetimi olumlu geçen sıhhi işyerlerinin ruhsatları 5 iş günü, gayrisıhhi ve umuma açık eğlence yerlerinin ruhsatları ise komisyon raporunu takip eden 15 iş günü içerisinde hazırlanıp teslim edilir.'
];

surecAdimlari.forEach((item, index) => {
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
   .text('ALANYA BELEDİYESİ RUHSAT VE DENETİM MÜDÜRLÜĞÜ', 60, 660, { font: fontRegistered ? 'Arial' : 'Helvetica-Bold' })
   .fillColor(secondaryColor)
   .fontSize(9)
   .text('Adres: Saray Mahallesi, Atatürk Caddesi No:6 (Belediye Merkez Binası) Alanya/Antalya', 60, 675)
   .text('İrtibat Telefonu: 444 82 07  |  E-Posta: ruhsat@alanya.bel.tr', 60, 690)
   .fillColor('#1D3557')
   .text('Hayırlı İşler Dileriz.', 60, 705, { align: 'right', width: 475 });

doc.end();

writeStream.on('finish', () => {
  console.log('✅ Ruhsat evrakları PDF dosyası başarıyla oluşturuldu:', outputPath);
});
