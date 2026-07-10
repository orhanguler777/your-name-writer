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

// Geliştirici/Test modu ayarı kontrolü
function isSelfChatOnly() {
  try {
    const settingsPath = path.join(__dirname, 'bot-settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.selfChatOnly === true;
    }
  } catch (e) {
    // Okuma hatası durumunda güvenli tarafta kalıp true dönüyoruz
  }
  return true;
}

// ─── Departments, Neighborhoods & Events Cache ─────────────────────
let departmentsCache = [];
let neighborhoodsCache = [];
let eventsCache = [];
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
  const { data: nbrs, error: nbrError } = await supabase.from('neighborhoods').select('id, name');
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
              
              // Sadece personelin yazdığı manuel cevapları vatandaşa WhatsApp'tan ilet
              if (newResponse.response_type !== 'manuel') return;

              console.log(`\n   📨 Yeni belediye cevabı tespit edildi (Şikayet ID: ${newResponse.complaint_id})`);

              // Şikayeti ve vatandaşın telefonunu çek
              const { data: complaint, error: compError } = await supabase
                .from('complaints')
                .select('citizen_phone, citizen_name, status')
                .eq('id', newResponse.complaint_id)
                .single();

              if (compError || !complaint) {
                console.error('⚠️ Cevap için vatandaş bilgileri bulunamadı:', compError?.message);
                return;
              }

              // JID formatı (16690377154811 -> 16690377154811@s.whatsapp.net)
              const jid = complaint.citizen_phone.includes('@') 
                ? complaint.citizen_phone 
                : `${complaint.citizen_phone}@s.whatsapp.net`;
                
              const statusEmoji = complaint.status === 'cozuldu' ? '✅' : '📢';
              const statusText = complaint.status === 'cozuldu' ? 'ÇÖZÜLDÜ' : 'GÜNCELLENDİ';

              const responseText = 
                `${statusEmoji} *Alanya Belediyesi Bilgilendirme*\n\n` +
                `Sayın *${complaint.citizen_name}*,\n` +
                `Şikayetinizin durumu *${statusText}* olarak güncellenmiştir.\n\n` +
                `*Belediye Birim Açıklaması:*\n"${newResponse.response_text}"\n\n` +
                `Alanya Belediyesi olarak iyi günler dileriz. 🌟`;

              const sent = await sock.sendMessage(jid, { text: responseText });
              if (sent?.key?.id) {
                addBotMessageId(sent.key.id);
              }
              console.log(`   💬 Cevap WhatsApp üzerinden vatandaşa iletildi (${complaint.citizen_phone})`);

            } catch (err) {
              console.error('⚠️ Realtime bildirim gönderme hatası:', err.message);
            }
          }
        )
        .subscribe();
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

        // Kendimize attığımız mesajlarda veya botun gönderdiklerinde sonsuz döngü engeli
        if (
          lowerText.includes('vatandaş') ||
          lowerText.includes('belediye') ||
          lowerText.includes('takip numara') ||
          text.startsWith('✅') ||
          text.startsWith('⚠️')
        ) {
          continue;
        }

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
        const name = msg.pushName || 'Vatandaş';

        console.log(`\n📩 Yeni Mesaj [${phone}]: ${text ? text.substring(0, 50) + '...' : '(Medya)'}`);

        // ── 1) AI ile Önce Analiz Et ──────────────────────────────
        let analysis;
        if (text && text.trim().length > 3) {
          console.log('   🤖 Yapay zeka analizi yapılıyor...');
          analysis = await analyzeWithAI(text);
          console.log('   📊 Analiz Sonucu:', JSON.stringify(analysis, null, 2));
        } else {
          analysis = {
            category: 'Diğer',
            department: '',
            neighborhood: null,
            priority: 'orta',
            auto_response: '',
            send_pdf: false,
            interaction_type: 'sikayet',
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
          console.log('   🗂️ Şikayet tespit edildi, kayıt oluşturuluyor.');

          const { data: complaint, error: dbError } = await supabase
            .from('complaints')
            .insert([
              {
                citizen_phone: phone,
                citizen_name: name,
                complaint_text: text || '(Sadece Medya İçeren Mesaj)',
                status: 'yeni',
                source: 'whatsapp_qr',
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
          let departmentId = null;
          if (analysis.department) {
            const foundDept = departmentsCache.find((d) => d.name === analysis.department);
            if (foundDept) departmentId = foundDept.id;
          }

          let neighborhoodId = null;
          if (analysis.neighborhood) {
            const cleanedInput = analysis.neighborhood.trim().toLowerCase().replace(' mahallesi', '').replace(' mah.', '');
            const foundNbr = neighborhoodsCache.find((n) => {
              const cleanedName = n.name.trim().toLowerCase().replace(' mahallesi', '').replace(' mah.', '');
              return cleanedName === cleanedInput || cleanedName.includes(cleanedInput) || cleanedInput.includes(cleanedName);
            });
            if (foundNbr) neighborhoodId = foundNbr.id;
          }

          await supabase
            .from('complaints')
            .update({
              category: analysis.category || 'Diğer',
              ai_category: analysis.category,
              ai_department_id: departmentId,
              assigned_department_id: departmentId,
              neighborhood_id: neighborhoodId,
              priority: analysis.priority,
            })
            .eq('id', complaint.id);

          // Kullanıcıya Cevap Gönder
          const reply =
            analysis.auto_response ||
            `✅ Sayın ${name}, şikayetiniz başarıyla alınmıştır.\n\n` +
              `📋 Kategori: ${analysis.category}\n` +
              `🏢 Yönlendirilen Birim: ${analysis.department || 'İlgili Müdürlük'}\n\n` +
              `Takip numaranız: ${complaint.id.substring(0, 8).toUpperCase()}\n` +
              `Alanya Belediyesi olarak en kısa sürede dönüş yapacağız.`;

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

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Sen Alanya Belediyesi yapay zeka şikayet ve bilgi asistanısın. Antalya'nın Alanya ilçesinde görev yapıyorsun. Belediye Başkanı Osman Tarık Özçelik'tir.

Vatandaştan gelen şikayeti veya bilgi talebini analiz et ve SADECE JSON döndür:
{"category":"Kategori Adı","department":"Müdürlük Adı","neighborhood":"Şikayette geçen mahalle adı (Örn: Fığla, Mahmutlar, Oba, Konaklı vb.) veya null","priority":"yuksek|orta|dusuk","interaction_type":"sikayet|bilgi","send_pdfs":["dosya-adi.pdf"],"auto_response":"Vatandaşa kısa, nazik, profesyonel Türkçe cevap (3-4 cümle, emoji kullanabilirsin. Alanya Belediyesi olarak hitap et.)"}

Kategoriler: Yol / Altyapı, Temizlik / Atık, Park ve Bahçeler, İmar / Yapı, Çevre / Sıfır Atık, Zabıta / Düzen, Hayvan Hakları, Kültür / Sosyal, Kırsal Hizmetler, Kentsel Dönüşüm, Afet / Acil, Diğer.

Mevcut Müdürlükler: ${deptList}

BELEDİYE BİLGİ REHBERİ (EVLENDİRME İŞLEMLERİ):
${nikahDocsText}

BELEDİYE BİLGİ REHBERİ (RUHSAT VE İŞYERİ AÇMA İŞLEMLERİ):
${ruhsatDocsText}

BELEDİYE ETKİNLİK REHBERİ (2026 YILI ETKİNLİKLERİ & FESTİVALLERİ):
${eventsList}

GÖNDERİLEBİLİR PDF BELGELERİ:
${pdfCatalog}
 
KURALLAR:
- Nikah, evlilik, evlenme belgeleri vb. sorular için "Müdürlük Adı" olarak "Yazı İşleri Müdürlüğü" seç.
- İşyeri açma, ruhsat, sıhhi/gayrisıhhi müessese ruhsatı vb. sorular için "Müdürlük Adı" olarak "Ruhsat ve Denetim Müdürlüğü" seç.
- Vatandaş evlilik/nikah evrakları, yabancı evliliği, yaş sınırı, iddet müddeti gibi konuları sorursa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (EVLENDİRME İŞLEMLERİ)"ne göre akıl yürüterek tam, doğru ve detaylı bir auto_response hazırla.
- Vatandaş ruhsat başvurusu, gerekli evraklar veya ruhsat onay süreçleri hakkında soru sorarsa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (RUHSAT VE İŞYERİ AÇMA İŞLEMLERİ)" bilgilerine göre gerekli evrakları ve adımları açıklayan detaylı bir auto_response hazırla.
- Vatandaş belediyenin düzenlediği veya ev sahipliği yaptığı festivaller, konserler, fuarlar, etkinlikler, spor turnuvaları vb. hakkında soru sorarsa, yukarıdaki "BELEDİYE ETKİNLİK REHBERİ" bilgilerini kullanarak net, tarih ve detay içeren bir auto_response hazırla.
- "send_pdfs": Vatandaşın sorusuyla ilgili GÖNDERİLEBİLİR PDF BELGELERİ listesindeki belgelerin dosya adlarını bir dizi (array) olarak ekle. Birden fazla PDF ilgiliyse hepsini ekle. Hiçbir PDF ilgili değilse boş dizi [] döndür. Sadece yukarıdaki listede bulunan dosya adlarını kullan.
- "interaction_type": Vatandaş belediyeye bir sorun bildiriyorsa, belediyeden fiziksel bir işlem, denetim veya onarım yapmasını talep ediyorsa (örneğin çöpün alınması, yolun yapılması, gürültü yapılması, seyyar satıcı, kaçak yapı, sokak hayvanı vb.) "sikayet" seç. Vatandaş sadece bilgi almak istiyorsa, belge/evrak soruyorsa, evlilik yaş sınırı, ruhsat belgeleri, çalışma saatleri veya belediye etkinliklerinin/festivallerinin tarihleri gibi bilgi verici konuları soruyorsa "bilgi" seç.
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
