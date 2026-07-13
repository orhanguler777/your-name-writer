import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

// ─── Config ────────────────────────────────────────────────────────
const logger = pino({ level: 'warn' }); // Sadece uyarı ve hataları göster

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nikahDocsPath = path.join(__dirname, 'knowledge', 'nikah-evraklari.md');
const eventsDocsPath = path.join(__dirname, 'knowledge', 'alanya-etkinlikleri-2026.md');
const pdfConfigPath = path.join(__dirname, 'knowledge', 'pdf-rehberi.json');

let nikahDocsText = '';
try {
  nikahDocsText = fs.readFileSync(nikahDocsPath, 'utf-8');
} catch (e) {
  console.error('⚠️ Nikah evrakları kılavuzu yüklenemedi:', e.message);
}

let eventsDocsText = '';
try {
  eventsDocsText = fs.readFileSync(eventsDocsPath, 'utf-8');
} catch (e) {
  console.error('⚠️ Etkinlik takvimi kılavuzu yüklenemedi:', e.message);
}

const ruhsatDocsPath = path.join(__dirname, 'knowledge', 'ruhsat-rehberi.md');
let ruhsatDocsText = '';
try {
  ruhsatDocsText = fs.readFileSync(ruhsatDocsPath, 'utf-8');
} catch (e) {
  console.error('⚠️ Ruhsat rehberi yüklenemedi:', e.message);
}

// ─── PDF Belge Rehberi (Dinamik) ──────────────────────────────────
let pdfConfig = { pdfs: [] };
try {
  pdfConfig = JSON.parse(fs.readFileSync(pdfConfigPath, 'utf-8'));
  console.log(`✅ ${pdfConfig.pdfs.length} PDF belgesi yapılandırması yüklendi.`);
} catch (e) {
  console.error('⚠️ PDF rehberi yüklenemedi:', e.message);
}

function buildPdfCatalogText() {
  if (!pdfConfig.pdfs || pdfConfig.pdfs.length === 0) return '';
  return pdfConfig.pdfs.map((p, i) =>
    `${i + 1}. Dosya: "${p.dosya}" — ${p.goruntu_adi}\n   Konular: ${p.konular.join(', ')}\n   Açıklama: ${p.aciklama}\n   İlgili Müdürlük: ${p.ilgili_mudurluk}`
  ).join('\n');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Botun kendi gönderdiği mesajların ID'lerini saklamak için önbellek (Sonsuz döngüyü önler)
const botMessageIds = new Set();
function addBotMessageId(id) {
  if (!id) return;
  botMessageIds.add(id);
  if (botMessageIds.size > 1000) {
    const firstValue = botMessageIds.values().next().value;
    botMessageIds.delete(firstValue);
  }
}

// Bot ayarlarını json dosyasından yükler
function getBotSettings() {
  const defaults = {
    selfChatOnly: true,
    slaLimitHours: 120,
    crisisLimitHours: 1,
    crisisLimitCount: 4,
  };
  try {
    const settingsPath = path.join(__dirname, 'bot-settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaults, ...JSON.parse(data) };
    }
  } catch (e) {
    // ignore
  }
  return defaults;
}

// Geliştirici/Test modu ayarı kontrolü
function isSelfChatOnly() {
  return getBotSettings().selfChatOnly === true;
}

// İki koordinat arası mesafeyi (Haversine formülü) hesaplar
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ─── Departments, Neighborhoods & Events Cache ─────────────────────
const pendingComplaints = new Map();
const pendingSurveys = new Map(); // key: phone, value: complaintId
let departmentsCache = [];
let neighborhoodsCache = [];
let eventsCache = [];

// Gerçek remoteJid'leri tutan bellek (Webhook 400 hatalarını önlemek için)
global.activeJids = new Map();
async function loadInitialData() {
  // Müdürlükleri yükle
  const { data: depts, error: deptError } = await supabase.from('departments').select('id, name');
  if (deptError) {
    console.error('⚠️ Müdürlükler yüklenemedi:', deptError.message);
  } else {
    departmentsCache = depts || [];
    console.log(`✅ ${departmentsCache.length} müdürlük yüklendi.`);
  }

  // Mahalleleri yükle
  const { data: nbrs, error: nbrError } = await supabase.from('neighborhoods').select('id, name, mukhtar_name, mukhtar_phone, latitude, longitude');
  if (nbrError) {
    console.error('⚠️ Mahalleler yüklenemedi:', nbrError.message);
  } else {
    neighborhoodsCache = nbrs || [];
    console.log(`✅ ${neighborhoodsCache.length} mahalle yüklendi.`);
  }

  // Etkinlikleri yükle
  const { data: evts, error: evtError } = await supabase.from('events').select('title, start_date, end_date, description');
  if (evtError) {
    console.error('⚠️ Etkinlikler yüklenemedi:', evtError.message);
  } else {
    eventsCache = evts || [];
    console.log(`✅ ${eventsCache.length} etkinlik yüklendi.`);
  }
}

function getLocalizedMessages(lang) {
  const l = (lang || 'tr').toLowerCase().trim();
  if (l === 'en' || l === 'english') {
    return {
      statusTitle: '✅ *Alanya Municipality Status Update*',
      infoTitle: '❓ *Alanya Municipality — Information Request*',
      generalTitle: '*Alanya Municipality Update*',
      dear: 'Dear',
      trackingNo: 'Tracking No',
      neighborhood: 'Neighborhood',
      complaint: 'Complaint',
      statusResolved: 'RESOLVED',
      statusUpdated: 'UPDATED',
      resolvedDesc: 'Your complaint has been successfully resolved. As Alanya Municipality, we continuously improve our services.',
      greeting: 'As Alanya Municipality, we wish you a good day. 🌟',
      infoBody: '*Municipality Question:*',
      infoFooter: 'Please reply to this message to provide information. Your response will be added to the same complaint record.\n\nIf you want to report a new complaint, you can type "new complaint".',
      infoDesc: '*Municipality Explanation:*',
      surveyTitle: '📊 *Alanya Municipality Satisfaction Survey*',
      surveyBody: 'It is very important for us that you evaluate the resolution process of your complaint! Please rate our service quality between *1 and 5*:\n\n1️⃣ Very Bad\n2️⃣ Bad\n3️⃣ Average\n4️⃣ Good\n5️⃣ Very Good\n\n*You can send your rating simply as a number (e.g. 4)*',
      surveyThanks: 'Thank you very much for your evaluation! As Alanya Municipality, your feedback is very valuable to us. We wish you a good day. 🙏🌸',
      surveyWarn: 'Please write and send only a number between 1 and 5 to evaluate our service (e.g. 4).'
    };
  } else if (l === 'de' || l === 'german' || l === 'deutsch') {
    return {
      statusTitle: '✅ *Stadtverwaltung Alanya Status-Update*',
      infoTitle: '❓ *Stadtverwaltung Alanya — Informationsanfrage*',
      generalTitle: '*Stadtverwaltung Alanya Update*',
      dear: 'Sehr geehrte(r)',
      trackingNo: 'Auftragsnummer',
      neighborhood: 'Viertel',
      complaint: 'Beschwerde',
      statusResolved: 'GELÖST',
      statusUpdated: 'AKTUALISIERT',
      resolvedDesc: 'Ihre Beschwerde wurde erfolgreich gelöst. Als Stadtverwaltung Alanya verbessern wir unsere Dienstleistungen kontinuierlich.',
      greeting: 'Als Stadtverwaltung Alanya wünschen wir Ihnen einen schönen Tag. 🌟',
      infoBody: '*Frage der Stadtverwaltung:*',
      infoFooter: 'Bitte antworten Sie auf diese Nachricht, um Informationen bereitzustellen. Ihre Antwort wird demselben Beschwerdedatensatz hinzugefügt.\n\nWenn Sie eine neue Beschwerde melden möchten, können Sie "neue beschwerde" eingeben.',
      infoDesc: '*Erklärung der Stadtverwaltung:*',
      surveyTitle: '📊 *Stadtverwaltung Alanya Zufriedenheitsumfrage*',
      surveyBody: 'Es ist uns sehr wichtig, dass Sie den Lösungsprozess Ihrer Beschwerde bewerten! Bitte bewerten Sie unsere Servicequalität zwischen *1 und 5*:\n\n1️⃣ Sehr schlecht\n2️⃣ Schlecht\n3️⃣ Durchschnittlich\n4️⃣ Gut\n5️⃣ Sehr gut\n\n*Sie können Ihre Bewertung einfach als Zahl senden (z. B. 4)*',
      surveyThanks: 'Vielen Dank für Ihre Bewertung! Als Stadtverwaltung Alanya ist uns Ihr Feedback sehr wichtig. Wir wünschen Ihnen einen schönen Tag. 🙏🌸',
      surveyWarn: 'Bitte schreiben und senden Sie nur eine Zahl zwischen 1 und 5, um unseren Service zu bewerten (z. B. 4).'
    };
  } else if (l === 'ru' || l === 'russian' || l === 'русский') {
    return {
      statusTitle: '✅ *Муниципалитет Алании Обновление статуса*',
      infoTitle: '❓ *Муниципалитет Алании — Запрос информации*',
      generalTitle: '*Муниципалитет Алании Обновление*',
      dear: 'Уважаемый(ая)',
      trackingNo: 'Номер отслеживания',
      neighborhood: 'Район',
      complaint: 'Жалоба',
      statusResolved: 'РЕШЕНО',
      statusUpdated: 'ОБНОВЛЕНО',
      resolvedDesc: 'Ваша жалоба успешно решена. Муниципалитет Алании постоянно улучшает свои услуги.',
      greeting: 'Муниципалитет Алании желает вам хорошего дня. 🌟',
      infoBody: '*Вопрос муниципалитета:*',
      infoFooter: 'Пожалуйста, ответьте на это сообщение, чтобы предоставить информацию. Ваш ответ будет добавлен к той же записи жалобы.\n\nЕсли вы хотите сообщить о новой жалобе, вы можете написать "новая жалоба".',
      infoDesc: '*Объяснение муниципалитета:*',
      surveyTitle: '📊 *Муниципалитет Алании Опрос удовлетворенности*',
      surveyBody: 'Для нас очень важно, чтобы вы оценили процесс решения вашей жалобы! Пожалуйста, оцените качество нашего обслуживания от *1 до 5*:\n\n1️⃣ Очень плохо\n2️⃣ Плохо\n3️⃣ Средне\n4️⃣ Хорошо\n5️⃣ Отлично\n\n*Вы можете отправить оценку просто числом (например, 4)*',
      surveyThanks: 'Большое спасибо за вашу оценку! Как муниципалитет Алании, ваши отзывы очень важны для нас. Желаем вам хорошего дня. 🙏🌸',
      surveyWarn: 'Пожалуйста, напишите и отправьте только число от 1 до 5, чтобы оценить наш сервис (например, 4).'
    };
  }
  
  // Default Turkish
  return {
    statusTitle: '✅ *Alanya Belediyesi Durum Bildirimi*',
    infoTitle: '❓ *Alanya Belediyesi — Ek Bilgi Talebi*',
    generalTitle: '*Alanya Belediyesi Bilgilendirme*',
    dear: 'Sayın',
    trackingNo: 'Takip No',
    neighborhood: 'Mahalle',
    complaint: 'Şikayet',
    statusResolved: 'ÇÖZÜLDÜ',
    statusUpdated: 'GÜNCELLENDİ',
    resolvedDesc: 'Şikayetiniz başarıyla çözülmüştür. Alanya Belediyesi olarak hizmetlerimizi sürekli iyileştirmeye devam ediyoruz.',
    greeting: 'Alanya Belediyesi olarak iyi günler dileriz. 🌟',
    infoBody: '*Belediye Birim Sorusu:*',
    infoFooter: 'Lütfen bu mesaja yanıt vererek bilgi paylaşın. Yanıtınız aynı şikayet kaydına eklenecektir.\n\nYeni bir şikayet bildirmek isterseniz "yeni şikayet" yazabilirsiniz.',
    infoDesc: '*Belediye Birim Açıklaması:*',
    surveyTitle: '📊 *Alanya Belediyesi Memnuniyet Anketi*',
    surveyBody: 'Şikayetinizin çözülme sürecini değerlendirmeniz bizim için çok önemlidir! Lütfen hizmet kalitemize *1 ile 5 arasında* bir puan verin:\n\n1️⃣ Çok Kötü\n2️⃣ Kötü\n3️⃣ Orta\n4️⃣ İyi\n5️⃣ Çok İyi\n\n*Puanınızı sadece rakam olarak yazıp gönderebilirsiniz (örn: 4)*',
    surveyThanks: 'Değerlendirmeniz için çok teşekkür ederiz! Alanya Belediyesi olarak görüşleriniz bizim için çok değerlidir. İyi günler dileriz. 🙏🌸',
    surveyWarn: 'Lütfen hizmetimizi değerlendirmek için sadece 1 ile 5 arasında bir rakam yazıp gönderin (Örn: 4).'
  };
}

// ─── SLA ve KRİZ Daemon ──────────────────────────────────
async function checkSLAsAndCrises(sock) {
  try {
    const adminJid = '16690377154811@s.whatsapp.net'; // Başkan / Yönetici Numarası
    const now = new Date().getTime();

    // Ayarları yükle
    const settings = getBotSettings();
    const slaLimitHours = settings.slaLimitHours || 120;
    const crisisLimitHours = settings.crisisLimitHours || 1;
    const crisisLimitCount = settings.crisisLimitCount || 4;
    
    // 1. SLA İhlali Kontrolü (Öncelik: Yüksek, slaLimitHours aşmış, çözülmemiş)
    const { data: openComplaints, error: compError } = await supabase
      .from('complaints')
      .select('id, category, created_at, status, priority, neighborhood_id')
      .eq('priority', 'yuksek');
      
    if (!compError && openComplaints) {
      for (const comp of openComplaints) {
        if (['cozuldu', 'reddedildi'].includes(comp.status)) continue;
        
        if ((now - new Date(comp.created_at).getTime()) > slaLimitHours * 3600000) {
          // Check if already escalated
          const { data: existingResp } = await supabase
            .from('complaint_responses')
            .select('id')
            .eq('complaint_id', comp.id)
            .eq('response_type', 'eskalasyon')
            .maybeSingle();
            
          if (!existingResp) {
            console.log(`   🚨 SLA Eskalasyonu: ${comp.id}`);
            // Send WhatsApp message to Admin
            const slaText = slaLimitHours >= 24 ? `${Math.round(slaLimitHours / 24)} gündür` : `${slaLimitHours} saattir`;
            const escText = `🚨 *SLA İHLALİ (ESKALASYON)*\n\n*Takip No:* ${comp.id.substring(0,8).toUpperCase()}\n*Kategori:* ${comp.category}\n*Durum:* Yüksek öncelikli şikayet ${slaText} çözülemedi! Lütfen acil müdahale edin.`;
            await sock.sendMessage(adminJid, { text: escText });
            
            // Log to database
            await supabase.from('complaint_responses').insert({
              complaint_id: comp.id,
              response_text: `Otomatik SLA Eskalasyonu yapıldı (${slaText} aşımı).`,
              response_type: 'eskalasyon'
            });
          }
        }
      }
    }

    // 2. Kriz Algılama (Son X saat içinde aynı mahalle ve kategoriden >= Y açık şikayet → otomatik yüksek öncelik)
    const { data: recentComplaints } = await supabase
      .from('complaints')
      .select('id, category, neighborhood_id, status, priority, created_at')
      .gte('created_at', new Date(now - crisisLimitHours * 3600000).toISOString());
      
    if (recentComplaints && recentComplaints.length > 0) {
      const groups = {};
      recentComplaints.forEach(c => {
        if (c.neighborhood_id && c.category && !['cozuldu', 'reddedildi'].includes(c.status)) {
          const key = `${c.neighborhood_id}::${c.category}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(c);
        }
      });
      
      if (!global.notifiedCrises) global.notifiedCrises = new Set();
      
      for (const [key, complaints] of Object.entries(groups)) {
        if (complaints.length >= crisisLimitCount && !global.notifiedCrises.has(key)) {
          const [nbrId, cat] = key.split('::');
          const nbr = neighborhoodsCache.find(n => n.id === nbrId);
          const nbrName = nbr ? nbr.name : 'Bilinmeyen Mahalle';
          
          console.log(`   ⚠️ BÖLGESEL KRİZ: ${nbrName} - ${cat} (${complaints.length} şikayet)`);
          
          // Otomatik olarak bu şikayetlerin önceliğini "yuksek" yap
          const toUpgrade = complaints.filter(c => c.priority !== 'yuksek');
          for (const comp of toUpgrade) {
            await supabase.from('complaints').update({ priority: 'yuksek' }).eq('id', comp.id);
            console.log(`   ⬆️ Öncelik yükseltildi: ${comp.id.substring(0,8).toUpperCase()}`);
          }
          
          const crisisText = `⚠️ *BÖLGESEL KRİZ UYARISI*\n\n*Mahalle:* ${nbrName}\n*Kategori:* ${cat}\n*Durum:* Son ${crisisLimitHours} saat içinde bu bölgede ${complaints.length} adet çözülmemiş şikayet birikti.\n\n🔺 Tüm ilgili şikayetlerin önceliği otomatik olarak *Yüksek* seviyeye çıkarıldı.\n\nSaha ekiplerinin acilen yönlendirilmesi tavsiye edilir.`;
          await sock.sendMessage(adminJid, { text: crisisText });
          
          global.notifiedCrises.add(key);
        }
      }
    }
  } catch (e) {
    console.error('⚠️ checkSLAsAndCrises Hatası:', e.message);
  }
}

// ─── Duyuru Broadcast ──────────────────────────────────────────
async function broadcastAnnouncement(sock, announcement) {
  try {
    console.log(`\n📢 Duyuru Broadcast başlatılıyor: "${announcement.title}"`);

    // Daha önce bot ile iletişime geçmiş benzersiz vatandaş telefonlarını çek
    const { data: citizens, error: citizenError } = await supabase
      .from('complaints')
      .select('citizen_phone')
      .in('source', ['whatsapp_qr', 'whatsapp'])
      .not('citizen_phone', 'is', null);

    if (citizenError || !citizens) {
      console.error('⚠️ Vatandaş listesi alınamadı:', citizenError?.message);
      return;
    }

    // Benzersiz telefon numaralarını al
    const uniquePhones = [...new Set(citizens.map(c => c.citizen_phone).filter(Boolean))];
    console.log(`   📋 ${uniquePhones.length} benzersiz vatandaşa gönderilecek.`);

    if (uniquePhones.length === 0) {
      console.log('   ⏭️ Gönderilecek vatandaş bulunamadı.');
      return;
    }

    // Mesaj metnini hazırla
    const dateRange = announcement.start_date && announcement.end_date
      ? `\n📅 *Tarih:* ${new Date(announcement.start_date).toLocaleDateString('tr-TR')} — ${new Date(announcement.end_date).toLocaleDateString('tr-TR')}`
      : announcement.start_date
      ? `\n📅 *Tarih:* ${new Date(announcement.start_date).toLocaleDateString('tr-TR')}`
      : '';

    const messageText =
      `📢 *Alanya Belediyesi Duyurusu*\n\n` +
      `🔔 *${announcement.title}*\n` +
      (announcement.description ? `\n${announcement.description}` : '') +
      dateRange +
      `\n\n_Alanya Belediyesi olarak iyi günler dileriz. 🌟_`;

    let sentCount = 0;
    let failCount = 0;

    for (let phone of uniquePhones) {
      try {
        // Numarayı temizle (sadece rakamları tut, başındaki sıfır veya + işaretini standartlaştır)
        let cleanPhone = phone.replace(/\D/g, '');
        
        // Eğer 0 ile başlıyorsa ve Türkiye numarasıysa (örn: 0532...) 90 ile başlasın
        if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
          cleanPhone = '90' + cleanPhone.substring(1);
        }
        
        // Eğer başında ülke kodu yoksa ve 10 haneli ise (örn: 532...) 90 ekle
        if (cleanPhone.length === 10 && cleanPhone.startsWith('5')) {
          cleanPhone = '90' + cleanPhone;
        }

        let jid = `${cleanPhone}@s.whatsapp.net`;
        const exactJid = global.activeJids?.get(phone) || jid;

        console.log(`   📤 Gönderiliyor: ${cleanPhone} (${phone})`);

        // Gönderici hedefleri (hedef numara ve test amaçlı kendi numaramız)
        const targets = [exactJid];
        
        // Kendi JID'imizi ekle (eğer listede yoksa kendimize de gitsin)
        if (sock.user?.id) {
          const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
          if (!targets.includes(myJid)) {
            targets.push(myJid);
            console.log(`   🧪 Test modu: Bot kendi numarasına da gönderecek (${myJid})`);
          }
        }

        for (const targetJid of targets) {
          // Eğer görsel varsa önce görseli gönder
          if (announcement.file_url && announcement.file_type === 'image') {
            try {
              const response = await fetch(announcement.file_url);
              const buffer = Buffer.from(await response.arrayBuffer());
              const sentImg = await sock.sendMessage(targetJid, {
                image: buffer,
                caption: messageText,
              });
              if (sentImg?.key?.id) addBotMessageId(sentImg.key.id);
            } catch (imgErr) {
              console.log(`   ⚠️ Görsel gönderilemedi (${targetJid}), metin gönderiliyor...`);
              const sent = await sock.sendMessage(targetJid, { text: messageText });
              if (sent?.key?.id) addBotMessageId(sent.key.id);
            }
          } else if (announcement.file_url && announcement.file_type === 'pdf') {
            try {
              const response = await fetch(announcement.file_url);
              const buffer = Buffer.from(await response.arrayBuffer());
              const sentText = await sock.sendMessage(targetJid, { text: messageText });
              if (sentText?.key?.id) addBotMessageId(sentText.key.id);
              const sentDoc = await sock.sendMessage(targetJid, {
                document: buffer,
                mimetype: 'application/pdf',
                fileName: `${announcement.title}.pdf`,
              });
              if (sentDoc?.key?.id) addBotMessageId(sentDoc.key.id);
            } catch (docErr) {
              console.log(`   ⚠️ PDF gönderilemedi (${targetJid}), sadece metin gönderildi.`);
              const sent = await sock.sendMessage(targetJid, { text: messageText });
              if (sent?.key?.id) addBotMessageId(sent.key.id);
            }
          } else {
            const sent = await sock.sendMessage(targetJid, { text: messageText });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
          }
        }

        sentCount++;
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (sendErr) {
        failCount++;
        console.error(`   ❌ Gönderilemedi (${phone}): ${sendErr.message}`);
      }
    }

    // sent_at güncelle
    await supabase
      .from('announcements')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', announcement.id);

    console.log(`   ✅ Duyuru broadcast tamamlandı: ${sentCount} başarılı, ${failCount} başarısız.`);
  } catch (e) {
    console.error('⚠️ broadcastAnnouncement Hatası:', e.message);
  }
}

// ─── WhatsApp Bağlantısı (Baileys) ──────────────────────────────
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./.baileys_auth');

  console.log('🔄 En son WhatsApp sürümü sorgulanıyor...');
  let version = [2, 3000, 1017531287]; // Fallback sürüm
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
    console.log(`ℹ️ WhatsApp Sürümü: ${version.join('.')}`);
  } catch (err) {
    console.log('⚠️ Sürüm sorgulanamadı, varsayılan kullanılacak:', err.message);
  }

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
    browser: ['Belediye Bot', 'Chrome', '1.0.0'],
    syncFullHistory: false, // Uzun süren senkronizasyonu kapatır (Timeout hatasını önler)
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false,
  });

  // Global referans: Webhook ve Realtime handler'lar her zaman güncel sock'u kullansın
  global.currentSock = sock;

  // Bağlantı durumu güncellemeleri
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 QR kodu aşağıdaki gibi telefonunuzdan okutun:');
      console.log('   WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Bağla\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('\n🟢 WhatsApp Bot (Baileys) başarıyla bağlandı!');
      console.log('   Gelen şikayetler dinleniyor...\n');
      await loadInitialData();

      // SLA ve Kriz kontrolünü her 5 dakikada bir çalıştır
      if (!global.slaDaemonStarted) {
        global.slaDaemonStarted = true;
        console.log('   ⏱️ SLA ve Kriz Daemon aktif edildi (5 dakikada bir kontrol edilecek).');
        setInterval(() => checkSLAsAndCrises(global.currentSock), 5 * 60 * 1000);
        // İlk kontrolü 10 saniye sonra yap
        setTimeout(() => checkSLAsAndCrises(global.currentSock), 10 * 1000);
      }

      // Realtime Dinleme (Belediye Personeli Cevap Yazınca WhatsApp'a Bildirim Gitmesi)
      console.log('   📡 Supabase Realtime şikayet cevapları dinleniyor...');
      
      supabase.removeAllChannels();

      supabase
        .channel('whatsapp_responses')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'complaint_responses',
          },
          async (payload) => {
            try {
              const newResponse = payload.new;
              
              // Personelin yazdığı cevap/soru ve durum bildirimlerini ilet
              if (!['manuel', 'soru', 'durum_bildirimi'].includes(newResponse.response_type)) return;

              console.log(`\n   📨 Yeni ${newResponse.response_type === 'durum_bildirimi' ? 'durum bildirimi' : newResponse.response_type === 'soru' ? 'belediye sorusu' : 'belediye cevabı'} tespit edildi (Şikayet ID: ${newResponse.complaint_id})`);

              // Şikayeti ve vatandaşın telefonunu çek
              const { data: complaint, error: compError } = await supabase
                .from('complaints')
                .select('citizen_phone, citizen_name, status, complaint_text, neighborhood_id, source, language')
                .eq('id', newResponse.complaint_id)
                .single();

              if (compError || !complaint) {
                console.error('⚠️ Cevap için vatandaş bilgileri bulunamadı:', compError?.message);
                return;
              }

              // Sadece WhatsApp kaynaklı şikayetler için bildirim gönder
              if (complaint.source !== 'whatsapp_qr') {
                console.log(`   ⏭️ Kaynak whatsapp_qr değil (${complaint.source}), bildirim atlanıyor.`);
                return;
              }

              // JID formatı
              const jid = complaint.citizen_phone.includes('@') 
                ? complaint.citizen_phone 
                : `${complaint.citizen_phone}@s.whatsapp.net`;

              let responseText;
              const loc = getLocalizedMessages(complaint.language);

              if (newResponse.response_type === 'durum_bildirimi') {
                // ✅ Çözüldü bildirimi
                const trackingNo = newResponse.complaint_id.substring(0, 8).toUpperCase();
                let neighborhoodName = '';
                if (complaint.neighborhood_id) {
                  const nbr = neighborhoodsCache.find(n => n.id === complaint.neighborhood_id);
                  if (nbr) neighborhoodName = nbr.name;
                }

                responseText =
                  `${loc.statusTitle}\n\n` +
                  `${loc.dear} *${complaint.citizen_name || 'Vatandaş'}*,\n\n` +
                  `📋 ${loc.trackingNo}: *${trackingNo}*\n` +
                  (neighborhoodName ? `📍 ${loc.neighborhood}: *${neighborhoodName}*\n` : '') +
                  `📌 ${loc.complaint}: "${(complaint.complaint_text || '').substring(0, 80)}${(complaint.complaint_text || '').length > 80 ? '...' : ''}"\n\n` +
                  `🔄 Durum: *${loc.statusResolved}*\n` +
                  `${newResponse.response_text}\n\n` +
                  `${loc.greeting}`;
              } else if (newResponse.response_type === 'soru') {
                const trackingNo = newResponse.complaint_id.substring(0, 8).toUpperCase();
                responseText =
                  `${loc.infoTitle}\n\n` +
                  `${loc.dear} *${complaint.citizen_name || 'Vatandaş'}*,\n\n` +
                  `📋 ${loc.trackingNo}: *${trackingNo}*\n\n` +
                  `${loc.infoBody}\n"${newResponse.response_text}"\n\n` +
                  `${loc.infoFooter}`;
              } else {
                const statusEmoji = complaint.status === 'cozuldu' ? '✅' : '📢';
                const statusText = complaint.status === 'cozuldu' ? loc.statusResolved : loc.statusUpdated;

                responseText = 
                  `${statusEmoji} ${loc.generalTitle}\n\n` +
                  `${loc.dear} *${complaint.citizen_name || 'Vatandaş'}*,\n` +
                  `Şikayetinizin durumu *${statusText}* olarak güncellenmiştir.\n\n` +
                  `${loc.infoDesc}\n"${newResponse.response_text}"\n\n` +
                  `${loc.greeting}`;
              }

              const sent = await sock.sendMessage(jid, { text: responseText });
              if (sent?.key?.id) {
                addBotMessageId(sent.key.id);
              }
              console.log(`   💬 ${newResponse.response_type === 'durum_bildirimi' ? 'Durum bildirimi' : 'Cevap'} WhatsApp üzerinden vatandaşa iletildi (${complaint.citizen_phone})`);

              // Eğer bu bir durum bildirimi ise ve şikayet çözüldüyse anket gönder
              if (newResponse.response_type === 'durum_bildirimi') {
                const phoneClean = complaint.citizen_phone;
                pendingSurveys.set(phoneClean, newResponse.complaint_id);
                const surveyText = 
                  `${loc.surveyTitle}\n\n` +
                  `${loc.surveyBody}`;
                
                setTimeout(async () => {
                  try {
                    const sentSurvey = await sock.sendMessage(jid, { text: surveyText });
                    if (sentSurvey?.key?.id) {
                      addBotMessageId(sentSurvey.key.id);
                    }
                    console.log(`   📊 Memnuniyet anketi vatandaşa gönderildi (${phoneClean})`);
                  } catch (e) {
                    console.error('⚠️ Anket gönderilirken hata oluştu:', e.message);
                  }
                }, 1500);
              }

            } catch (err) {
              console.error('⚠️ Realtime bildirim gönderme hatası:', err.message);
            }
          }
        )
        .subscribe();

      // Duyuru Realtime Dinleme (Yeni duyuru eklenince otomatik broadcast — isteğe bağlı)
      console.log('   📡 Supabase Realtime duyurular dinleniyor...');
      supabase
        .channel('whatsapp_announcements')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'announcements',
          },
          async (payload) => {
            try {
              const ann = payload.new;
              const oldAnn = payload.old;
              // sent_at null'dan değere geçtiyse → broadcast tetiklendi
              if (!oldAnn.sent_at && ann.sent_at) {
                console.log(`\n   📢 Duyuru broadcast tetiklendi (Realtime): "${ann.title}"`);
                // sent_at zaten set edildi, doğrudan broadcast et
                await broadcastAnnouncement(global.currentSock, ann);
              }
            } catch (err) {
              console.error('⚠️ Duyuru Realtime hatası:', err.message);
            }
          }
        )
        .subscribe();

      // ── Express Webhook Sunucusu (CORS ve Realtime kesintilerini önlemek için) ──
      const app = express();
      app.use(express.json());

      // CORS izinleri
      app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') return res.sendStatus(200);
        next();
      });

      // Duyuru Broadcast Webhook Endpoint
      app.post('/broadcast-announcement', async (req, res) => {
        try {
          const { announcementId } = req.body;
          if (!announcementId) {
            return res.status(400).json({ status: 'error', reason: 'announcementId gerekli' });
          }

          const activeSock = global.currentSock;
          if (!activeSock) {
            return res.status(503).json({ status: 'error', reason: 'WhatsApp bağlantısı aktif değil' });
          }

          // Duyuruyu çek
          const { data: announcement, error: annError } = await supabase
            .from('announcements')
            .select('*')
            .eq('id', announcementId)
            .single();

          if (annError || !announcement) {
            return res.status(404).json({ status: 'error', reason: 'Duyuru bulunamadı' });
          }

          // Async olarak broadcast yap (response'u hemen dön)
          res.json({ status: 'started', message: 'Broadcast başlatıldı' });

          await broadcastAnnouncement(activeSock, announcement);
        } catch (error) {
          console.error('⚠️ Broadcast webhook hatası:', error.message);
          if (!res.headersSent) {
            res.status(500).json({ status: 'error', reason: error.message });
          }
        }
      });

      app.post('/webhook/resolved', async (req, res) => {
        try {
          const { complaintId } = req.body;
          if (!complaintId) {
            return res.status(400).json({ error: 'complaintId gereklidir' });
          }

          console.log(`\n   🔌 Webhook tetiklendi! Şikayet ID: ${complaintId}`);

          // Güncel sock referansını kullan (yeniden bağlantıda güncellenir)
          const activeSock = global.currentSock;
          if (!activeSock) {
            console.error('⚠️ WhatsApp bağlantısı hazır değil!');
            return res.status(503).json({ error: 'WhatsApp bağlantısı hazır değil' });
          }

          // Şikayet detaylarını çek
          const { data: complaint, error: compError } = await supabase
            .from('complaints')
            .select('citizen_phone, citizen_name, status, complaint_text, neighborhood_id, source, language')
            .eq('id', complaintId)
            .single();

          if (compError || !complaint) {
            console.error('⚠️ Webhook şikayet bilgisi çekilemedi:', compError?.message);
            return res.status(404).json({ error: 'Şikayet bulunamadı' });
          }

          console.log(`   📋 Şikayet bulundu: phone=${complaint.citizen_phone}, source=${complaint.source}, status=${complaint.status}`);

          // Sadece WhatsApp kaynaklı şikayetler
          if (complaint.source !== 'whatsapp_qr') {
            console.log(`   ⏭️ Kaynak whatsapp_qr değil (${complaint.source}), atlanıyor.`);
            return res.json({ status: 'ignored', reason: 'source_not_whatsapp' });
          }

          if (!complaint.citizen_phone) {
            console.log('   ⏭️ Telefon numarası yok, atlanıyor.');
            return res.json({ status: 'ignored', reason: 'no_phone' });
          }

          let jid = complaint.citizen_phone.includes('@')
            ? complaint.citizen_phone
            : `${complaint.citizen_phone}@s.whatsapp.net`;

          // Kendi numarasına (Self-Chat) gönderim yapılıyorsa cihaz JID'sini (user.id) kullan
          const myJid = activeSock.user?.id;
          console.log(`   🐛 DEBUG: myJid = ${myJid}, targetPhone = ${complaint.citizen_phone}`);
          if (myJid) {
            const myBareId = myJid.split(':')[0].split('@')[0];
            console.log(`   🐛 DEBUG: myBareId = ${myBareId}`);
            if (complaint.citizen_phone === myBareId) {
              jid = myJid; // Kendi kendine atarken :15 gibi cihaz ekini koru
            }
          }

          // BELLEKTEN GERÇEK JID'Yİ AL (Yapay zekanın başarıyla mesaj attığı JID)
          const exactJid = global.activeJids.get(complaint.citizen_phone);
          if (exactJid) {
            console.log(`   🐛 DEBUG: Bellekten gerçek JID bulundu: ${exactJid}`);
            jid = exactJid;
          } else {
            console.log(`   🐛 DEBUG: Bellekte JID bulunamadı, üretilen kullanılacak: ${jid}`);
          }

          console.log(`   📱 Mesaj gönderiliyor: JID=${jid}`);

          const trackingNo = complaintId.substring(0, 8).toUpperCase();
          
          let neighborhoodName = '';
          if (complaint.neighborhood_id) {
            const nbr = neighborhoodsCache.find(n => n.id === complaint.neighborhood_id);
            if (nbr) neighborhoodName = nbr.name;
          }

          const loc = getLocalizedMessages(complaint.language);

          const responseText =
            `${loc.statusTitle}\n\n` +
            `${loc.dear} *${complaint.citizen_name || 'Vatandaş'}*,\n\n` +
            `📋 ${loc.trackingNo}: *${trackingNo}*\n` +
            (neighborhoodName ? `📍 ${loc.neighborhood}: *${neighborhoodName}*\n` : '') +
            `📌 ${loc.complaint}: "${(complaint.complaint_text || '').substring(0, 80)}${(complaint.complaint_text || '').length > 80 ? '...' : ''}"\n\n` +
            `🔄 Durum: *${loc.statusResolved}*\n` +
            `${loc.resolvedDesc}\n\n` +
            `${loc.greeting}`;

          console.log(`   📤 Sohbet aktifleştiriliyor ve sendMessage çağrılıyor...`);
          
          // Gerçek bir kullanıcı gibi davranıp oturumu aktifleştirmek için "Yazıyor..." durumunu simüle et
          try {
            await activeSock.presenceSubscribe(jid);
            await new Promise(r => setTimeout(r, 500));
            await activeSock.sendPresenceUpdate('composing', jid);
            await new Promise(r => setTimeout(r, 1000));
            await activeSock.sendPresenceUpdate('paused', jid);
          } catch (e) {
            console.warn(`   ⚠️ Presence simülasyonu uyarı verdi: ${e.message}`);
          }

          const sent = await activeSock.sendMessage(jid, { text: responseText });
          console.log(`   📬 sendMessage sonucu:`, JSON.stringify(sent?.key || 'BOŞ'));
          
          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }

          console.log(`   💬 Çözüldü bildirimi Webhook aracılığıyla vatandaşa iletildi (${complaint.citizen_phone})`);

          // Anket Gönderimi
          const phoneClean = complaint.citizen_phone;
          pendingSurveys.set(phoneClean, complaintId);
          const surveyText = 
            `${loc.surveyTitle}\n\n` +
            `${loc.surveyBody}`;
          
          setTimeout(async () => {
            try {
              const sentSurvey = await activeSock.sendMessage(jid, { text: surveyText });
              if (sentSurvey?.key?.id) {
                addBotMessageId(sentSurvey.key.id);
              }
              console.log(`   📊 Memnuniyet anketi vatandaşa gönderildi (${phoneClean})`);
            } catch (e) {
              console.error('⚠️ Anket gönderilirken hata oluştu:', e.message);
            }
          }, 1500);

          return res.json({ status: 'success', messageId: sent?.key?.id || null });
        } catch (err) {
          console.error('⚠️ Webhook hatası:', err.message);
          return res.status(500).json({ error: err.message });
        }
      });

      
      // 📢 MANUEL CEVAP WEBHOOK'U (Realtime'a güvenmemek için)
      app.post('/webhook/response', async (req, res) => {
        try {
          const { complaintId, responseText: manualText, isQuestion } = req.body;
          if (!complaintId || !manualText) {
            return res.status(400).json({ status: 'error', reason: 'Missing payload' });
          }

          console.log(`\n   🔌 Webhook (Manuel Cevap) tetiklendi! Şikayet ID: ${complaintId}`);

          const { data: complaint, error: compError } = await supabase
            .from('complaints')
            .select('citizen_phone, citizen_name, status, source, language')
            .eq('id', complaintId)
            .single();

          if (compError || !complaint) {
            return res.status(404).json({ status: 'error', reason: 'Complaint not found' });
          }

          if (complaint.source !== 'whatsapp_qr') {
            return res.json({ status: 'ignored', reason: 'Not whatsapp_qr' });
          }

          const activeSock = global.currentSock;
          if (!activeSock) {
            return res.status(500).json({ status: 'error', reason: 'Bot not connected' });
          }

          let jid = complaint.citizen_phone.includes('@')
            ? complaint.citizen_phone
            : `${complaint.citizen_phone}@s.whatsapp.net`;

          const myJid = activeSock.user?.id;
          if (myJid) {
            const myBareId = myJid.split(':')[0].split('@')[0];
            if (complaint.citizen_phone === myBareId) jid = myJid;
          }

          const exactJid = global.activeJids.get(complaint.citizen_phone);
          if (exactJid) {
            jid = exactJid;
          }

          const trackingNo = complaintId.substring(0, 8).toUpperCase();
          let msgText;
          const loc = getLocalizedMessages(complaint.language);

          if (isQuestion || complaint.status === 'vatandas_yaniti_bekleniyor') {
            msgText =
              `${loc.infoTitle}\n\n` +
              `${loc.dear} *${complaint.citizen_name || 'Vatandaş'}*,\n\n` +
              `📋 ${loc.trackingNo}: *${trackingNo}*\n\n` +
              `${loc.infoBody}\n"${manualText}"\n\n` +
              `${loc.infoFooter}`;
          } else {
            const statusEmoji = complaint.status === 'cozuldu' ? '✅' : '📢';
            const statusText = complaint.status === 'cozuldu' ? loc.statusResolved : loc.statusUpdated;

            msgText =
              `${statusEmoji} ${loc.generalTitle}\n\n` +
              `${loc.dear} *${complaint.citizen_name || 'Vatandaş'}*,\n` +
              `Şikayetinizin durumu *${statusText}* olarak güncellenmiştir.\n\n` +
              `${loc.infoDesc}\n"${manualText}"\n\n` +
              `${loc.greeting}`;
          }

          console.log(`   📤 Sohbet aktifleştiriliyor ve sendMessage çağrılıyor...`);
          try {
            await activeSock.presenceSubscribe(jid);
            await new Promise(r => setTimeout(r, 500));
            await activeSock.sendPresenceUpdate('composing', jid);
            await new Promise(r => setTimeout(r, 1000));
            await activeSock.sendPresenceUpdate('paused', jid);
          } catch (e) {}

          const sent = await activeSock.sendMessage(jid, { text: msgText });
          console.log(`   📬 sendMessage sonucu:`, JSON.stringify(sent?.key || 'BOŞ'));
          console.log(`   💬 Manuel Cevap Webhook aracılığıyla iletildi (${complaint.citizen_phone})`);
          
          res.json({ status: 'success', messageId: sent?.key?.id || 'unknown' });
        } catch (error) {
          console.error('⚠️ Webhook hatası:', error.message);
          res.status(500).json({ status: 'error', reason: error.message });
        }
      });

      // Zaten dinlemede olan bir express sunucusu varsa tekrar başlatmamak için global nesnede tutalım
      if (!global.webhookServer) {
        global.webhookServer = app.listen(3001, () => {
          console.log('   🔌 Webhook sunucusu port 3001 üzerinden dinleniyor...');
        });
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMsg = lastDisconnect?.error?.message || 'Bilinmeyen hata';
      console.log(`🔴 Bağlantı kapandı: statusCode=${statusCode}, hata=${errorMsg}`);

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log('🔄 3 saniye sonra yeniden bağlanılıyor...');
        setTimeout(() => startBot(), 3000);
      } else {
        console.log('🔴 Oturum kapatıldı. Eski auth temizleniyor...');
        const fs = await import('fs');
        fs.rmSync('./.baileys_auth', { recursive: true, force: true });
        console.log('🔄 Temiz oturum ile yeniden başlatılıyor...');
        setTimeout(() => startBot(), 1000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ─── Mesaj Dinleyici ──────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        // Protokol mesajlarını yoksay
        if (msg.message.protocolMessage) continue;

        // Botun kendi gönderdiği bir mesaja tekrar yanıt vermesini engelle
        if (botMessageIds.has(msg.key.id)) {
          continue;
        }

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const lowerText = text.toLowerCase();

        // Grup mesajlarını yoksay
        if (msg.key.remoteJid.endsWith('@g.us')) continue;

        // Kendi kendine chat (self-chat) kontrolü
        const myJid = sock.user?.id;
        const myLid = sock.user?.lid;
        const getBareId = (jid) => jid ? jid.split(':')[0].split('@')[0] : null;
        
        const remoteBareId = getBareId(msg.key.remoteJid);
        const myBareId = getBareId(myJid);
        const myLidBareId = getBareId(myLid);
        const isSelfChat = !!remoteBareId && (remoteBareId === myBareId || remoteBareId === myLidBareId);

        // Eğer sadece kendi chat'lerimize cevap verme modu aktifse ve kendi kendimize yazmıyorsak yoksay!
        if (isSelfChatOnly() && !isSelfChat) {
          continue;
        }

        // Eğer mesaj bizden gitmişse (fromMe = true)
        if (msg.key.fromMe) {
          // Sadece kendi kendimize (test amaçlı) yazdığımız mesajları şikayet olarak kabul et.
          // Vatandaşlara telefonumuzdan verdiğimiz cevapları (veya botun vatandaşlara attığı cevapları) yoksay!
          if (!isSelfChat) {
            continue;
          }
        }

        const phone = remoteBareId || msg.key.remoteJid.split('@')[0];
        global.activeJids.set(phone, msg.key.remoteJid);
        const name = msg.pushName || 'Vatandaş';
        const lowerTextTrim = text ? text.toLowerCase().trim() : '';

        // ── Memnuniyet Anketi Kontrolü ──
        if (pendingSurveys.has(phone)) {
          const complaintId = pendingSurveys.get(phone);
          
          // Şikayetin dilini öğren
          const { data: survComp } = await supabase
            .from('complaints')
            .select('language')
            .eq('id', complaintId)
            .single();
          const loc = getLocalizedMessages(survComp?.language);
          
          const score = parseInt(lowerTextTrim);
          if (!isNaN(score) && score >= 1 && score <= 5) {
            console.log(`   📊 Anket yanıtı alındı [${phone}]: ${score} (Şikayet ID: ${complaintId})`);
            const { error: surveyError } = await supabase
              .from('complaints')
              .update({ satisfaction_score: score })
              .eq('id', complaintId);
            
            if (surveyError) {
              console.error('⚠️ Anket puanı kaydedilemedi:', surveyError.message);
            }
            pendingSurveys.delete(phone);

            const thanksMsg = loc.surveyThanks;
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: thanksMsg });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
            continue;
          } else {
            const warnMsg = loc.surveyWarn;
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: warnMsg });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
            continue;
          }
        }

        // ── Temsilci Talebi Kontrolü ──
        if (lowerTextTrim === 'temsilci' || lowerTextTrim === 'temsilci ile görüş' || lowerTextTrim === 'temsilci ile gorus') {
          console.log(`   📞 Temsilci talebi algılandı [${phone}]`);
          // Vatandaşın en son aktif şikayetini bulup temsilci talebini işaretleyelim
          const { data: lastComplaint } = await supabase
            .from('complaints')
            .select('id')
            .eq('citizen_phone', phone)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastComplaint) {
            await supabase
              .from('complaints')
              .update({ wants_human_representative: true })
              .eq('id', lastComplaint.id);
          }

          const repMsg = `Talebiniz alınmıştır. Gerçek temsilcimiz en kısa sürede sizinle iletişime geçecektir. Teşekkür ederiz.`;
          const sent = await sock.sendMessage(msg.key.remoteJid, { text: repMsg });
          if (sent?.key?.id) addBotMessageId(sent.key.id);
          continue;
        }

        const wantsNewComplaint = lowerTextTrim === 'yeni şikayet' || lowerTextTrim === 'yeni sikayet';

        if (wantsNewComplaint) {
          console.log(`   🔄 Kullanıcı yeni şikayet talep etti. '${phone}' için bekleyen eski şikayetlerin durumu 'incelemede' olarak güncelleniyor...`);
          const { error: updateError } = await supabase
            .from('complaints')
            .update({ status: 'incelemede' })
            .eq('citizen_phone', phone)
            .eq('status', 'vatandas_yaniti_bekleniyor');
          if (updateError) {
            console.error('⚠️ Eski bekleyen şikayetler güncellenirken hata oluştu:', updateError.message);
          }
          pendingComplaints.delete(phone); // Varsa eski hafızayı temizle
          const promptMsg = `Yeni şikayet talebiniz başlatılmıştır. Lütfen şikayetinizi/talebinizi detaylarıyla yazınız. Şikayetin gerçekleştiği mahalle adını belirtmeyi veya konumunuzu (📍) paylaşmayı unutmayın.`;
          const sent = await sock.sendMessage(msg.key.remoteJid, { text: promptMsg });
          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }
          continue;
        }

        const handledReply = await handleCitizenReplyToAwaitingComplaint({
          sock,
          msg,
          phone,
          name,
          text,
          addBotMessageId,
          downloadMediaMessage,
          uploadMediaToSupabase,
        });
        if (handledReply) continue;

        // Bot mesajlarına veya alıntılanmış belediye metinlerine döngü engeli (vatandaş yanıtı yukarıda işlendi)
        if (
          lowerText.includes('vatandaş') ||
          lowerText.includes('belediye') ||
          lowerText.includes('takip numara') ||
          text.startsWith('✅') ||
          text.startsWith('⚠️')
        ) {
          continue;
        }

        // Konum verilerini çıkar (locationMessage veya liveLocationMessage)
        const isLocation = !!msg.message.locationMessage || !!msg.message.liveLocationMessage;
        let locLat = null;
        let locLng = null;
        if (msg.message.locationMessage) {
          locLat = msg.message.locationMessage.degreesLatitude;
          locLng = msg.message.locationMessage.degreesLongitude;
        } else if (msg.message.liveLocationMessage) {
          locLat = msg.message.liveLocationMessage.degreesLatitude;
          locLng = msg.message.liveLocationMessage.degreesLongitude;
        }

        console.log(`\n📩 Yeni Mesaj [${phone}]: ${isLocation ? '(Konum Paylaşımı)' : (text ? text.substring(0, 50) + '...' : '(Medya)')}`);

        // Bekleyen şikayet kontrolü / iptal işlemi
        const pending = pendingComplaints.get(phone);
        if (pending && (lowerTextTrim === 'iptal' || lowerTextTrim.includes('vazgeç') || lowerTextTrim.includes('vazgectim'))) {
          pendingComplaints.delete(phone);
          const sent = await sock.sendMessage(msg.key.remoteJid, { text: '❌ Şikayet talebiniz iptal edilmiştir. Yeni bir mesaj gönderebilirsiniz.' });
          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }
          continue;
        }

        // En yakın mahalleyi koordinata göre bul
        let locationNbr = null;
        if (locLat !== null && locLng !== null) {
          let minDistance = Infinity;
          for (const n of neighborhoodsCache) {
            if (n.latitude && n.longitude) {
              const d = getDistance(locLat, locLng, n.latitude, n.longitude);
              if (d < minDistance) {
                minDistance = d;
                locationNbr = n;
              }
            }
          }
        }

        // ── Konum Mesajı Geldi ──
        if (locLat !== null && locLng !== null) {
          console.log(`   📍 Konum mesajı algılandı: Lat: ${locLat}, Lng: ${locLng}`);
          if (locationNbr) {
            console.log(`   📍 En yakın mahalle: ${locationNbr.name}`);
          }
          
          if (pending && pending.text) {
            // Önce şikayet metnini yazmıştı, şimdi konumu yolladı
            console.log(`   🗂️ Bekleyen şikayet metni ile konum birleştiriliyor: "${pending.text}"`);
            
            const textToAnalyze = `Önceki şikayet konusu: "${pending.text}". Şikayetin gerçekleştiği mahalle bilgisi: "${locationNbr ? locationNbr.name : ''}".`;
            console.log('   🤖 Yapay zeka analizi yapılıyor (Konum birleşimi)...');
            const analysis = await analyzeWithAI(textToAnalyze);
            
            let departmentId = null;
            if (analysis.department) {
              const foundDept = departmentsCache.find((d) => d.name === analysis.department);
              if (foundDept) departmentId = foundDept.id;
            }
            
            const { data: complaint, error: dbError } = await supabase
              .from('complaints')
              .insert([
                {
                  citizen_phone: phone,
                  citizen_name: name,
                  complaint_text: pending.text,
                  status: 'yeni',
                  source: 'whatsapp_qr',
                  language: analysis.language || 'tr',
                  neighborhood_id: locationNbr ? locationNbr.id : null,
                  latitude: locLat,
                  longitude: locLng
                },
              ])
              .select()
              .single();
              
            if (dbError) throw dbError;
            
            await supabase
              .from('complaints')
              .update({
                category: analysis.category || 'Diğer',
                ai_category: analysis.category,
                ai_department_id: departmentId,
                assigned_department_id: departmentId,
                priority: analysis.priority,
              })
              .eq('id', complaint.id);
              
            pendingComplaints.delete(phone);
            
            const reply = `✅ Sayın ${name}, gönderdiğiniz konuma göre şikayetiniz ${locationNbr ? locationNbr.name + ' Mahallesi' : 'ilgili mahalle'} olarak başarıyla alınmıştır.\n\n` +
              `📋 Kategori: ${analysis.category}\n` +
              `🏢 Birim: ${analysis.department || 'İlgili Müdürlük'}\n` +
              `Takip numaranız: ${complaint.id.substring(0, 8).toUpperCase()}\n\n` +
              `💬 Gerçek bir temsilci ile görüşmek isterseniz aşağıdaki linke tıklayabilirsiniz:\n` +
              `https://wa.me/905362206204?text=temsilci`;
              
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: reply });
            if (sent?.key?.id) {
              addBotMessageId(sent.key.id);
            }
            continue;
          } else {
            // Önce konumu yolladı, şikayet detayını sonra yazacak
            pendingComplaints.set(phone, {
              lat: locLat,
              lng: locLng,
              neighborhoodId: locationNbr ? locationNbr.id : null,
              neighborhoodName: locationNbr ? locationNbr.name : null,
              timestamp: Date.now()
            });
            
            const reply = `📍 Gönderdiğiniz konuma göre ${locationNbr ? locationNbr.name + ' Mahallesi' : 'Alanya'} sınırlarında olduğunuzu tespit ettik.\n\n` +
              `Lütfen bu bölgedeki şikayetinizin/talebinizin detaylarını yazar mısınız?`;
              
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: reply });
            if (sent?.key?.id) {
              addBotMessageId(sent.key.id);
            }
            continue;
          }
        }

        let textToAnalyze = text;
        if (pending && (Date.now() - pending.timestamp < 5 * 60 * 1000)) {
          if (pending.text) {
            textToAnalyze = `Önceki şikayet konusu: "${pending.text}". Şikayetin gerçekleştiği mahalle bilgisi: "${text}".`;
          } else if (pending.lat !== undefined) {
            textToAnalyze = `Şikayet konusu: "${text}". Şikayetin gerçekleştiği mahalle bilgisi: "${pending.neighborhoodName || ''}".`;
          }
          console.log(`📌 Bekleyen oturum verisi birleştirildi: ${textToAnalyze}`);
        }

        // ── 1) AI ile Önce Analiz Et ──────────────────────────────
        let analysis;
        if (textToAnalyze && textToAnalyze.trim().length > 3) {
          console.log('   🤖 Yapay zeka analizi yapılıyor...');
          analysis = await analyzeWithAI(textToAnalyze);
          console.log('   📊 Analiz Sonucu:', JSON.stringify(analysis, null, 2));
        } else {
          analysis = {
            category: 'Diğer',
            department: '',
            neighborhood: null,
            priority: 'orta',
            auto_response: '',
            send_pdfs: [],
            interaction_type: 'sikayet',
            language: 'tr',
          };
        }

        // ── 2) Bilgi Talebi mi, Şikayet mi? ─────────────────────
        if (analysis.interaction_type === 'bilgi') {
          // ─── BİLGİ TALEBİ: Şikayet tablosuna kaydetme, ai_bot_logs'a yaz ───
          console.log('   ℹ️ Bilgi talebi tespit edildi, şikayet kaydı OLUŞTURULMUYOR.');

          await supabase.from('ai_bot_logs').insert([{
            question: text || '(Medya)',
            answer: analysis.auto_response || 'Bilgi verildi.',
            related_filters: {
              citizen_phone: phone,
              citizen_name: name,
              category: analysis.category,
              department: analysis.department,
              language: analysis.language || 'tr',
              source: 'whatsapp_qr',
            },
          }]);

          // Vatandaşa bilgi cevabını gönder
          const infoReply = analysis.auto_response ||
            `Sayın ${name}, bilgi talebiniz için teşekkür ederiz. Alanya Belediyesi olarak size yardımcı olmaktan memnuniyet duyarız. 😊`;

          const sent = await sock.sendMessage(msg.key.remoteJid, { text: infoReply });
          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }

          // PDF gönder (birden fazla PDF destekli)
          const pdfsToSend = analysis.send_pdfs || (analysis.send_pdf ? ['nikah-evraklari.pdf'] : []);
          for (const pdfFileName of pdfsToSend) {
            const pdfMeta = pdfConfig.pdfs.find(p => p.dosya === pdfFileName);
            const displayName = pdfMeta
              ? pdfMeta.goruntu_adi.replace(/\s+/g, '_') + '.pdf'
              : pdfFileName;
            const pdfFilePath = path.join(__dirname, 'assets', pdfFileName);
            if (fs.existsSync(pdfFilePath)) {
              console.log(`   📄 PDF gönderiliyor: ${pdfFileName}`);
              const pdfBuffer = fs.readFileSync(pdfFilePath);
              const sentDoc = await sock.sendMessage(msg.key.remoteJid, {
                document: pdfBuffer,
                mimetype: 'application/pdf',
                fileName: displayName
              });
              if (sentDoc?.key?.id) {
                addBotMessageId(sentDoc.key.id);
              }
            } else {
              console.warn(`   ⚠️ PDF dosyası bulunamadı: ${pdfFilePath}`);
            }
          }

        } else {
          // ─── ŞİKAYET: Şikayet tablosuna kaydet ───
          
          // AI Sonuçlarına göre Müdürlük bul
          let departmentId = null;
          if (analysis.department) {
            const foundDept = departmentsCache.find((d) => d.name === analysis.department);
            if (foundDept) departmentId = foundDept.id;
          }

          // AI Sonuçlarına göre Mahalle bul
          let neighborhoodId = null;
          if (pending && pending.neighborhoodId) {
            neighborhoodId = pending.neighborhoodId;
          } else if (analysis.neighborhood) {
            const cleanedInput = analysis.neighborhood.trim().toLowerCase().replace(' mahallesi', '').replace(' mah.', '');
            const foundNbr = neighborhoodsCache.find((n) => {
              const cleanedName = n.name.trim().toLowerCase().replace(' mahallesi', '').replace(' mah.', '');
              return cleanedName === cleanedInput || cleanedName.includes(cleanedInput) || cleanedInput.includes(cleanedName);
            });
            if (foundNbr) neighborhoodId = foundNbr.id;
          }

          // Mahalle bulunamadıysa veritabanına ekleme, kullanıcıya sor
          if (!neighborhoodId) {
            console.log('   ⚠️ Mahalle belirlenemedi veya bulunamadı, şikayet kaydı veritabanına OLUŞTURULMUYOR.');
            
            // Eğer henüz bekleyen bir şikayet yoksa, bu orijinal şikayet metnini hafızaya alalım
            if (!pending) {
              pendingComplaints.set(phone, { text: text || '(Medya İçeren Şikayet)', timestamp: Date.now() });
            } else {
              // Süreyi yenile
              pending.timestamp = Date.now();
            }

            let askBase = analysis.auto_response ||
              `Sayın ${name}, şikayetinizi doğru mahalle ile eşleştirebilmemiz için lütfen mahalle adını yazınız.`;
            // "102 mahalle" ifadelerini temizle
            askBase = askBase.replace(/[^.]*102 mahalle[^.]*\./gi, '').trim();
            const askReply = askBase + `\n\n📍 _Konum bilginizi paylaşarak da yerinizi bildirebilirsiniz._`;
            
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: askReply });
            if (sent?.key?.id) {
              addBotMessageId(sent.key.id);
            }
            continue; // döngüde sonraki mesaja geç
          }

          console.log('   🗂️ Şikayet tespit edildi, kayıt oluşturuluyor.');

          const complaintTextToSave = (pending && pending.text) ? pending.text : (text || '(Sadece Medya İçeren Mesaj)');
          const { data: complaint, error: dbError } = await supabase
            .from('complaints')
            .insert([
              {
                citizen_phone: phone,
                citizen_name: name,
                complaint_text: complaintTextToSave,
                status: 'yeni',
                source: 'whatsapp_qr',
                language: analysis.language || 'tr',
                latitude: (pending && pending.lat !== undefined) ? pending.lat : null,
                longitude: (pending && pending.lng !== undefined) ? pending.lng : null,
              },
            ])
            .select()
            .single();

          if (dbError) throw dbError;

          // Medya/Fotoğraf Kontrolü ve İndirme
          const messageType = Object.keys(msg.message)[0];
          if (messageType === 'imageMessage' || messageType === 'documentMessage') {
            console.log('   📷 Medya algılandı, indiriliyor...');
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger });
            const contentType = msg.message[messageType].mimetype;
            const fileUrl = await uploadMediaToSupabase(buffer, phone, contentType);

            if (fileUrl) {
              await supabase.from('complaint_attachments').insert([
                {
                  complaint_id: complaint.id,
                  file_url: fileUrl,
                  file_type: contentType.startsWith('image') ? 'image' : 'document',
                },
              ]);
            }
          }

          // AI Sonuçlarını Güncelle
          await supabase
            .from('complaints')
            .update({
              category: analysis.category || 'Diğer',
              ai_category: analysis.category,
              ai_department_id: departmentId,
              assigned_department_id: departmentId,
              neighborhood_id: neighborhoodId,
              priority: analysis.priority,
              language: analysis.language || 'tr',
            })
            .eq('id', complaint.id);

          // Bekleyen şikayeti temizle
          pendingComplaints.delete(phone);

          // Kullanıcıya Cevap Gönder
          const lang = (analysis.language || 'tr').toLowerCase().trim();
          
          let confirmationText = `✅ Sayın ${name}, şikayetiniz başarıyla alınmıştır.`;
          let categoryText = `📋 Kategori: ${analysis.category}`;
          let departmentText = `🏢 Yönlendirilen Birim: ${analysis.department || 'İlgili Müdürlük'}`;
          let trackingText = `Takip numaranız: ${complaint.id.substring(0, 8).toUpperCase()}`;
          let footerText = `Alanya Belediyesi olarak en kısa sürede dönüş yapacağız.`;
          let representativeText = `💬 Gerçek bir temsilci ile görüşmek isterseniz aşağıdaki linke tıklayabilirsiniz:\nhttps://wa.me/905362206204?text=temsilci`;

          if (lang === 'en' || lang === 'english') {
            confirmationText = `✅ Dear ${name}, your request has been successfully received.`;
            categoryText = `📋 Category: ${analysis.category}`;
            departmentText = `🏢 Assigned Department: ${analysis.department || 'Relevant Department'}`;
            trackingText = `Tracking number: ${complaint.id.substring(0, 8).toUpperCase()}`;
            footerText = `As Alanya Municipality, we will get back to you as soon as possible.`;
            representativeText = `💬 If you want to speak with a real representative, you can click the link below:\nhttps://wa.me/905362206204?text=representative`;
          } else if (lang === 'de' || lang === 'german' || lang === 'deutsch') {
            confirmationText = `✅ Sehr geehrte(r) ${name}, Ihr Anliegen wurde erfolgreich entgegengenommen.`;
            categoryText = `📋 Kategorie: ${analysis.category}`;
            departmentText = `🏢 Zuständige Abteilung: ${analysis.department || 'Zuständige Abteilung'}`;
            trackingText = `Auftragsnummer: ${complaint.id.substring(0, 8).toUpperCase()}`;
            footerText = `Als Stadtverwaltung Alanya werden wir uns so schnell wie möglich bei Ihnen melden.`;
            representativeText = `💬 Wenn Sie mit einem echten Vertreter sprechen möchten, klicken Sie bitte auf den folgenden Link:\nhttps://wa.me/905362206204?text=vertreter`;
          } else if (lang === 'ru' || lang === 'russian' || lang === 'русский') {
            confirmationText = `✅ Уважаемый(ая) ${name}, ваш запрос успешно получен.`;
            categoryText = `📋 Категория: ${analysis.category}`;
            departmentText = `🏢 Назначенный отдел: ${analysis.department || 'Соответствующий отдел'}`;
            trackingText = `Номер отслеживания: ${complaint.id.substring(0, 8).toUpperCase()}`;
            footerText = `Муниципалитет Алании свяжется с вами в кратчайшие сроки.`;
            representativeText = `💬 Если вы хотите поговорить с настоящим представителем, нажмите на ссылку ниже:\nhttps://wa.me/905362206204?text=представитель`;
          }

          const reply =
            (analysis.auto_response ? analysis.auto_response + '\n\n' : '') +
            `${confirmationText}\n\n` +
            `${categoryText}\n` +
            `${departmentText}\n` +
            `${trackingText}\n` +
            `${footerText}\n\n` +
            `${representativeText}`;

          const sent = await sock.sendMessage(msg.key.remoteJid, { text: reply });
          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }

          // ŞİKAYET olsa bile eşleşen PDF'ler varsa gönder! (Örnek: Ruhsat sordu ama AI şikayet kategorisine attıysa)
          const pdfsToSend = analysis.send_pdfs || (analysis.send_pdf ? ['nikah-evraklari.pdf'] : []);
          for (const pdfFileName of pdfsToSend) {
            const pdfMeta = pdfConfig.pdfs.find(p => p.dosya === pdfFileName);
            const displayName = pdfMeta
              ? pdfMeta.goruntu_adi.replace(/\s+/g, '_') + '.pdf'
              : pdfFileName;
            const pdfFilePath = path.join(__dirname, 'assets', pdfFileName);
            if (fs.existsSync(pdfFilePath)) {
              console.log(`   📄 PDF gönderiliyor (Şikayet akışı): ${pdfFileName}`);
              const pdfBuffer = fs.readFileSync(pdfFilePath);
              const sentDoc = await sock.sendMessage(msg.key.remoteJid, {
                document: pdfBuffer,
                mimetype: 'application/pdf',
                fileName: displayName
              });
              if (sentDoc?.key?.id) {
                addBotMessageId(sentDoc.key.id);
              }
            }
          }
        }

      } catch (err) {
        console.error('❌ Mesaj işleme hatası:', err);
      }
    }
  });
}

// ─── AI Analiz ────────────────────────────────────────────────────
async function analyzeWithAI(text) {
  const fallback = {
    category: 'Diğer',
    department: '',
    neighborhood: null,
    priority: 'orta',
    auto_response: '',
    send_pdfs: [],
    interaction_type: 'sikayet',
    language: 'tr',
  };

  if (!openai) {
    console.log('⚠️ OPENAI_API_KEY yok, anahtar kelime tabanlı sınıflandırma kullanılıyor.');
    const local = classifyByKeyword(text);
    return { 
      ...fallback, 
      ...local,
      interaction_type: (local.department === 'Yazı İşleri Müdürlüğü') ? 'bilgi' : 'sikayet'
    };
  }

  const deptList = departmentsCache.map((d) => d.name).join(', ');
  // Etkinlik bilgisini önce detaylı knowledge dosyasından, yoksa DB cache'den al
  const eventsList = eventsDocsText || eventsCache.map((e) => `- ${e.title}: ${e.start_date} - ${e.end_date} (${e.description || ''})`).join('\n');
  const pdfCatalog = buildPdfCatalogText();
  const mukhtarsList = neighborhoodsCache
    .filter((n) => n.mukhtar_name)
    .map((n) => `- ${n.name} Mahallesi Muhtarı: ${n.mukhtar_name} (İletişim/Telefon: ${n.mukhtar_phone || 'Kayıtlı Değil'})`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Sen Alanya Belediyesi yapay zeka şikayet ve bilgi asistanısın. Antalya'nın Alanya ilçesinde görev yapıyorsun. Belediye Başkanı Osman Tarık Özçelik'tir.

Vatandaştan gelen şikayeti veya bilgi talebini analiz et ve SADECE JSON döndür:
{"category":"Kategori Adı","department":"Müdürlük Adı","neighborhood":"Şikayette geçen mahalle adı (Örn: Fığla, Mahmutlar, Oba, Konaklı vb.) veya null","priority":"yuksek|orta|dusuk","interaction_type":"sikayet|bilgi","language":"tr|en|ru|de|... (mesajın dili)","send_pdfs":["dosya-adi.pdf"],"auto_response":"Vatandaşa kısa, nazik, profesyonel cevap (3-4 cümle, emoji kullanabilirsin. Alanya Belediyesi olarak hitap et. DİL KURALI: Gelen mesaj hangi dilde yazılmışsa, auto_response cevabını da O DİLDE oluştur.)"}

Kategoriler: Yol / Altyapı, Temizlik / Atık, Park ve Bahçeler, İmar / Yapı, Çevre / Sıfır Atık, Zabıta / Düzen, Hayvan Hakları, Kültür / Sosyal, Kırsal Hizmetler, Kentsel Dönüşüm, Afet / Acil, Diğer.

Mevcut Müdürlükler: ${deptList}

BELEDİYE BİLGİ REHBERİ (EVLENDİRME İŞLEMLERİ):
${nikahDocsText}

BELEDİYE BİLGİ REHBERİ (RUHSAT VE İŞYERİ AÇMA İŞLEMLERİ):
${ruhsatDocsText}

BELEDİYE BİLGİ REHBERİ (MAHALLE MUHTARLARI):
${mukhtarsList}

BELEDİYE ETKİNLİK REHBERİ (2026 YILI ETKİNLİKLERİ & FESTİVALLERİ):
${eventsList}

GÖNDERİLEBİR PDF BELGELERİ:
${pdfCatalog}
 
KURALLAR:
- Nikah, evlilik, evlenme belgeleri vb. sorular için "Müdürlük Adı" olarak "Yazı İşleri Müdürlüğü" seç.
- İşyeri açma, ruhsat, sıhhi/gayrisıhhi müessese ruhsatı vb. sorular için "Müdürlük Adı" olarak "Ruhsat ve Denetim Müdürlüğü" seç.
- Vatandaş bir mahallenin muhtarını, muhtar ismini veya muhtarlık iletişim/telefon numarasını sorarsa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (MAHALLE MUHTARLARI)" listesini kullanarak net, doğru ve doğrudan isim ile telefon numarasını içeren bir auto_response hazırla. Bu tür bilgi talepleri için "Müdürlük Adı" olarak "Muhtarlık İşleri Müdürlüğü" seç.
- Vatandaş evlilik/nikah evrakları, yabancı evliliği, yaş sınırı, iddet müddeti gibi konuları sorursa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (EVLENDİRME İŞLEMLERİ)"ne göre akıl yürüterek tam, doğru ve detaylı bir auto_response hazırla.
- Vatandaş ruhsat başvurusu, gerekli evraklar veya ruhsat onay süreçleri hakkında soru sorarsa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (RUHSAT VE İŞYERİ AÇMA İŞLEMLERİ)" bilgilerine göre gerekli evrakları ve adımları açıklayan detaylı bir auto_response hazırla.
- Vatandaş belediyenin düzenlediği veya ev sahipliği yaptığı festivaller, konserler, fuarlar, etkinlikler, spor turnuvaları vb. hakkında soru sorarsa, yukarıdaki "BELEDİYE ETKİNLİK REHBERİ" bilgilerini kullanarak net, tarih ve detay içeren bir auto_response hazırla.
- "send_pdfs": Vatandaşın sorusuyla ilgili GÖNDERİLEBİR PDF BELGELERİ listesindeki belgelerin dosya adlarını bir dizi (array) olarak ekle. Birden fazla PDF ilgiliyse hepsini ekle. Hiçbir PDF ilgili değilse boş dizi [] döndür. Sadece yukarıdaki listede bulunan dosya adlarını kullan.
- "interaction_type": Vatandaş belediyeye bir sorun bildiriyorsa, belediyeden fiziksel bir işlem, denetim veya onarım yapmasını talep ediyorsa (örneğin çöpün alınması, yolun yapılması, gürültü yapılması, seyyar satıcı, kaçak yapı, sokak hayvanı vb.) "sikayet" seç. Vatandaş sadece bilgi almak istiyorsa, belge/evrak soruyorsa, evlilik yaş sınırı, ruhsat belgeleri, çalışma saatleri veya belediye etkinliklerinin/festivallerinin tarihleri gibi bilgi verici konuları soruyorsa "bilgi" seç.
- "language": Gelen mesajın dilini (tr, en, ru, de vb.) tespit edip buraya yaz.
- Vatandaş bir şikayet ("interaction_type" = "sikayet") bildiriyorsa ancak mesajında belirgin/spesifik bir mahalle adı belirtmemişse veya "her yerde", "tüm Alanya" gibi belirsiz/genel ifadeler kullanmışsa, "neighborhood" değerini mutlaka null döndür. Bu durumda "auto_response" alanında vatandaştan şikayetin gerçekleştiği mahallenin adını yazmasını veya direkt konumunu (📍) paylaşarak yerini bildirmesini isteyen kısa ve nazik bir mesaj yaz (gelen mesajın kendi dilinde). Sakın mahalle sayısından veya "102 mahalle" gibi ifadelerden bahsetme.
- auto_response yazılırken vatandaşın sorduğu dilde yaz (İngilizce sorduysa İngilizce, Rusça sorduysa Rusça vb.)
- Müdürlük adını yukarıdaki listeden BİREBİR AYNY YAZIMLA seç.
- Eğer vatandaş bir mahalle belirtmişse, auto_response içinde mahalle adını tekrar et.
- auto_response mesajı Alanya Belediyesi adına yazılmalı.
- priority: acil/tehlikeli durumlar = yuksek, genel şikayetler ve bilgi talepleri = orta, öneri/istek = dusuk.`,
        },
        { role: 'user', content: text },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    // Geriye uyumluluk: eski send_pdf:boolean formatını da destekle
    let sendPdfs = parsed.send_pdfs || [];
    if (!Array.isArray(sendPdfs)) {
      if (typeof sendPdfs === 'string') {
        sendPdfs = [sendPdfs];
      } else {
        sendPdfs = [];
      }
    }
    // Eğer AI eski send_pdf formatında true dönmüşse, cümlenin içeriğine göre anahtar kelimeden bulalım
    if ((parsed.send_pdf === true || parsed.send_pdf === 'true') && sendPdfs.length === 0) {
      const keywordResult = classifyByKeyword(text);
      if (keywordResult.send_pdfs && keywordResult.send_pdfs.length > 0) {
        sendPdfs = keywordResult.send_pdfs;
      } else {
        sendPdfs = ['nikah-evraklari.pdf']; // En son çare
      }
    }
    return {
      category: parsed.category || fallback.category,
      department: parsed.department || fallback.department,
      neighborhood: parsed.neighborhood || null,
      priority: parsed.priority || fallback.priority,
      auto_response: parsed.auto_response || fallback.auto_response,
      send_pdfs: sendPdfs,
      interaction_type: parsed.interaction_type || fallback.interaction_type,
      language: parsed.language || 'tr',
    };
  } catch (err) {
    console.error('⚠️ AI analiz hatası:', err.message);
    return { ...fallback, ...classifyByKeyword(text) };
  }
}

// ─── Anahtar Kelime Tabanlı Yedek Sınıflandırma (Alanya) ─────────
function classifyByKeyword(text) {
  const lower = text.toLowerCase();
  const rules = [
    { keywords: ['yol', 'asfalt', 'çukur', 'kaldırım', 'köprü', 'altyapı'], category: 'Yol / Altyapı', department: 'Fen İşleri Müdürlüğü' },
    { keywords: ['çöp', 'temizlik', 'süpür', 'atık', 'pis', 'koku', 'konteyner'], category: 'Temizlik / Atık', department: 'Temizlik İşleri Müdürlüğü' },
    { keywords: ['park', 'bahçe', 'ağaç', 'yeşil', 'çim', 'budama', 'peyzaj'], category: 'Park ve Bahçeler', department: 'Park ve Bahçeler Müdürlüğü' },
    { keywords: ['imar', 'inşaat', 'kaçak', 'yapı', 'kat'], category: 'İmar / Yapı', department: 'İmar ve Şehircilik Müdürlüğü' },
    { keywords: ['geri dönüşüm', 'sıfır atık', 'iklim', 'çevre kirliliği'], category: 'Çevre / Sıfır Atık', department: 'İklim Değişikliği ve Sıfır Atık Müdürlüğü' },
    { keywords: ['gürültü', 'seyyar', 'düzen', 'zabıta', 'işgal', 'müzik'], category: 'Zabıta / Düzen', department: 'Zabıta Müdürlüğü' },
    { keywords: ['köpek', 'kedi', 'hayvan', 'sokak hayvanı', 'barınak', 'mama'], category: 'Hayvan Hakları', department: 'Veteriner İşleri Müdürlüğü' },
    { keywords: ['kültür', 'etkinlik', 'konser', 'festival', 'sergi', 'tiyatro'], category: 'Kültür / Sosyal', department: 'Kültür, Sanat ve Sosyal İşler Müdürlüğü' },
    { keywords: ['köy', 'kırsal', 'tarla', 'tarım'], category: 'Kırsal Hizmetler', department: 'Kırsal Hizmetler Müdürlüğü' },
    { keywords: ['dönüşüm', 'riskli', 'deprem', 'yıkım', 'kentsel'], category: 'Kentsel Dönüşüm', department: 'Kentsel Dönüşüm Müdürlüğü' },
    { keywords: ['sel', 'yangın', 'afet', 'heyelan', 'acil'], category: 'Afet / Acil', department: 'Afet İşleri ve Risk Yönetimi Müdürlüğü' },
    { keywords: ['emlak', 'arsa', 'kamulaştırma', 'kira'], category: 'Diğer', department: 'Emlak ve İstimlak Müdürlüğü' },
    { keywords: ['vergi', 'ödeme', 'borç', 'tahsilat'], category: 'Diğer', department: 'Gelirler Müdürlüğü' },
    { keywords: ['sosyal yardım', 'engelli', 'yardım', 'ihtiyaç'], category: 'Diğer', department: 'Sosyal Hizmetler Müdürlüğü' },
    { keywords: ['nikah', 'evlilik', 'evlenme', 'düğün', 'aile cüzdanı'], category: 'Diğer', department: 'Yazı İşleri Müdürlüğü', send_pdfs: ['nikah-evraklari.pdf'] },
    { keywords: ['sıhhi', 'sihhi', 'berber', 'kuaför', 'lokanta', 'bakkal', 'market', 'ofis'], category: 'Diğer', department: 'Ruhsat ve Denetim Müdürlüğü', send_pdfs: ['Sıhhi Form.pdf'] },
    { keywords: ['gayrisıhhi', 'gayrisihhi', 'gsm', 'imalathane', 'atölye', 'fabrika', 'depo'], category: 'Diğer', department: 'Ruhsat ve Denetim Müdürlüğü', send_pdfs: ['Gayrisıhhi Form.pdf'] },
    { keywords: ['umuma açık', 'otel', 'pansiyon', 'bar', 'disko', 'eğlence'], category: 'Diğer', department: 'Ruhsat ve Denetim Müdürlüğü', send_pdfs: ['Umuma Açık Form.pdf'] },
    { keywords: ['tekne', 'gezi teknesi', 'yat', 'deniz turizmi'], category: 'Diğer', department: 'Ruhsat ve Denetim Müdürlüğü', send_pdfs: ['Gezi Tekneleri.pdf'] },
    { keywords: ['ruhsat', 'işyeri açma', 'dükkan açma'], category: 'Diğer', department: 'Ruhsat ve Denetim Müdürlüğü', send_pdfs: ['Sıhhi Form.pdf', 'Gayrisıhhi Form.pdf', 'Umuma Açık Form.pdf'] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { 
        category: rule.category, 
        department: rule.department,
        send_pdfs: rule.send_pdfs || []
      };
    }
  }
  return { category: 'Diğer', department: '', send_pdfs: [] };
}

// ─── Vatandaş Yanıtı (Bekleyen Şikayete Ekleme) ─────────────────
async function checkIfMessageIsReplyToPending(complaintText, adminQuestion, userMessage) {
  if (!openai) {
    const lower = userMessage.toLowerCase().trim();
    if (lower === 'yeni şikayet' || lower === 'yeni sikayet' || lower === 'yeni') return false;
    return true;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Sen bir belediye WhatsApp botu asistanısın.
Kullanıcının bekleyen aktif bir şikayeti var. Bu şikayet ve belediyenin sorduğu soru aşağıdadır:

Şikayet Konusu: "${complaintText}"
Belediyenin Sorusu: "${adminQuestion || ''}"

Kullanıcı şimdi yeni bir mesaj gönderdi:
"${userMessage}"

Görevin: Kullanıcının bu son mesajının, belediyenin sorduğu soruya bir CEVAP/YANIT mı (yani aynı şikayetle mi ilgili), yoksa tamamen YENİ/FARKLI/BAĞIMSIZ bir şikayet veya talep mi olduğunu belirle.

Sadece aşağıdaki JSON formatında çıktı ver:
{
  "is_reply": true (eğer mesaj önceki şikayete/soruya verilen bir cevapsa veya onunla ilgiliyse) veya false (eğer tamamen yeni/farklı bir şikayet/konu ise veya kullanıcı yeni bir şikayet açmak istediğini belirtiyorsa)
}`
        }
      ],
      temperature: 0.1
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return !!parsed.is_reply;
  } catch (err) {
    console.error('⚠️ is_reply sınıflandırma hatası:', err);
    return true; // Hata durumunda güvenli liman olarak yanıt kabul et
  }
}

async function handleCitizenReplyToAwaitingComplaint({
  sock,
  msg,
  phone,
  name,
  text,
  addBotMessageId,
  downloadMediaMessage,
  uploadMediaToSupabase,
}) {
  const { data: awaiting, error } = await supabase
    .from('complaints')
    .select('id, complaint_text, citizen_name')
    .eq('citizen_phone', phone)
    .eq('status', 'vatandas_yaniti_bekleniyor')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('⚠️ Bekleyen şikayet sorgusu hatası:', error.message);
    return false;
  }

  if (!awaiting) return false;

  // AI ile bu yeni mesajın eski şikayete bir cevap mı yoksa yeni bir şikayet mi olduğunu sorgula
  let isReply = true;
  if (text && text.trim().length > 0) {
    // Son belediye sorusunu çek
    const { data: lastQuestion } = await supabase
      .from('complaint_responses')
      .select('response_text')
      .eq('complaint_id', awaiting.id)
      .eq('response_type', 'soru')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const adminQuestion = lastQuestion ? lastQuestion.response_text : '';
    
    // AI sınıflandırması yap
    isReply = await checkIfMessageIsReplyToPending(awaiting.complaint_text, adminQuestion, text);
    console.log(`   🤖 Mesaj sınıflandırması: Eski şikayete cevap mı? = ${isReply ? 'EVET' : 'HAYIR'}`);
  }

  if (!isReply) {
    // Eğer yeni bir şikayet ise, eski şikayeti 'incelemede' durumuna çekip yeni şikayet akışına bırakıyoruz
    console.log(`   🔄 Vatandaş yeni bir şikayet yazmış. Eski şikayet (${awaiting.id.substring(0, 8)}) durumu 'incelemede' olarak güncelleniyor...`);
    await supabase
      .from('complaints')
      .update({ status: 'incelemede' })
      .eq('id', awaiting.id);
    return false;
  }

  console.log(`   💬 Vatandaş yanıtı mevcut şikayete ekleniyor (${awaiting.id.substring(0, 8)})`);

  const replyText = text?.trim() || '(Medya yanıtı)';

  const { error: responseError } = await supabase.from('complaint_responses').insert({
    complaint_id: awaiting.id,
    response_text: replyText,
    response_type: 'vatandas',
  });

  if (responseError) {
    console.error('⚠️ Vatandaş yanıtı kaydedilemedi:', responseError.message);
    return false;
  }

  const messageType = Object.keys(msg.message)[0];
  if (messageType === 'imageMessage' || messageType === 'documentMessage') {
    console.log('   📷 Vatandaş yanıtına medya ekleniyor...');
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger });
    const contentType = msg.message[messageType].mimetype;
    const fileUrl = await uploadMediaToSupabase(buffer, phone, contentType);

    if (fileUrl) {
      await supabase.from('complaint_attachments').insert([
        {
          complaint_id: awaiting.id,
          file_url: fileUrl,
          file_type: contentType.startsWith('image') ? 'image' : 'document',
        },
      ]);
    }
  }

  await supabase
    .from('complaints')
    .update({ status: 'incelemede' })
    .eq('id', awaiting.id);

  const trackingNo = awaiting.id.substring(0, 8).toUpperCase();
  const ackReply =
    `✅ Sayın ${name}, yanıtınız *${trackingNo}* takip numaralı şikayetinize kaydedilmiştir.\n\n` +
    `Müdürlüğümüz en kısa sürede değerlendirecektir. Teşekkür ederiz. 🙏`;

  const sent = await sock.sendMessage(msg.key.remoteJid, { text: ackReply });
  if (sent?.key?.id) {
    addBotMessageId(sent.key.id);
  }

  return true;
}

// ─── Medya Yükleme ───────────────────────────────────────────────
async function uploadMediaToSupabase(buffer, phone, contentType) {
  try {
    const ext = contentType.split('/')[1] || 'jpg';
    const fileName = `whatsapp/${phone}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('attachments')
      .upload(fileName, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error('⚠️ Medya yüklenemedi:', error.message);
      return null;
    }

    const { data } = supabase.storage.from('attachments').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (err) {
    console.error('⚠️ Medya yükleme hatası:', err.message);
    return null;
  }
}

// ─── Başlat ────────────────────────────────────────────────────────
startBot();
