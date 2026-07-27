import "dotenv/config";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getAggregateVotesInPollMessage,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { decryptPollVote } from "@whiskeysockets/baileys/lib/Utils/process-message.js";
import { getKeyAuthor } from "@whiskeysockets/baileys/lib/Utils/generics.js";
import qrcode from "qrcode-terminal";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import pino from "pino";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

// ─── Config ────────────────────────────────────────────────────────
const logger = pino({ level: "warn" }); // Sadece uyarı ve hataları göster

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const nikahDocsPath = path.join(__dirname, "knowledge", "nikah-evraklari.md");
const eventsDocsPath = path.join(__dirname, "knowledge", "alanya-etkinlikleri-2026.md");
const pdfConfigPath = path.join(__dirname, "knowledge", "pdf-rehberi.json");
const pollSecretsPath = path.join(__dirname, "poll_secrets.json");

function savePollSecret(msgId, secret, pollId) {
  try {
    let secrets = {};
    if (fs.existsSync(pollSecretsPath)) {
      secrets = JSON.parse(fs.readFileSync(pollSecretsPath, "utf8"));
    }
    secrets[msgId] = { secret: Buffer.from(secret).toString("base64"), pollId };
    fs.writeFileSync(pollSecretsPath, JSON.stringify(secrets));
  } catch (e) {
    console.error("⚠️ savePollSecret hatası:", e.message);
  }
}

function getPollSecret(msgId) {
  try {
    if (fs.existsSync(pollSecretsPath)) {
      const secrets = JSON.parse(fs.readFileSync(pollSecretsPath, "utf8"));
      return secrets[msgId];
    }
  } catch (e) {}
  return null;
}

// Sesli başlayan şikayetleri kalıcı işaretle (çözüm/anket sonradan, hatta bot yeniden
// başladıktan sonra olduğu için hafıza yetmez; dosyaya yazıyoruz).
const voiceComplaintsPath = path.join(__dirname, "voice_complaints.json");
function markVoiceComplaint(complaintId) {
  try {
    if (!complaintId) return;
    let m = {};
    if (fs.existsSync(voiceComplaintsPath))
      m = JSON.parse(fs.readFileSync(voiceComplaintsPath, "utf8"));
    m[complaintId] = true;
    fs.writeFileSync(voiceComplaintsPath, JSON.stringify(m));
  } catch (e) {
    console.error("⚠️ markVoiceComplaint hatası:", e.message);
  }
}
function isVoiceComplaint(complaintId) {
  try {
    if (!complaintId) return false;
    if (fs.existsSync(voiceComplaintsPath)) {
      const m = JSON.parse(fs.readFileSync(voiceComplaintsPath, "utf8"));
      return !!m[complaintId];
    }
  } catch (e) {}
  return false;
}

// Türkçe/İngilizce vb. sayı sözcüklerini veya rakamı 1-5 puana çevir (sesli anket için).
function parseSurveyScore(raw) {
  if (!raw) return null;
  const t = String(raw)
    .toLowerCase()
    .replace(/[^\wçğıöşü ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const digit = t.match(/\b([1-5])\b/);
  if (digit) return parseInt(digit[1]);
  // Sözcükle puan (bir–beş / one–five): yalnızca KISA yanıtlarda (yanlış eşleşmeyi önler).
  // \b Türkçe karakterlerde (ş/ö/ü) çalışmadığından token eşitliği kullanılır.
  const toks = t.split(" ");
  if (toks.length <= 3) {
    const words = {
      bir: 1,
      iki: 2,
      üç: 3,
      uc: 3,
      dört: 4,
      dort: 4,
      beş: 5,
      bes: 5,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
    };
    for (const tok of toks) if (words[tok] !== undefined) return words[tok];
  }
  return null;
}

let nikahDocsText = "";
try {
  nikahDocsText = fs.readFileSync(nikahDocsPath, "utf-8");
} catch (e) {
  console.error("⚠️ Nikah evrakları kılavuzu yüklenemedi:", e.message);
}

let eventsDocsText = "";
try {
  eventsDocsText = fs.readFileSync(eventsDocsPath, "utf-8");
} catch (e) {
  console.error("⚠️ Etkinlik takvimi kılavuzu yüklenemedi:", e.message);
}

const ruhsatDocsPath = path.join(__dirname, "knowledge", "ruhsat-rehberi.md");
let ruhsatDocsText = "";
try {
  ruhsatDocsText = fs.readFileSync(ruhsatDocsPath, "utf-8");
} catch (e) {
  console.error("⚠️ Ruhsat rehberi yüklenemedi:", e.message);
}

// ─── PDF Belge Rehberi (Dinamik) ──────────────────────────────────
let pdfConfig = { pdfs: [] };
try {
  pdfConfig = JSON.parse(fs.readFileSync(pdfConfigPath, "utf-8"));
  console.log(`✅ ${pdfConfig.pdfs.length} PDF belgesi yapılandırması yüklendi.`);
} catch (e) {
  console.error("⚠️ PDF rehberi yüklenemedi:", e.message);
}

function buildPdfCatalogText() {
  if (!pdfConfig.pdfs || pdfConfig.pdfs.length === 0) return "";
  return pdfConfig.pdfs
    .map(
      (p, i) =>
        `${i + 1}. Dosya: "${p.dosya}" — ${p.goruntu_adi}\n   Konular: ${p.konular.join(", ")}\n   Açıklama: ${p.aciklama}\n   İlgili Müdürlük: ${p.ilgili_mudurluk}`,
    )
    .join("\n");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Botun kendi gönderdiği mesajların ID'lerini saklamak için önbellek (Sonsuz döngüyü önler)
const botMessageIds = new Set();
// Track IDs of messages sent by the bot to avoid processing them again
const recentStatusSent = new Map(); // key: 8‑char complaint ID, value: timestamp
const STATUS_DUPLICATE_TTL = 60 * 1000; // 1 minute
function shouldSendStatus(complaintId) {
  const now = Date.now();
  const key = complaintId.substring(0, 8).toUpperCase();
  const last = recentStatusSent.get(key);
  if (last && now - last < STATUS_DUPLICATE_TTL) {
    return false; // already sent recently
  }
  recentStatusSent.set(key, now);
  // purge old entries
  for (const [k, t] of recentStatusSent) {
    if (now - t > STATUS_DUPLICATE_TTL) recentStatusSent.delete(k);
  }
  return true;
}

function addBotMessageId(id) {
  if (!id) return;
  botMessageIds.add(id);
  if (botMessageIds.size > 1000) {
    const firstValue = botMessageIds.values().next().value;
    botMessageIds.delete(firstValue);
  }
}

/** Serbest formatlı telefonu WhatsApp JID'ine çevirir (TR numaraları için 90 öneki). */
function toWhatsappJid(phone) {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (raw.includes("@")) return raw;

  let clean = raw.replace(/\D/g, "");
  if (clean.startsWith("00")) clean = clean.substring(2);
  if (clean.startsWith("0") && clean.length === 11) clean = "90" + clean.substring(1);
  if (clean.length === 10 && clean.startsWith("5")) clean = "90" + clean;
  if (clean.length < 10) return null;

  return `${clean}@s.whatsapp.net`;
}

// Bot ayarlarını json dosyasından yükler
function getBotSettings() {
  const defaults = {
    selfChatOnly: true,
    koksalChatOnly: false,
    slaLimitHours: 120,
    crisisLimitHours: 1,
    crisisLimitCount: 4,
  };
  try {
    const settingsPath = path.join(__dirname, "bot-settings.json");
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, "utf-8");
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
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Reverse Geocoding (Koordinat → Detaylı Adres) ─────────────────
// Konum atıldığında sokak/cadde/mevki bilgisini otomatik çıkarır.
// GOOGLE_MAPS_API_KEY tanımlıysa Google, değilse ücretsiz OpenStreetMap Nominatim kullanılır.
async function reverseGeocode(lat, lng) {
  if (lat === null || lng === null || lat === undefined || lng === undefined) return null;
  try {
    // 1) Google Maps (anahtar varsa — daha doğru sonuç)
    if (process.env.GOOGLE_MAPS_API_KEY) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=tr&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const best = data.results && data.results[0];
        if (best) {
          const get = (type) => {
            const c = best.address_components.find((x) => x.types.includes(type));
            return c ? c.long_name : null;
          };
          const road = get("route");
          const mahalle =
            get("neighborhood") || get("administrative_area_level_4") || get("sublocality");
          const semt = get("administrative_area_level_2") || get("locality");
          const short = [road, mahalle, semt].filter(Boolean).join(", ");
          return { full: best.formatted_address, short: short || best.formatted_address };
        }
      }
    }

    // 2) OpenStreetMap Nominatim (ücretsiz, anahtar gerektirmez)
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=tr&zoom=18`;
    const res = await fetch(url, {
      headers: { "User-Agent": "AlanyaBelediyeBot/1.0 (belediye sikayet sistemi)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.address)
      return data && data.display_name
        ? { full: data.display_name, short: data.display_name }
        : null;
    const a = data.address;
    const road = a.road || a.pedestrian || a.footway || a.residential;
    const mahalle = a.neighbourhood || a.quarter || a.suburb || a.city_district;
    const semt = a.town || a.city || a.municipality || a.county;
    const short = [road, mahalle, semt].filter(Boolean).join(", ");
    return { full: data.display_name, short: short || data.display_name };
  } catch (e) {
    console.error("   ⚠️ Reverse geocode hatası:", e.message);
    return null;
  }
}

// ─── Türkçe metin normalizasyonu (mahalle eşleştirme için) ─────────
function normalizeTr(s) {
  return (s || "")
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c")
    .toLowerCase()
    .replace(/mahallesi|mahalle|mah\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Müdürlük adını toleranslı eşleştir (birebir olmasa da normalize edilmiş karşılaştırma)
function matchDepartment(aiName) {
  if (!aiName) return null;
  const target = normalizeTr(aiName)
    .replace(/mudurlugu|müdürlüğü|birimi/g, "")
    .trim();
  if (!target) return null;
  // 1) Tam (normalize) eşleşme
  let found = departmentsCache.find(
    (d) =>
      normalizeTr(d.name)
        .replace(/mudurlugu|müdürlüğü|birimi/g, "")
        .trim() === target,
  );
  // 2) İçeren eşleşme
  if (!found)
    found = departmentsCache.find((d) => {
      const dn = normalizeTr(d.name)
        .replace(/mudurlugu|müdürlüğü|birimi/g, "")
        .trim();
      return dn.includes(target) || target.includes(dn);
    });
  return found || null;
}

// Verilen metin içinde bilinen bir mahalle adı geçiyor mu? (kelime bazlı, en uzun eşleşme öncelikli)
function matchNeighborhood(rawText) {
  if (!rawText) return null;
  const norm = normalizeTr(rawText);
  if (!norm) return null;
  let best = null;
  let bestLen = 0;
  for (const n of neighborhoodsCache) {
    const nm = normalizeTr(n.name);
    if (!nm) continue;
    // "oba" gibi kısa adların başka kelimenin içinde yanlış eşleşmesini önlemek için kelime sınırı
    const re = new RegExp(`(^|[^a-z0-9])${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    if (re.test(norm) && nm.length > bestLen) {
      best = n;
      bestLen = nm.length;
    }
  }
  return best;
}

// ─── Dil (Localization) yardımcıları ──────────────────────────────
// Şikayet akışındaki sabit sistem mesajlarını vatandaşın diline göre üretir.
function normLang(lang) {
  const l = (lang || "tr").toLowerCase().trim();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("de") || l.includes("deutsch") || l.includes("german")) return "de";
  if (l.startsWith("ru") || l.includes("russ") || l.includes("рус")) return "ru";
  return "tr";
}

function getBotPhone() {
  const sock = global.currentSock;
  if (sock?.user?.id) {
    const id = sock.user.id.split(":")[0].split("@")[0];
    if (!id.includes("lid") && id.length > 5) {
      return id;
    }
  }
  return null;
}

// WhatsApp monospace (kod) biçimi: üç ters tırnak. Takip numaralarını bu biçimde
// göstermek, vatandaşın numarayı kolayca seçip kopyalayabilmesi için standart yöntemdir.
// Ayrıca mobilde kopyalama zorluğunu gidermek için yanına doğrudan tıklanabilir wa.me sorgu linki ekler.
function mono(s) {
  const botPhone = getBotPhone();
  if (botPhone) {
    return "```" + s + "``` (Sorgula/Query: https://wa.me/" + botPhone + "?text=" + s + ")";
  }
  return "```" + s + "```";
}

// Sesli gelen vatandaşa gösterilecek metinde "yazınız" ifadelerini "ses kaydı gönderin"e çevir.
// (Yazamayan/görme engelli kişi için doğru yönlendirme.)
function voiceify(text, lang) {
  if (!text) return text;
  const L = normLang(lang);
  let t = text;
  if (L === "tr") {
    t = t
      .replace(
        /rakam olarak yaz[ıi]p g[öo]nderebilirsiniz/gi,
        "rakamı sesli olarak söyleyebilirsiniz",
      )
      .replace(/yaz[ıi]p g[öo]nderebilirsiniz/gi, "sesli olarak söyleyebilirsiniz")
      .replace(/rakam yaz[ıi]n[ıi]z/gi, "bir rakamı sesli söyleyiniz")
      .replace(/yazar mısınız/gi, "ses kaydıyla anlatır mısınız")
      .replace(/yazabilirsiniz/gi, "ses kaydı olarak gönderebilirsiniz")
      .replace(/yazman[ıi]z yeterli(dir)?/gi, "ses kaydı göndermeniz yeterli")
      .replace(/yazarak/gi, "ses kaydı göndererek")
      .replace(/yaz[ıi]n[ıi]z/gi, "ses kaydı olarak gönderiniz")
      .replace(/\byaz[ıi]n\b/gi, "ses kaydı olarak gönderin");
  } else if (L === "en") {
    t = t
      .replace(/you can type/gi, "you can send a voice message")
      .replace(/\btype\b/gi, "send by voice message")
      .replace(/\bwrite\b/gi, "send by voice message");
  } else if (L === "de") {
    t = t
      .replace(/schreiben Sie/gi, "senden Sie eine Sprachnachricht")
      .replace(/\bschreiben\b/gi, "per Sprachnachricht senden");
  } else if (L === "ru") {
    t = t
      .replace(/напишите/gi, "отправьте голосовое сообщение")
      .replace(/введите/gi, "отправьте голосовое сообщение");
  }
  return t;
}

// Metni sesli cevap için sadeleştir (link/işaret temizle, kısalt) ve OpenAI TTS ile
// WhatsApp sesli mesajı (OGG/Opus) üret. Hata olursa null döner (yazılı cevap yine gider).
async function textToSpeech(text, lang) {
  try {
    if (!openai || !text) return null;
    const settings = getBotSettings();
    const voice = settings.voiceReplyVoice || "nova";
    let t = String(text)
      .replace(/https?:\/\/\S+/g, "") // linkleri okuma
      .replace(/[*_`~#>]/g, "") // markdown işaretleri
      .replace(/\p{Extended_Pictographic}/gu, "") // TÜM emojiler (Unicode-güvenli)
      .replace(/[️⃣‍]/g, "") // varyasyon seçici / keycap / ZWJ
      .replace(/[\uD800-\uDFFF]/g, "") // yarım surrogate (JSON'u bozardı)
      .replace(/\n{2,}/g, ". ")
      .replace(/\s+/g, " ")
      .trim();
    if (!t) return null;
    if (t.length > 800) t = t.slice(0, 800);
    const resp = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: t,
      response_format: "opus",
    });
    return Buffer.from(await resp.arrayBuffer());
  } catch (e) {
    console.error("   ⚠️ TTS (metinden ses) hatası:", e.message);
    return null;
  }
}

// Verilen metni bir JID'ye sesli mesaj (voice note) olarak gönder.
async function sendVoiceNote(sock, jid, text, lang) {
  try {
    if (getBotSettings().voiceReplyEnabled === false) return;
    const buf = await textToSpeech(text, lang);
    if (!buf) return;
    const v = await sock.sendMessage(jid, {
      audio: buf,
      mimetype: "audio/ogg; codecs=opus",
      ptt: true,
    });
    if (v?.key?.id) addBotMessageId(v.key.id);
    console.log("   🔊 Sesli mesaj gönderildi.");
  } catch (e) {
    console.error("   ⚠️ Sesli mesaj gönderilemedi:", e.message);
  }
}

// Mesaj sesli geldiyse, verilen cevabı sesli mesaj olarak da gönder (yazılı zaten gitti).
async function speakIfVoice(sock, msg, text, lang, cameFromVoice) {
  if (!cameFromVoice) return;
  await sendVoiceNote(sock, msg.key.remoteJid, text, lang);
}

// Mahalle sorarken eklenen "detaylı adres / konum" ipucu
function msgLocationHint(lang) {
  return {
    tr: `\n\n🏠 Dilerseniz mahalleyle birlikte *sokak/cadde ve bina no* gibi detayları da yazabilirsiniz (örn: _Saray Mahallesi, Barbaros Caddesi No:5_).\n\n📍 _Konum bilginizi paylaşarak da yerinizi bildirebilirsiniz._\n\n↩️ _Bu şikayetten vazgeçmek isterseniz *iptal* yazabilirsiniz._`,
    en: `\n\n🏠 You may also add *street/avenue and building no* along with the neighbourhood (e.g. _Saray District, Barbaros Avenue No:5_).\n\n📍 _You can also share your location to report where you are._\n\n↩️ _If you want to cancel this complaint, you can type *iptal*._`,
    de: `\n\n🏠 Sie können neben dem Viertel auch *Straße und Hausnummer* angeben (z.B. _Saray Viertel, Barbaros Straße Nr:5_).\n\n📍 _Sie können auch Ihren Standort teilen, um Ihre Position mitzuteilen._\n\n↩️ _Wenn Sie dieses Anliegen abbrechen möchten, schreiben Sie *iptal*._`,
    ru: `\n\n🏠 Вы также можете указать *улицу и номер дома* вместе с районом (напр. _район Сарай, ул. Барбарос №5_).\n\n📍 _Вы также можете отправить свою геолокацию._\n\n↩️ _Если хотите отменить эту жалобу, напишите *iptal*._`,
  }[normLang(lang)];
}

// Mahalle sorma varsayılan metni (AI auto_response boşsa)
function msgAskNeighborhood(lang, name) {
  return {
    tr: `Sayın ${name}, şikayetinizi doğru mahalle ile eşleştirebilmemiz için lütfen mahalle adını yazınız.`,
    en: `Dear ${name}, please write the neighbourhood name so we can match your complaint to the correct area.`,
    de: `Sehr geehrte(r) ${name}, bitte geben Sie den Namen des Viertels an, damit wir Ihr Anliegen dem richtigen Gebiet zuordnen können.`,
    ru: `Уважаемый(ая) ${name}, пожалуйста, укажите название района, чтобы мы направили вашу жалобу в нужный участок.`,
  }[normLang(lang)];
}

// Bekleyen bir şikayet konum/mahalle beklerken vatandaş konum yerine
// yeni bir şey (çoğunlukla yeni bir şikayet) yazarsa gösterilecek yönlendirme.
function msgPendingLocationGuard(lang, pendingText) {
  const short =
    pendingText && pendingText.length > 60
      ? pendingText.slice(0, 60).trim() + "…"
      : pendingText || "";
  const q = short ? ` (“${short}”)` : "";
  return {
    tr: `⚠️ Sayın vatandaşımız, tamamlanmayı bekleyen bir şikayetiniz var${q} ve bunu kaydedebilmemiz için *mahalle/konum* bilgisi gerekiyor.\n\nLütfen önce bu şikayetin *mahalle adını yazın* veya 📍 *konumunuzu paylaşın*.\n\nBu şikayetten vazgeçip başka bir konuya geçmek isterseniz *iptal* yazmanız yeterlidir.`,
    en: `⚠️ You have a complaint waiting to be completed${q} and we still need its *neighbourhood/location* to save it.\n\nPlease first *type the neighbourhood name* or 📍 *share your location*.\n\nIf you want to drop this complaint and move on to something else, simply type *iptal* (cancel).`,
    de: `⚠️ Sie haben ein noch offenes Anliegen${q}, und wir benötigen dafür das *Viertel/den Standort*.\n\nBitte geben Sie zuerst den *Namen des Viertels* an oder 📍 *teilen Sie Ihren Standort*.\n\nWenn Sie dieses Anliegen verwerfen und etwas anderes beginnen möchten, schreiben Sie einfach *iptal* (abbrechen).`,
    ru: `⚠️ У вас есть незавершённая жалоба${q}, и для её сохранения нам нужен *район/геолокация*.\n\nПожалуйста, сначала *укажите название района* или 📍 *отправьте свою геолокацию*.\n\nЕсли хотите отказаться от этой жалобы и перейти к другому вопросу, просто напишите *iptal* (отмена).`,
  }[normLang(lang)];
}

// Konum alındıktan sonra şikayet detayı isteme
function msgAskDetailsAfterLocation(lang, nbrName) {
  const area = nbrName ? `${nbrName}` : null;
  return {
    tr: `📍 Gönderdiğiniz konuma göre ${area ? area + " Mahallesi" : "Alanya"} sınırlarında olduğunuzu tespit ettik.\n\nLütfen bu bölgedeki şikayetinizin/talebinizin detaylarını yazar mısınız?`,
    en: `📍 Based on your location, we detected that you are within ${area ? area + " District" : "Alanya"}.\n\nCould you please describe the details of your complaint/request in this area?`,
    de: `📍 Anhand Ihres Standorts haben wir festgestellt, dass Sie sich in ${area ? area + " Viertel" : "Alanya"} befinden.\n\nKönnten Sie bitte die Einzelheiten Ihres Anliegens in diesem Gebiet beschreiben?`,
    ru: `📍 По вашей геолокации мы определили, что вы находитесь в районе ${area ? area : "Аланья"}.\n\nПожалуйста, опишите детали вашей жалобы/обращения в этом районе.`,
  }[normLang(lang)];
}

// Konum ile şikayet oluşturulduğunda gönderilen onay mesajı
function msgLocationConfirmation(
  lang,
  { name, nbrName, category, department, addressShort, trackingNo },
) {
  const L = normLang(lang);
  const rep = {
    tr: `💬 Gerçek bir temsilci ile görüşmek isterseniz aşağıdaki linke tıklayabilirsiniz:\nhttps://wa.me/905362206204?text=temsilci`,
    en: `💬 If you would like to speak with a real representative, you can click the link below:\nhttps://wa.me/905362206204?text=representative`,
    de: `💬 Wenn Sie mit einem echten Mitarbeiter sprechen möchten, klicken Sie bitte auf den folgenden Link:\nhttps://wa.me/905362206204?text=vertreter`,
    ru: `💬 Если хотите поговорить с реальным представителем, нажмите на ссылку ниже:\nhttps://wa.me/905362206204?text=representative`,
  }[L];
  const head = {
    tr: `✅ Sayın ${name}, gönderdiğiniz konuma göre şikayetiniz ${nbrName ? nbrName + " Mahallesi" : "ilgili mahalle"} olarak başarıyla alınmıştır.`,
    en: `✅ Dear ${name}, based on your location your complaint has been successfully received for ${nbrName ? nbrName + " District" : "the relevant area"}.`,
    de: `✅ Sehr geehrte(r) ${name}, anhand Ihres Standorts wurde Ihr Anliegen für ${nbrName ? nbrName + " Viertel" : "das betreffende Gebiet"} erfolgreich entgegengenommen.`,
    ru: `✅ Уважаемый(ая) ${name}, по вашей геолокации ваша жалоба успешно принята для района ${nbrName ? nbrName : "соответствующего"}.`,
  }[L];
  const labels = {
    tr: { cat: "Kategori", dep: "Birim", addr: "Adres", track: "Takip numaranız" },
    en: { cat: "Category", dep: "Department", addr: "Address", track: "Tracking number" },
    de: { cat: "Kategorie", dep: "Abteilung", addr: "Adresse", track: "Auftragsnummer" },
    ru: { cat: "Категория", dep: "Отдел", addr: "Адрес", track: "Номер обращения" },
  }[L];
  return (
    `${head}\n\n` +
    `📋 ${labels.cat}: ${category}\n` +
    `🏢 ${labels.dep}: ${department}\n` +
    (addressShort ? `📍 ${labels.addr}: ${addressShort}\n` : "") +
    `${labels.track}: ${mono(trackingNo)}\n\n` +
    rep
  );
}

// Bir tarihten bu yana geçen süreyi dile göre "X önce" biçiminde döndürür.
function formatAgo(createdAtIso, lang) {
  const L = normLang(lang);
  const diffMs = Math.max(0, Date.now() - new Date(createdAtIso).getTime());
  const mins = Math.round(diffMs / 60000);
  const hours = Math.round(diffMs / 3600000);
  const days = Math.round(diffMs / 86400000);
  let n, unit;
  if (days >= 1) {
    n = days;
    unit = "day";
  } else if (hours >= 1) {
    n = hours;
    unit = "hour";
  } else {
    n = Math.max(1, mins);
    unit = "min";
  }
  const T =
    {
      tr: { min: "dakika", hour: "saat", day: "gün", fmt: (v, u) => `${v} ${u} önce` },
      en: {
        min: n === 1 ? "minute" : "minutes",
        hour: n === 1 ? "hour" : "hours",
        day: n === 1 ? "day" : "days",
        fmt: (v, u) => `${v} ${u} ago`,
      },
      de: {
        min: n === 1 ? "Minute" : "Minuten",
        hour: n === 1 ? "Stunde" : "Stunden",
        day: n === 1 ? "Tag" : "Tagen",
        fmt: (v, u) => `vor ${v} ${u}`,
      },
      ru: { min: "мин.", hour: "ч.", day: "дн.", fmt: (v, u) => `${v} ${u} назад` },
    }[L] || null;
  const t = T || { min: "dakika", hour: "saat", day: "gün", fmt: (v, u) => `${v} ${u} önce` };
  return t.fmt(n, t[unit]);
}

// Aynı mahalle + kategoride, kısa süre önce açılmış benzer bir şikayet varsa
// vatandaşa "zaten bildirilmiş / çalışılıyor" bilgisini veren mesaj.
function msgDuplicateComplaint(lang, { nbrName, category, agoText, trackingNo }) {
  const area = nbrName ? nbrName : null;
  return {
    tr: `ℹ️ Sayın vatandaşımız, ${area ? `*${area} Mahallesi* için ` : ""}bu konu (*${category}*) *${agoText}* başka bir başvuru ile tarafımıza zaten iletilmiş ve ilgili birim tarafından *üzerinde çalışılmaktadır*.\n\n📌 Mevcut kaydın takip numarası: ${mono(trackingNo)}\n\nBu nedenle mükerrer bir kayıt oluşturulmadı. Bildiriminiz için teşekkür eder, sorunu en kısa sürede çözmek için çalıştığımızı belirtmek isteriz. 🙏`,
    en: `ℹ️ Dear citizen, ${area ? `for *${area} District* ` : ""}this matter (*${category}*) was already reported to us *${agoText}* by another request and the relevant department is *already working on it*.\n\n📌 Tracking number of the existing record: ${mono(trackingNo)}\n\nTherefore no duplicate record was created. Thank you for reporting; we are working to resolve it as soon as possible. 🙏`,
    de: `ℹ️ Sehr geehrte(r) Bürger(in), ${area ? `für *${area}* ` : ""}dieses Anliegen (*${category}*) wurde uns bereits *${agoText}* durch eine andere Meldung mitgeteilt und die zuständige Abteilung *arbeitet bereits daran*.\n\n📌 Vorgangsnummer des bestehenden Eintrags: ${mono(trackingNo)}\n\nDaher wurde kein doppelter Eintrag erstellt. Vielen Dank für Ihre Meldung; wir arbeiten an einer schnellstmöglichen Lösung. 🙏`,
    ru: `ℹ️ Уважаемый(ая) гражданин(ка), ${area ? `по району *${area}* ` : ""}это обращение (*${category}*) уже поступило к нам *${agoText}* от другого заявителя, и соответствующий отдел *уже работает над ним*.\n\n📌 Номер существующего обращения: ${mono(trackingNo)}\n\nПоэтому повторная запись не создавалась. Благодарим за обращение; мы работаем над скорейшим решением. 🙏`,
  }[normLang(lang)];
}

// Tarih/saati vatandaşın diline ve Alanya (Europe/Istanbul) saatine göre biçimlendir.
function formatDateTimeLocal(iso, lang) {
  try {
    const locale =
      { tr: "tr-TR", en: "en-GB", de: "de-DE", ru: "ru-RU" }[normLang(lang)] || "tr-TR";
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Istanbul",
    }).format(new Date(iso));
  } catch (e) {
    return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  }
}

// Şikayet durumunun vatandaşa gösterilecek, dile göre etiketi.
function statusLabelML(status, lang) {
  const L = normLang(lang);
  const map = {
    yeni: {
      tr: "Yeni (Alındı)",
      en: "New (Received)",
      de: "Neu (Eingegangen)",
      ru: "Новая (принята)",
    },
    incelemede: { tr: "İncelemede", en: "Under Review", de: "In Prüfung", ru: "На рассмотрении" },
    personele_atandi: {
      tr: "Personele Atandı",
      en: "Assigned to Staff",
      de: "Mitarbeiter zugewiesen",
      ru: "Назначена сотруднику",
    },
    devam_ediyor: { tr: "Çözüm Sürüyor", en: "In Progress", de: "In Bearbeitung", ru: "В работе" },
    vatandas_yaniti_bekleniyor: {
      tr: "Sizden Yanıt Bekleniyor",
      en: "Awaiting Your Response",
      de: "Ihre Antwort erforderlich",
      ru: "Ожидается ваш ответ",
    },
    cozuldu: { tr: "Çözüldü", en: "Resolved", de: "Gelöst", ru: "Решена" },
    reddedildi: { tr: "Reddedildi", en: "Rejected", de: "Abgelehnt", ru: "Отклонена" },
  };
  const row = map[status] || { tr: status, en: status, de: status, ru: status };
  return row[L] || row.tr;
}

// Durum sorgusunda takip numarası verilmediğinde numara isteyen mesaj.
function msgAskTrackingNo(lang) {
  return {
    tr: `🔎 Şikayetinizin durumunu sorgulamak için lütfen *takip numaranızı* yazınız.\n\nÖrnek: _durum 1A2B3C4D_\n(Takip numaranız, şikayetinizi aldığımızda gönderdiğimiz mesajda yer alır.)`,
    en: `🔎 To check your complaint status, please send your *tracking number*.\n\nExample: _status 1A2B3C4D_\n(Your tracking number is in the confirmation message we sent when your complaint was received.)`,
    de: `🔎 Um den Status Ihres Anliegens abzufragen, senden Sie bitte Ihre *Vorgangsnummer*.\n\nBeispiel: _durum 1A2B3C4D_\n(Ihre Vorgangsnummer steht in der Bestätigung, die wir beim Eingang gesendet haben.)`,
    ru: `🔎 Чтобы узнать статус обращения, отправьте, пожалуйста, ваш *номер обращения*.\n\nПример: _durum 1A2B3C4D_\n(Номер указан в сообщении-подтверждении, отправленном при приёме обращения.)`,
  }[normLang(lang)];
}

// Verilen takip numarasıyla kayıt bulunamadığında gösterilecek mesaj.
function msgStatusNotFound(lang, code) {
  return {
    tr: `❓ *${code}* numaralı bir şikayet kaydı bu numaranıza ait olarak bulunamadı.\n\nLütfen takip numaranızı kontrol edip tekrar deneyin. Yardıma ihtiyacınız olursa *temsilci* yazarak bir yetkiliyle görüşebilirsiniz.`,
    en: `❓ No complaint with tracking number *${code}* was found for your phone.\n\nPlease check the number and try again. If you need help, type *temsilci* to reach a representative.`,
    de: `❓ Kein Anliegen mit der Vorgangsnummer *${code}* für Ihre Nummer gefunden.\n\nBitte prüfen Sie die Nummer und versuchen Sie es erneut. Für Hilfe schreiben Sie *temsilci*.`,
    ru: `❓ Обращение с номером *${code}* для вашего телефона не найдено.\n\nПроверьте номер и попробуйте снова. Если нужна помощь, напишите *temsilci*.`,
  }[normLang(lang)];
}

// Şikayet durum sorgusuna verilecek ayrıntılı yanıt.
function msgComplaintStatus(
  lang,
  {
    trackingNo,
    statusLabel,
    category,
    createdText,
    resolvedText,
    nbrName,
    deptName,
    subject,
    resolved,
  },
) {
  const L = normLang(lang);
  const emoji = resolved ? "✅" : "🔎";
  const t =
    {
      tr: {
        head: `${emoji} *Şikayet Durum Bilgisi*`,
        track: "Takip No",
        st: "Durum",
        subj: "Konu",
        cat: "Kategori",
        nbr: "Mahalle",
        dep: "İlgili Birim",
        crt: "Kayıt Tarihi",
        rsv: "Çözülme Tarihi",
        foot: resolved
          ? "Bu şikayet çözüme kavuşturulmuştur. İlginiz için teşekkür ederiz. 🙏"
          : "Şikayetiniz ilgili birim tarafından takip edilmektedir. En kısa sürede tarafınıza dönüş yapılacaktır. 🙏",
      },
      en: {
        head: `${emoji} *Complaint Status*`,
        track: "Tracking No",
        st: "Status",
        subj: "Subject",
        cat: "Category",
        nbr: "District",
        dep: "Department",
        crt: "Created",
        rsv: "Resolved on",
        foot: resolved
          ? "This complaint has been resolved. Thank you. 🙏"
          : "Your complaint is being followed up by the relevant department. We will get back to you as soon as possible. 🙏",
      },
      de: {
        head: `${emoji} *Status des Anliegens*`,
        track: "Vorgangsnr.",
        st: "Status",
        subj: "Betreff",
        cat: "Kategorie",
        nbr: "Viertel",
        dep: "Abteilung",
        crt: "Erstellt",
        rsv: "Gelöst am",
        foot: resolved
          ? "Dieses Anliegen wurde gelöst. Vielen Dank. 🙏"
          : "Ihr Anliegen wird von der zuständigen Abteilung bearbeitet. Wir melden uns schnellstmöglich. 🙏",
      },
      ru: {
        head: `${emoji} *Статус обращения*`,
        track: "Номер",
        st: "Статус",
        subj: "Тема",
        cat: "Категория",
        nbr: "Район",
        dep: "Отдел",
        crt: "Создано",
        rsv: "Решено",
        foot: resolved
          ? "Обращение решено. Благодарим вас. 🙏"
          : "Ваше обращение обрабатывается соответствующим отделом. Мы свяжемся с вами как можно скорее. 🙏",
      },
    }[L] || null;
  const lbl = t || {
    head: "🔎 Şikayet Durum Bilgisi",
    track: "Takip No",
    st: "Durum",
    subj: "Konu",
    cat: "Kategori",
    nbr: "Mahalle",
    dep: "İlgili Birim",
    crt: "Kayıt Tarihi",
    rsv: "Çözülme Tarihi",
    foot: "",
  };
  let out = `${lbl.head}\n\n`;
  out += `📌 ${lbl.track}: ${mono(trackingNo)}\n`;
  out += `📊 ${lbl.st}: *${statusLabel}*\n`;
  if (subject) out += `📝 ${lbl.subj}: ${subject}\n`;
  if (category) out += `🏷️ ${lbl.cat}: ${category}\n`;
  if (nbrName) out += `📍 ${lbl.nbr}: ${nbrName}\n`;
  if (deptName) out += `🏢 ${lbl.dep}: ${deptName}\n`;
  if (createdText) out += `🕒 ${lbl.crt}: ${createdText}\n`;
  if (resolved && resolvedText) out += `✅ ${lbl.rsv}: ${resolvedText}\n`;
  out += `\n${lbl.foot}`;
  return out;
}

// ─── Departments, Neighborhoods & Events Cache ─────────────────────
const pendingComplaints = new Map();
const pendingSurveys = new Map(); // key: phone, value: complaintId
const pendingNameRequests = new Map(); // key: phone, value: pending message state
const messageQueues = new Map(); // key: remoteJid, value: Promise
let departmentsCache = [];
let neighborhoodsCache = [];
let eventsCache = [];

// İsim ve soyismin geçerli (en az iki kelime, örn: Orhan Güler) olup olmadığını kontrol et
function isFullName(str) {
  if (!str || typeof str !== "string") return false;
  const cleaned = str.trim();
  if (cleaned.toLowerCase() === "vatandaş" || cleaned.length < 3) return false;
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  return words.length >= 2;
}

// LID (Gizlenmiş WhatsApp ID) değerini gerçek telefon numarasına eşle
function resolveLidToPhone(lid) {
  if (!lid) return lid;
  const KNOWN_LID_MAP = {
    16690377154811: "905543662725", // Orhan Güler
    78902861029557: "905454597000", // Köksal Torgay
  };
  if (KNOWN_LID_MAP[lid]) {
    return KNOWN_LID_MAP[lid];
  }
  try {
    const filePath = path.join(__dirname, ".baileys_auth", `lid-mapping-${lid}_reverse.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8").trim();
      const parsed = content.replace(/['"]/g, "");
      if (parsed && parsed.length >= 10 && parsed.length <= 15) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("⚠️ LID reverse mapping okuma hatası:", e.message);
  }
  return lid;
}

// Vatandaşın daha önceki kayıtlarında geçerli Ad-Soyad var mı kontrol et
async function getKnownCitizenName(phone) {
  try {
    const { data } = await supabase
      .from("complaints")
      .select("citizen_name")
      .eq("citizen_phone", phone)
      .not("citizen_name", "eq", "Vatandaş")
      .order("created_at", { ascending: false })
      .limit(10);

    if (data && data.length > 0) {
      for (const row of data) {
        if (row?.citizen_name && isFullName(row.citizen_name)) {
          return row.citizen_name.trim();
        }
      }
    }
  } catch (e) {}
  return null;
}

// Gerçek remoteJid'leri tutan bellek (Webhook 400 hatalarını önlemek için)
global.activeJids = new Map();
async function loadInitialData(sock) {
  // Geriye dönük LID numarası güncelleyici (1669... -> Gerçek Telefon Numarası)
  try {
    const { data: oldRows } = await supabase.from("complaints").select("id, citizen_phone");

    const lidRows = (oldRows || []).filter((r) => r.citizen_phone && r.citizen_phone.length >= 13);
    if (lidRows.length > 0) {
      let updatedCount = 0;
      for (const row of lidRows) {
        const mapped = resolveLidToPhone(row.citizen_phone);
        if (mapped && mapped !== row.citizen_phone) {
          await supabase.from("complaints").update({ citizen_phone: mapped }).eq("id", row.id);
          updatedCount++;
        }
      }
      if (updatedCount > 0) {
        console.log(
          `   🔄 Geriye dönük: ${updatedCount} adet LID kaydı gerçek telefon numaralarına güncellendi!`,
        );
      }
    }
  } catch (e) {
    console.error("⚠️ LID güncelleme hatası:", e.message);
  }

  // Müdürlükleri yükle
  const { data: depts, error: deptError } = await supabase.from("departments").select("id, name");
  if (deptError) {
    console.error("⚠️ Müdürlükler yüklenemedi:", deptError.message);
  } else {
    departmentsCache = depts || [];
    console.log(`✅ ${departmentsCache.length} müdürlük yüklendi.`);
  }

  // Mahalleleri yükle
  const { data: nbrs, error: nbrError } = await supabase
    .from("neighborhoods")
    .select("id, name, mukhtar_name, mukhtar_phone, latitude, longitude");
  if (nbrError) {
    console.error("⚠️ Mahalleler yüklenemedi:", nbrError.message);
  } else {
    neighborhoodsCache = nbrs || [];
    console.log(`✅ ${neighborhoodsCache.length} mahalle yüklendi.`);
  }

  // Etkinlikleri yükle
  const { data: evts, error: evtError } = await supabase
    .from("events")
    .select("title, start_date, end_date, description");
  if (evtError) {
    console.error("⚠️ Etkinlikler yüklenemedi:", evtError.message);
  } else {
    eventsCache = evts || [];
    console.log(`✅ ${eventsCache.length} etkinlik yüklendi.`);
  }
}

function getLocalizedMessages(lang) {
  const l = (lang || "tr").toLowerCase().trim();
  if (l === "en" || l === "english") {
    return {
      statusTitle: "✅ *Alanya Municipality Status Update*",
      infoTitle: "❓ *Alanya Municipality — Information Request*",
      generalTitle: "*Alanya Municipality Update*",
      dear: "Dear",
      trackingNo: "Tracking No",
      neighborhood: "Neighborhood",
      complaint: "Complaint",
      statusResolved: "RESOLVED",
      statusUpdated: "UPDATED",
      resolvedDesc:
        "Your complaint has been successfully resolved. As Alanya Municipality, we continuously improve our services.",
      greeting: "As Alanya Municipality, we wish you a good day. 🌟",
      infoBody: "*Municipality Question:*",
      infoFooter:
        'Please reply to this message to provide information. Your response will be added to the same complaint record.\n\nIf you want to report a new complaint, you can type "new complaint".',
      infoDesc: "*Municipality Explanation:*",
      surveyTitle: "📊 *Alanya Municipality Satisfaction Survey*",
      surveyBody:
        "It is very important for us that you evaluate the resolution process of your complaint! Please rate our service quality between *1 and 5*:\n\n1️⃣ Very Bad\n2️⃣ Bad\n3️⃣ Average\n4️⃣ Good\n5️⃣ Very Good\n\n*You can send your rating simply as a number (e.g. 4)*",
      surveyThanks:
        "Thank you very much for your evaluation! As Alanya Municipality, your feedback is very valuable to us. We wish you a good day. 🙏🌸",
      surveyWarn:
        "Please write and send only a number between 1 and 5 to evaluate our service (e.g. 4).",
    };
  } else if (l === "de" || l === "german" || l === "deutsch") {
    return {
      statusTitle: "✅ *Stadtverwaltung Alanya Status-Update*",
      infoTitle: "❓ *Stadtverwaltung Alanya — Informationsanfrage*",
      generalTitle: "*Stadtverwaltung Alanya Update*",
      dear: "Sehr geehrte(r)",
      trackingNo: "Auftragsnummer",
      neighborhood: "Viertel",
      complaint: "Beschwerde",
      statusResolved: "GELÖST",
      statusUpdated: "AKTUALISIERT",
      resolvedDesc:
        "Ihre Beschwerde wurde erfolgreich gelöst. Als Stadtverwaltung Alanya verbessern wir unsere Dienstleistungen kontinuierlich.",
      greeting: "Als Stadtverwaltung Alanya wünschen wir Ihnen einen schönen Tag. 🌟",
      infoBody: "*Frage der Stadtverwaltung:*",
      infoFooter:
        'Bitte antworten Sie auf diese Nachricht, um Informationen bereitzustellen. Ihre Antwort wird demselben Beschwerdedatensatz hinzugefügt.\n\nWenn Sie eine neue Beschwerde melden möchten, können Sie "neue beschwerde" eingeben.',
      infoDesc: "*Erklärung der Stadtverwaltung:*",
      surveyTitle: "📊 *Stadtverwaltung Alanya Zufriedenheitsumfrage*",
      surveyBody:
        "Es ist uns sehr wichtig, dass Sie den Lösungsprozess Ihrer Beschwerde bewerten! Bitte bewerten Sie unsere Servicequalität zwischen *1 und 5*:\n\n1️⃣ Sehr schlecht\n2️⃣ Schlecht\n3️⃣ Durchschnittlich\n4️⃣ Gut\n5️⃣ Sehr gut\n\n*Sie können Ihre Bewertung einfach als Zahl senden (z. B. 4)*",
      surveyThanks:
        "Vielen Dank für Ihre Bewertung! Als Stadtverwaltung Alanya ist uns Ihr Feedback sehr wichtig. Wir wünschen Ihnen einen schönen Tag. 🙏🌸",
      surveyWarn:
        "Bitte schreiben und senden Sie nur eine Zahl zwischen 1 und 5, um unseren Service zu bewerten (z. B. 4).",
    };
  } else if (l === "ru" || l === "russian" || l === "русский") {
    return {
      statusTitle: "✅ *Муниципалитет Алании Обновление статуса*",
      infoTitle: "❓ *Муниципалитет Алании — Запрос информации*",
      generalTitle: "*Муниципалитет Алании Обновление*",
      dear: "Уважаемый(ая)",
      trackingNo: "Номер отслеживания",
      neighborhood: "Район",
      complaint: "Жалоба",
      statusResolved: "РЕШЕНО",
      statusUpdated: "ОБНОВЛЕНО",
      resolvedDesc:
        "Ваша жалоба успешно решена. Муниципалитет Алании постоянно улучшает свои услуги.",
      greeting: "Муниципалитет Алании желает вам хорошего дня. 🌟",
      infoBody: "*Вопрос муниципалитета:*",
      infoFooter:
        'Пожалуйста, ответьте на это сообщение, чтобы предоставить информацию. Ваш ответ будет добавлен к той же записи жалобы.\n\nЕсли вы хотите сообщить о новой жалобе, вы можете написать "новая жалоба".',
      infoDesc: "*Объяснение муниципалитета:*",
      surveyTitle: "📊 *Муниципалитет Алании Опрос удовлетворенности*",
      surveyBody:
        "Для нас очень важно, чтобы вы оценили процесс решения вашей жалобы! Пожалуйста, оцените качество нашего обслуживания от *1 до 5*:\n\n1️⃣ Очень плохо\n2️⃣ Плохо\n3️⃣ Средне\n4️⃣ Хорошо\n5️⃣ Отлично\n\n*Вы можете отправить оценку просто числом (например, 4)*",
      surveyThanks:
        "Большое спасибо за вашу оценку! Как муниципалитет Алании, ваши отзывы очень важны для нас. Желаем вам хорошего дня. 🙏🌸",
      surveyWarn:
        "Пожалуйста, напишите и отправьте только число от 1 до 5, чтобы оценить наш сервис (например, 4).",
    };
  }

  // Default Turkish
  return {
    statusTitle: "✅ *Alanya Belediyesi Durum Bildirimi*",
    infoTitle: "❓ *Alanya Belediyesi — Ek Bilgi Talebi*",
    generalTitle: "*Alanya Belediyesi Bilgilendirme*",
    dear: "Sayın",
    trackingNo: "Takip No",
    neighborhood: "Mahalle",
    complaint: "Şikayet",
    statusResolved: "ÇÖZÜLDÜ",
    statusUpdated: "GÜNCELLENDİ",
    resolvedDesc:
      "Şikayetiniz başarıyla çözülmüştür. Alanya Belediyesi olarak hizmetlerimizi sürekli iyileştirmeye devam ediyoruz.",
    greeting: "Alanya Belediyesi olarak iyi günler dileriz. 🌟",
    infoBody: "*Belediye Birim Sorusu:*",
    infoFooter:
      'Lütfen bu mesaja yanıt vererek bilgi paylaşın. Yanıtınız aynı şikayet kaydına eklenecektir.\n\nYeni bir şikayet bildirmek isterseniz "yeni şikayet" yazabilirsiniz.',
    infoDesc: "*Belediye Birim Açıklaması:*",
    surveyTitle: "📊 *Alanya Belediyesi Memnuniyet Anketi*",
    surveyBody:
      "Şikayetinizin çözülme sürecini değerlendirmeniz bizim için çok önemlidir! Lütfen hizmet kalitemize *1 ile 5 arasında* bir puan verin:\n\n1️⃣ Çok Kötü\n2️⃣ Kötü\n3️⃣ Orta\n4️⃣ İyi\n5️⃣ Çok İyi\n\n*Puanınızı sadece rakam olarak yazıp gönderebilirsiniz (örn: 4)*",
    surveyThanks:
      "Değerlendirmeniz için çok teşekkür ederiz! Alanya Belediyesi olarak görüşleriniz bizim için çok değerlidir. İyi günler dileriz. 🙏🌸",
    surveyWarn:
      "Lütfen hizmetimizi değerlendirmek için sadece 1 ile 5 arasında bir rakam yazıp gönderin (Örn: 4).",
  };
}

// ─── SLA ve KRİZ Daemon ──────────────────────────────────
async function checkSLAsAndCrises(sock) {
  try {
    const adminJid = "16690377154811@s.whatsapp.net"; // Başkan / Yönetici Numarası
    const now = new Date().getTime();

    // Ayarları yükle
    const settings = getBotSettings();
    const slaLimitHours = settings.slaLimitHours || 120;
    const crisisLimitHours = settings.crisisLimitHours || 1;
    const crisisLimitCount = settings.crisisLimitCount || 4;

    // 1. SLA İhlali Kontrolü (Öncelik: Yüksek, slaLimitHours aşmış, çözülmemiş)
    const { data: openComplaints, error: compError } = await supabase
      .from("complaints")
      .select("id, category, created_at, status, priority, neighborhood_id")
      .eq("priority", "yuksek");

    if (!compError && openComplaints) {
      for (const comp of openComplaints) {
        if (["cozuldu", "reddedildi"].includes(comp.status)) continue;

        if (now - new Date(comp.created_at).getTime() > slaLimitHours * 3600000) {
          // Check if already escalated
          const { data: existingResp } = await supabase
            .from("complaint_responses")
            .select("id")
            .eq("complaint_id", comp.id)
            .eq("response_type", "eskalasyon")
            .maybeSingle();

          if (!existingResp) {
            console.log(`   🚨 SLA Eskalasyonu: ${comp.id}`);
            // Send WhatsApp message to Admin
            const slaText =
              slaLimitHours >= 24
                ? `${Math.round(slaLimitHours / 24)} gündür`
                : `${slaLimitHours} saattir`;
            const escText = `🚨 *SLA İHLALİ (ESKALASYON)*\n\n*Takip No:* ${comp.id.substring(0, 8).toUpperCase()}\n*Kategori:* ${comp.category}\n*Durum:* Yüksek öncelikli şikayet ${slaText} çözülemedi! Lütfen acil müdahale edin.`;
            await sock.sendMessage(adminJid, { text: escText });

            // Log to database
            await supabase.from("complaint_responses").insert({
              complaint_id: comp.id,
              response_text: `Otomatik SLA Eskalasyonu yapıldı (${slaText} aşımı).`,
              response_type: "eskalasyon",
            });
          }
        }
      }
    }

    // 2. Kriz Algılama (Son X saat içinde aynı mahalle ve kategoriden >= Y açık şikayet → otomatik yüksek öncelik)
    const { data: recentComplaints } = await supabase
      .from("complaints")
      .select("id, category, neighborhood_id, status, priority, created_at")
      .gte("created_at", new Date(now - crisisLimitHours * 3600000).toISOString());

    if (recentComplaints && recentComplaints.length > 0) {
      const groups = {};
      recentComplaints.forEach((c) => {
        if (c.neighborhood_id && c.category && !["cozuldu", "reddedildi"].includes(c.status)) {
          const key = `${c.neighborhood_id}::${c.category}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(c);
        }
      });

      if (!global.notifiedCrises) global.notifiedCrises = new Set();

      for (const [key, complaints] of Object.entries(groups)) {
        if (complaints.length >= crisisLimitCount && !global.notifiedCrises.has(key)) {
          const [nbrId, cat] = key.split("::");
          const nbr = neighborhoodsCache.find((n) => n.id === nbrId);
          const nbrName = nbr ? nbr.name : "Bilinmeyen Mahalle";

          console.log(`   ⚠️ BÖLGESEL KRİZ: ${nbrName} - ${cat} (${complaints.length} şikayet)`);

          // Otomatik olarak bu şikayetlerin önceliğini "yuksek" yap
          const toUpgrade = complaints.filter((c) => c.priority !== "yuksek");
          for (const comp of toUpgrade) {
            await supabase.from("complaints").update({ priority: "yuksek" }).eq("id", comp.id);
            console.log(`   ⬆️ Öncelik yükseltildi: ${comp.id.substring(0, 8).toUpperCase()}`);
          }

          const crisisText = `⚠️ *BÖLGESEL KRİZ UYARISI*\n\n*Mahalle:* ${nbrName}\n*Kategori:* ${cat}\n*Durum:* Son ${crisisLimitHours} saat içinde bu bölgede ${complaints.length} adet çözülmemiş şikayet birikti.\n\n🔺 Tüm ilgili şikayetlerin önceliği otomatik olarak *Yüksek* seviyeye çıkarıldı.\n\nSaha ekiplerinin acilen yönlendirilmesi tavsiye edilir.`;
          await sock.sendMessage(adminJid, { text: crisisText });

          global.notifiedCrises.add(key);
        }
      }
    }
  } catch (e) {
    console.error("⚠️ checkSLAsAndCrises Hatası:", e.message);
  }
}

// Metinde Türk plakası ara (07 APN 117 / 07APN117 / **07 APN 117** vb.).
// Döner: { normalized: '07APN117', pattern: '%07%APN%117%' } veya null.
function extractLicensePlate(text) {
  if (!text) return null;
  const up = String(text)
    .toUpperCase()
    .replace(/İ/g, "I")
    .replace(/[^0-9A-Z\s]/g, " ");
  const m = up.match(/\b(\d{2})\s*([A-Z]{1,4})\s*(\d{2,5})\b/);
  if (!m) return null;
  return { normalized: `${m[1]}${m[2]}${m[3]}`, pattern: `%${m[1]}%${m[2]}%${m[3]}%` };
}

// ─── Mükerrer / Benzer Şikayet Tespiti ─────────────────────────────
// Son `dedupWindowHours` içinde açılmış (çözülmemiş) bir şikayet, yeni gelenle
// AYNI somut sorunu bildiriyorsa onu döndürür; yoksa null.
// Aday havuzu BİÇİMDEN ve KATEGORİDEN bağımsızdır: aynı mahalledeki tüm açık
// şikayetler + (varsa) aynı plakayı içeren açık şikayetler birlikte değerlendirilir.
// Böylece "biri fotoğraf / biri yazı" ya da farklı kategoriye düşmüş aynı sorun da yakalanır.
async function findDuplicateComplaint({ neighborhoodId, category, text }) {
  try {
    const settings = getBotSettings();
    if (settings.dedupEnabled === false) return null; // ayarla kapatılabilir
    if (!text || !text.trim()) return null;

    const windowHours = settings.dedupWindowHours || 72; // varsayılan 3 gün
    const sinceIso = new Date(Date.now() - windowHours * 3600000).toISOString();
    const cols = "id, complaint_text, category, status, created_at, citizen_phone";

    // Aday havuzunu id'ye göre tekilleştirerek topla
    const byId = new Map();

    // (a) Aynı mahalledeki açık şikayetler (KATEGORİ FİLTRESİ YOK — foto/yazı ve
    //     farklı kategoriye düşmüş aynı sorun da havuza girsin).
    if (neighborhoodId) {
      const { data, error } = await supabase
        .from("complaints")
        .select(cols)
        .eq("neighborhood_id", neighborhoodId)
        .gte("created_at", sinceIso)
        .not("status", "in", "(cozuldu,reddedildi)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) console.error("   ⚠️ Mükerrer (mahalle) sorgu hatası:", error.message);
      else (data || []).forEach((c) => byId.set(c.id, c));
    }

    // (b) Yeni metinde plaka varsa: mahalle/kategori fark etmeksizin aynı plakayı
    //     içeren açık şikayetleri de havuza ekle (plaka güçlü bir eşleşme sinyalidir).
    const plate = extractLicensePlate(text);
    if (plate) {
      const { data, error } = await supabase
        .from("complaints")
        .select(cols)
        .gte("created_at", sinceIso)
        .not("status", "in", "(cozuldu,reddedildi)")
        .ilike("complaint_text", plate.pattern)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) console.error("   ⚠️ Mükerrer (plaka) sorgu hatası:", error.message);
      else (data || []).forEach((c) => byId.set(c.id, c));
    }

    const candidates = Array.from(byId.values());
    if (candidates.length === 0) return null;

    // 1) AI varsa: gerçekten AYNI somut sorun mu diye akıllı karşılaştır.
    if (openai) {
      try {
        const list = candidates
          .map(
            (c, i) =>
              `${i + 1}. [${c.id}] (${c.category || "Diğer"}) ${String(c.complaint_text || "").slice(0, 300)}`,
          )
          .join("\n");
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Aşağıda halihazırda AÇIK olan belediye şikayetleri var (başında köşeli parantezde kategori yazar). Yeni gelen şikayetin, listedekilerden biriyle AYNI SOMUT SORUNU (aynı olay/aynı araç/aynı yer/aynı konu) bildirip bildirmediğine karar ver.

ÖNEMLİ:
- Şikayetler FARKLI BİÇİMLERDE gelebilir: biri fotoğraftan üretilmiş metin, diğeri vatandaşın yazdığı düz metin olabilir. Biçim ve kategori farkı önemli DEĞİLDİR; önemli olan aynı somut sorunun anlatılmasıdır.
- Aynı araç PLAKASI + aynı/benzer ihlal (ör. kaldırıma/yaya yoluna park) + aynı bölge → AYNI sorundur (plaka yazımındaki boşluk/işaret farklarını yok say).
- Sadece aynı kategoride olmak YETERLİ DEĞİLDİR (farklı sokaklardaki iki ayrı çukur ya da farklı araçlar farklı sorunlardır).
- Emin değilsen eşleştirme.

SADECE JSON döndür: {"duplicate_of": "<eşleşen şikayet id>" | null, "confidence": 0.0-1.0}`,
            },
            {
              role: "user",
              content: `MEVCUT AÇIK ŞİKAYETLER:\n${list}\n\nYENİ ŞİKAYET (kategori: ${category || "Diğer"}):\n"${text.slice(0, 500)}"`,
            },
          ],
        });
        const parsed = JSON.parse(resp.choices[0].message.content || "{}");
        const conf = typeof parsed.confidence === "number" ? parsed.confidence : 1;
        if (parsed.duplicate_of && conf >= 0.6) {
          const matched = candidates.find((c) => c.id === parsed.duplicate_of);
          if (matched) {
            console.log(
              `   ♻️ Mükerrer şikayet tespit edildi (AI, güven: ${conf}): ${matched.id.substring(0, 8).toUpperCase()}`,
            );
            return matched;
          }
        }
        return null;
      } catch (e) {
        console.error("   ⚠️ Mükerrer AI kontrol hatası (kayıt engellenmeyecek):", e.message);
        return null; // AI hatasında güvenli taraf: kaydı engelleme
      }
    }

    // 2) AI yoksa: önce plaka birebir eşleşmesi, sonra kelime bazlı benzerlik (Jaccard).
    if (plate) {
      const hit = candidates.find((c) => {
        const p = extractLicensePlate(c.complaint_text);
        return p && p.normalized === plate.normalized;
      });
      if (hit) {
        console.log(
          `   ♻️ Mükerrer şikayet tespit edildi (plaka: ${plate.normalized}): ${hit.id.substring(0, 8).toUpperCase()}`,
        );
        return hit;
      }
    }
    const toks = (s) =>
      new Set(
        normalizeTr(String(s || ""))
          .split(/\s+/)
          .filter((w) => w.length > 3),
      );
    const newTokens = toks(text);
    if (newTokens.size === 0) return null;
    for (const c of candidates) {
      const cTokens = toks(c.complaint_text);
      if (cTokens.size === 0) continue;
      let inter = 0;
      for (const t of newTokens) if (cTokens.has(t)) inter++;
      const jaccard = inter / (newTokens.size + cTokens.size - inter);
      if (jaccard >= 0.5) {
        console.log(
          `   ♻️ Mükerrer şikayet tespit edildi (kelime benzerliği: ${jaccard.toFixed(2)}): ${c.id.substring(0, 8).toUpperCase()}`,
        );
        return c;
      }
    }
    return null;
  } catch (e) {
    console.error("   ⚠️ findDuplicateComplaint hatası:", e.message);
    return null;
  }
}

// ─── Duyuru Broadcast ──────────────────────────────────────────
async function broadcastAnnouncement(sock, announcement, targetPhones = null) {
  try {
    // ── Mükerrer gönderim koruması ──
    const DEDUP_WINDOW_MS = 2 * 1000;
    if (!global.recentAnnouncementBroadcasts) global.recentAnnouncementBroadcasts = new Map();
    const lastAt = global.recentAnnouncementBroadcasts.get(announcement.id);
    if (lastAt && Date.now() - lastAt < DEDUP_WINDOW_MS) {
      console.log(
        `   ⏭️ Duyuru az önce gönderildi/gönderiliyor, mükerrer tetikleme atlanıyor: "${announcement.title}"`,
      );
      return;
    }
    global.recentAnnouncementBroadcasts.set(announcement.id, Date.now());

    console.log(`\n📢 Duyuru Broadcast başlatılıyor: "${announcement.title}"`);

    let uniquePhones = [];
    if (Array.isArray(targetPhones) && targetPhones.length > 0) {
      uniquePhones = [...new Set(targetPhones.filter(Boolean))];
    } else {
      // Varsayılan: Daha önce bot ile iletişime geçmiş benzersiz vatandaş telefonlarını çek
      const { data: citizens, error: citizenError } = await supabase
        .from("complaints")
        .select("citizen_phone")
        .in("source", ["whatsapp_qr", "whatsapp"])
        .not("citizen_phone", "is", null);

      if (citizenError || !citizens) {
        console.error("⚠️ Vatandaş listesi alınamadı:", citizenError?.message);
        return;
      }
      uniquePhones = [...new Set(citizens.map((c) => c.citizen_phone).filter(Boolean))];
    }

    console.log(`   📋 ${uniquePhones.length} benzersiz vatandaşa gönderilecek.`);

    if (uniquePhones.length === 0) {
      console.log("   ⏭️ Gönderilecek vatandaş bulunamadı.");
      return;
    }

    // Mesaj metnini hazırla
    const dateRange =
      announcement.start_date && announcement.end_date
        ? `\n📅 *Tarih:* ${new Date(announcement.start_date).toLocaleDateString("tr-TR")} — ${new Date(announcement.end_date).toLocaleDateString("tr-TR")}`
        : announcement.start_date
          ? `\n📅 *Tarih:* ${new Date(announcement.start_date).toLocaleDateString("tr-TR")}`
          : "";

    const messageText =
      `📢 *Alanya Belediyesi Duyurusu*\n\n` +
      `🔔 *${announcement.title}*\n` +
      (announcement.description ? `\n${announcement.description}` : "") +
      dateRange +
      `\n\n_Alanya Belediyesi olarak iyi günler dileriz. 🌟_`;

    let sentCount = 0;
    let failCount = 0;

    for (let phone of uniquePhones) {
      try {
        // Numarayı temizle (sadece rakamları tut, başındaki sıfır veya + işaretini standartlaştır)
        let cleanPhone = phone.replace(/\D/g, "");

        // Eğer 0 ile başlıyorsa ve Türkiye numarasıysa (örn: 0532...) 90 ile başlasın
        if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
          cleanPhone = "90" + cleanPhone.substring(1);
        }

        // Eğer başında ülke kodu yoksa ve 10 haneli ise (örn: 532...) 90 ekle
        if (cleanPhone.length === 10 && cleanPhone.startsWith("5")) {
          cleanPhone = "90" + cleanPhone;
        }

        let jid = `${cleanPhone}@s.whatsapp.net`;
        const exactJid = global.activeJids?.get(phone) || jid;

        console.log(`   📤 Gönderiliyor: ${cleanPhone} (${phone})`);

        // Gönderici hedefleri (hedef numara ve test amaçlı kendi numaramız)
        const targets = [exactJid];

        // Kendi JID'imizi ekle (eğer listede yoksa kendimize de gitsin)
        if (sock.user?.id) {
          const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          if (!targets.includes(myJid)) {
            targets.push(myJid);
            console.log(`   🧪 Test modu: Bot kendi numarasına da gönderecek (${myJid})`);
          }
        }

        for (const targetJid of targets) {
          // Eğer görsel varsa görseli başlıkla birlikte gönder
          if (announcement.file_url && announcement.file_type === "image") {
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
          } else if (
            announcement.file_url &&
            (announcement.file_type === "video" ||
              /\.(mp4|mov|avi|mkv|webm)($|\?)/i.test(announcement.file_url))
          ) {
            try {
              const response = await fetch(announcement.file_url);
              const buffer = Buffer.from(await response.arrayBuffer());
              const sentVideo = await sock.sendMessage(targetJid, {
                video: buffer,
                caption: messageText,
                mimetype: "video/mp4",
              });
              if (sentVideo?.key?.id) addBotMessageId(sentVideo.key.id);
            } catch (vidErr) {
              console.log(
                `   ⚠️ Video gönderilemedi (${targetJid}), metin gönderiliyor...`,
                vidErr.message,
              );
              const sent = await sock.sendMessage(targetJid, { text: messageText });
              if (sent?.key?.id) addBotMessageId(sent.key.id);
            }
          } else if (announcement.file_url && announcement.file_type === "pdf") {
            try {
              const response = await fetch(announcement.file_url);
              const buffer = Buffer.from(await response.arrayBuffer());
              const sentText = await sock.sendMessage(targetJid, { text: messageText });
              if (sentText?.key?.id) addBotMessageId(sentText.key.id);
              const sentDoc = await sock.sendMessage(targetJid, {
                document: buffer,
                mimetype: "application/pdf",
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
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (sendErr) {
        failCount++;
        console.error(`   ❌ Gönderilemedi (${phone}): ${sendErr.message}`);
      }
    }

    // sent_at güncelle
    await supabase
      .from("announcements")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", announcement.id);

    console.log(
      `   ✅ Duyuru broadcast tamamlandı: ${sentCount} başarılı, ${failCount} başarısız.`,
    );
  } catch (e) {
    console.error("⚠️ broadcastAnnouncement Hatası:", e.message);
  }
}

async function broadcastPoll(sock, poll) {
  try {
    console.log(`\n📢 ANKET BROADCAST BAŞLADI: "${poll.title}" (Şık: ${poll.poll_options.length})`);

    // Aktif sohbet etmiş numaraları veya known users listesini çek
    const { data: users, error } = await supabase
      .from("complaints")
      .select("citizen_phone")
      .not("citizen_phone", "is", null);

    if (error) throw error;

    let phones = [...new Set(users.map((u) => u.citizen_phone))];

    if (isSelfChatOnly()) {
      const myJid = sock.user?.id;
      const myBareId = myJid ? myJid.split(":")[0].split("@")[0] : null;
      if (myBareId) {
        phones = [myBareId];
        console.log(
          `   🧪 Geliştirici modu (selfChatOnly=true) aktif. Sadece ${myBareId} numarasına anket gönderilecek.`,
        );
      } else {
        console.log("   ⚠️ Geliştirici numarası alınamadı.");
        return;
      }
    }

    // Şıkları formatla
    const sortedOptions = poll.poll_options.sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const optionTexts = sortedOptions.map((opt) => opt.option_text);

    const introText = `📊 *${poll.title}*\n\n${poll.question}`;

    let successCount = 0;
    for (const phone of phones) {
      if (!phone) continue;
      const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;

      try {
        if (poll.image_url) {
          await sock.sendMessage(jid, {
            image: { url: poll.image_url },
            caption: introText,
          });
        }

        // Native Poll Gönder
        const sentMsg = await sock.sendMessage(jid, {
          poll: {
            name: poll.image_url ? "Lütfen şıklardan birini seçiniz:" : introText,
            values: optionTexts,
            selectableCount: 1,
          },
        });

        // Şifrelemeyi çözmek için secret'i kaydet
        if (sentMsg?.key?.id) {
          const secret = sentMsg?.message?.messageContextInfo?.messageSecret;
          if (secret) {
            savePollSecret(sentMsg.key.id, secret, poll.id);
          } else {
            console.log(
              "⚠️ sentMsg içerisinde messageSecret bulunamadı! SentMsg içeriği:",
              JSON.stringify(sentMsg, null, 2),
            );
            // Baileys bazen poll msg yapısında farklı yerde saklar.
          }
        }

        successCount++;
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`   ❌ Anket gönderilemedi (${phone}):`, err.message);
      }
    }

    // DB Güncelle
    await supabase
      .from("polls")
      .update({ sent_to_whatsapp: true, sent_at: new Date().toISOString() })
      .eq("id", poll.id);

    console.log(`📢 ANKET BROADCAST BİTTİ. Başarılı: ${successCount}/${phones.length}`);
  } catch (e) {
    console.error("⚠️ broadcastPoll Hatası:", e.message);
  }
}

// ─── WhatsApp Bağlantısı (Baileys) ──────────────────────────────
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./.baileys_auth");

  console.log("🔄 En son WhatsApp sürümü sorgulanıyor...");
  let version = [2, 3000, 1017531287]; // Fallback sürüm
  try {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
    console.log(`ℹ️ WhatsApp Sürümü: ${version.join(".")}`);
  } catch (err) {
    console.log("⚠️ Sürüm sorgulanamadı, varsayılan kullanılacak:", err.message);
  }

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
    browser: ["Belediye Bot", "Chrome", "1.0.0"],
    syncFullHistory: false, // Uzun süren senkronizasyonu kapatır (Timeout hatasını önler)
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (jid) => jid?.includes("broadcast"), // Durum (status) mesajlarını ve broadcast'leri yoksayarak kilitlenmeyi önler
  });

  // Global referans: Webhook ve Realtime handler'lar her zaman güncel sock'u kullansın
  global.currentSock = sock;

  // Bağlantı durumu güncellemeleri
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 QR kodu aşağıdaki gibi telefonunuzdan okutun:");
      console.log("   WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Bağla\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("\n🟢 WhatsApp Bot (Baileys) başarıyla bağlandı!");
      console.log("   Gelen şikayetler dinleniyor...\n");
      await loadInitialData(sock);

      // SLA ve Kriz kontrolünü her 5 dakikada bir çalıştır
      if (!global.slaDaemonStarted) {
        global.slaDaemonStarted = true;
        console.log("   ⏱️ SLA ve Kriz Daemon aktif edildi (5 dakikada bir kontrol edilecek).");
        setInterval(() => checkSLAsAndCrises(global.currentSock), 5 * 60 * 1000);
        // İlk kontrolü 10 saniye sonra yap
        setTimeout(() => checkSLAsAndCrises(global.currentSock), 10 * 1000);
      }

      // Realtime Dinleme (Belediye Personeli Cevap Yazınca WhatsApp'a Bildirim Gitmesi)
      console.log("   📡 Supabase Realtime şikayet cevapları dinleniyor...");

      supabase.removeAllChannels();

      supabase
        .channel("whatsapp_responses")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "complaint_responses",
          },
          async (payload) => {
            try {
              const newResponse = payload.new;

              // Personelin yazdığı cevap/soru ve durum bildirimlerini ilet
              if (!["manuel", "soru", "durum_bildirimi"].includes(newResponse.response_type))
                return;

              console.log(
                `\n   📨 Yeni ${newResponse.response_type === "durum_bildirimi" ? "durum bildirimi" : newResponse.response_type === "soru" ? "belediye sorusu" : "belediye cevabı"} tespit edildi (Şikayet ID: ${newResponse.complaint_id})`,
              );

              // Şikayeti ve vatandaşın telefonunu çek
              const { data: complaint, error: compError } = await supabase
                .from("complaints")
                .select(
                  "citizen_phone, citizen_name, status, complaint_text, neighborhood_id, source, language",
                )
                .eq("id", newResponse.complaint_id)
                .single();

              if (compError || !complaint) {
                console.error("⚠️ Cevap için vatandaş bilgileri bulunamadı:", compError?.message);
                return;
              }

              // Sadece WhatsApp kaynaklı şikayetler için bildirim gönder
              if (complaint.source !== "whatsapp_qr") {
                console.log(
                  `   ⏭️ Kaynak whatsapp_qr değil (${complaint.source}), bildirim atlanıyor.`,
                );
                return;
              }

              // JID formatı
              const jid = complaint.citizen_phone.includes("@")
                ? complaint.citizen_phone
                : `${complaint.citizen_phone}@s.whatsapp.net`;

              let responseText;
              const loc = getLocalizedMessages(complaint.language);

              if (newResponse.response_type === "durum_bildirimi") {
                // ✅ Çözüldü bildirimi
                const trackingNo = newResponse.complaint_id.substring(0, 8).toUpperCase();
                // Prevent duplicate solved messages if we already sent a status for this complaint recently
                if (!shouldSendStatus(newResponse.complaint_id)) {
                  console.log(
                    "   ⚠️ Duplicate solved webhook suppressed for",
                    newResponse.complaint_id,
                  );
                  return; // skip sending this response
                }
                let neighborhoodName = "";
                if (complaint.neighborhood_id) {
                  const nbr = neighborhoodsCache.find((n) => n.id === complaint.neighborhood_id);
                  if (nbr) neighborhoodName = nbr.name;
                }

                responseText =
                  `${loc.statusTitle}\n\n` +
                  `${loc.dear} *${complaint.citizen_name || "Vatandaş"}*,\n\n` +
                  `📋 ${loc.trackingNo}: ${mono(trackingNo)}\n` +
                  (neighborhoodName ? `📍 ${loc.neighborhood}: *${neighborhoodName}*\n` : "") +
                  `📌 ${loc.complaint}: "${(complaint.complaint_text || "").substring(0, 80)}${(complaint.complaint_text || "").length > 80 ? "..." : ""}"\n\n` +
                  `🔄 Durum: *${loc.statusResolved}*\n` +
                  `${newResponse.response_text}\n\n` +
                  `${loc.greeting}`;
              } else if (newResponse.response_type === "soru") {
                const trackingNo = newResponse.complaint_id.substring(0, 8).toUpperCase();
                responseText =
                  `${loc.infoTitle}\n\n` +
                  `${loc.dear} *${complaint.citizen_name || "Vatandaş"}*,\n\n` +
                  `📋 ${loc.trackingNo}: ${mono(trackingNo)}\n\n` +
                  `${loc.infoBody}\n"${newResponse.response_text}"\n\n` +
                  `${loc.infoFooter}`;
              } else {
                const statusEmoji = complaint.status === "cozuldu" ? "✅" : "📢";
                const statusText =
                  complaint.status === "cozuldu" ? loc.statusResolved : loc.statusUpdated;

                responseText =
                  `${statusEmoji} ${loc.generalTitle}\n\n` +
                  `${loc.dear} *${complaint.citizen_name || "Vatandaş"}*,\n` +
                  `Şikayetinizin durumu *${statusText}* olarak güncellenmiştir.\n\n` +
                  `${loc.infoDesc}\n"${newResponse.response_text}"\n\n` +
                  `${loc.greeting}`;
              }

              const sent = await sock.sendMessage(jid, { text: responseText });
              if (sent?.key?.id) {
                addBotMessageId(sent.key.id);
              }
              // Şikayet sesli başladıysa, çözüm/cevap bildirimini de sesli gönder
              console.log(
                `   🎙️ [Realtime] Sesli-köken mi? ${isVoiceComplaint(newResponse.complaint_id)} — ${newResponse.complaint_id?.substring(0, 8)}`,
              );
              if (isVoiceComplaint(newResponse.complaint_id)) {
                await sendVoiceNote(sock, jid, responseText, complaint.language);
              }
              console.log(
                `   💬 ${newResponse.response_type === "durum_bildirimi" ? "Durum bildirimi" : "Cevap"} WhatsApp üzerinden vatandaşa iletildi (${complaint.citizen_phone})`,
              );

              // Eğer bu bir durum bildirimi ise ve şikayet çözüldüyse anket gönder
              if (newResponse.response_type === "durum_bildirimi") {
                const phoneClean = complaint.citizen_phone;
                pendingSurveys.set(phoneClean, newResponse.complaint_id);
                const surveyVoice = isVoiceComplaint(newResponse.complaint_id);
                let surveyText = `${loc.surveyTitle}\n\n${loc.surveyBody}`;
                if (surveyVoice) surveyText = voiceify(surveyText, complaint.language);

                setTimeout(async () => {
                  try {
                    const sentSurvey = await sock.sendMessage(jid, { text: surveyText });
                    if (sentSurvey?.key?.id) {
                      addBotMessageId(sentSurvey.key.id);
                    }
                    if (surveyVoice) {
                      await sendVoiceNote(sock, jid, surveyText, complaint.language);
                    }
                    console.log(`   📊 Memnuniyet anketi vatandaşa gönderildi (${phoneClean})`);
                  } catch (e) {
                    console.error("⚠️ Anket gönderilirken hata oluştu:", e.message);
                  }
                }, 1500);
              }
            } catch (err) {
              console.error("⚠️ Realtime bildirim gönderme hatası:", err.message);
            }
          },
        )
        .subscribe();

      // Duyuru Realtime Dinleme (Yeni duyuru eklenince otomatik broadcast — isteğe bağlı)
      console.log("   📡 Supabase Realtime duyurular dinleniyor...");
      supabase
        .channel("whatsapp_announcements")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "announcements",
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
              console.error("⚠️ Duyuru Realtime hatası:", err.message);
            }
          },
        )
        .subscribe();

      // ── Express Webhook Sunucusu (CORS ve Realtime kesintilerini önlemek için) ──
      const app = express();
      app.use(express.json());

      // CORS izinleri
      app.use((req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") return res.sendStatus(200);
        next();
      });

      // Duyuru Broadcast Webhook Endpoint
      app.post("/broadcast-announcement", async (req, res) => {
        try {
          const { announcementId, targetPhones } = req.body;
          if (!announcementId) {
            return res.status(400).json({ status: "error", reason: "announcementId gerekli" });
          }

          const activeSock = global.currentSock;
          if (!activeSock) {
            return res
              .status(503)
              .json({ status: "error", reason: "WhatsApp bağlantısı aktif değil" });
          }

          // Duyuruyu çek
          const { data: announcement, error: annError } = await supabase
            .from("announcements")
            .select("*")
            .eq("id", announcementId)
            .single();

          if (annError || !announcement) {
            return res.status(404).json({ status: "error", reason: "Duyuru bulunamadı" });
          }

          // Async olarak broadcast yap (response'u hemen dön)
          res.json({ status: "started", message: "Broadcast başlatıldı" });

          await broadcastAnnouncement(activeSock, announcement, targetPhones);
        } catch (error) {
          console.error("⚠️ Broadcast webhook hatası:", error.message);
          if (!res.headersSent) {
            res.status(500).json({ status: "error", reason: error.message });
          }
        }
      });

      // ── Zabıta Tutanağı Gönderim Endpoint'i ──
      // Denetim sonrası imzalı tutanak PDF'ini esnafın telefonuna WhatsApp'tan iletir.
      app.post("/send-inspection-pdf", async (req, res) => {
        try {
          const { inspectionId, phone: phoneOverride, pdfUrl: pdfUrlOverride } = req.body || {};
          if (!inspectionId) {
            return res.status(400).json({ status: "error", reason: "inspectionId gerekli" });
          }

          const activeSock = global.currentSock;
          if (!activeSock) {
            return res
              .status(503)
              .json({ status: "error", reason: "WhatsApp bağlantısı aktif değil" });
          }

          const { data: ins, error: insErr } = await supabase
            .from("workplace_inspections")
            .select("*")
            .eq("id", inspectionId)
            .single();

          if (insErr || !ins) {
            return res.status(404).json({ status: "error", reason: "Denetim kaydı bulunamadı" });
          }

          const rawPhone = phoneOverride || ins.phone;
          const jid = toWhatsappJid(rawPhone);
          if (!jid) {
            return res
              .status(400)
              .json({ status: "error", reason: "Geçerli bir işyeri telefonu yok" });
          }

          // PDF adresi: istemciden gelen URL yalnızca kendi storage'ımıza aitse kabul edilir
          let pdfUrl = ins.tutanak_url || null;
          if (
            pdfUrlOverride &&
            process.env.SUPABASE_URL &&
            pdfUrlOverride.startsWith(process.env.SUPABASE_URL)
          ) {
            pdfUrl = pdfUrlOverride;
          }
          if (!pdfUrl) {
            return res
              .status(400)
              .json({ status: "error", reason: "Bu denetim için arşivlenmiş tutanak PDF'i yok" });
          }

          const pdfRes = await fetch(pdfUrl);
          if (!pdfRes.ok) {
            return res
              .status(502)
              .json({ status: "error", reason: `Tutanak PDF'i indirilemedi (${pdfRes.status})` });
          }
          const buffer = Buffer.from(await pdfRes.arrayBuffer());

          const tarih = new Date(ins.created_at).toLocaleDateString("tr-TR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          const puan = ins.penalty_points ?? 0;
          const sonuc =
            puan > 0
              ? `⚠️ Ceza Puanı: *${puan}*\nUygulanan Yaptırım: *${ins.recommended_action || "—"}*`
              : "✅ Denetimde mevzuata aykırı bir husus tespit edilmemiştir.";
          const takip = ins.followup_date
            ? `\n\n🗓️ Tekrar denetim tarihi: *${new Date(ins.followup_date).toLocaleDateString("tr-TR")}*\nEksikliklerin bu tarihe kadar giderilmesi gerekmektedir.`
            : "";

          const messageText =
            `📋 *İŞYERİ DENETİM TUTANAĞI*\n\n` +
            `Sayın ${ins.owner_name || "İşyeri Yetkilisi"},\n` +
            `*${ins.workplace_name}* isimli işyerinizde *${tarih}* tarihinde yapılan denetime ait imzalı tutanak ekte iletilmiştir.\n\n` +
            `${sonuc}${takip}\n\n` +
            `_Alanya Belediyesi Zabıta Müdürlüğü_`;

          const sentText = await activeSock.sendMessage(jid, { text: messageText });
          if (sentText?.key?.id) addBotMessageId(sentText.key.id);

          const fileName = `Denetim-Tutanagi-${String(ins.workplace_name || "isyeri")
            .replace(/[^\wğüşıöçĞÜŞİÖÇ ]/gi, "")
            .trim()
            .replace(/\s+/g, "-")}.pdf`;
          const sentDoc = await activeSock.sendMessage(jid, {
            document: buffer,
            mimetype: "application/pdf",
            fileName,
          });
          if (sentDoc?.key?.id) addBotMessageId(sentDoc.key.id);

          console.log(`   📤 Tutanak WhatsApp ile gönderildi: ${ins.workplace_name} → ${jid}`);
          res.json({ status: "sent", to: jid.split("@")[0] });
        } catch (error) {
          console.error("⚠️ Tutanak gönderim hatası:", error.message);
          if (!res.headersSent) {
            res.status(500).json({ status: "error", reason: error.message });
          }
        }
      });

      // Anket Broadcast Webhook Endpoint
      app.post("/send-poll", async (req, res) => {
        try {
          const { pollId } = req.body;
          if (!pollId) {
            return res.status(400).json({ status: "error", reason: "pollId gerekli" });
          }

          const activeSock = global.currentSock;
          if (!activeSock) {
            return res
              .status(503)
              .json({ status: "error", reason: "WhatsApp bağlantısı aktif değil" });
          }

          const { data: poll, error: pollErr } = await supabase
            .from("polls")
            .select("*, poll_options(*)")
            .eq("id", pollId)
            .single();

          if (pollErr || !poll) {
            return res.status(404).json({ status: "error", reason: "Anket bulunamadı" });
          }

          res.json({ status: "started", message: "Anket gönderimi başlatıldı" });

          await broadcastPoll(activeSock, poll);
        } catch (error) {
          console.error("⚠️ Anket broadcast webhook hatası:", error.message);
        }
      });

      app.post("/webhook/resolved", async (req, res) => {
        try {
          const { complaintId } = req.body;
          if (!complaintId) {
            return res.status(400).json({ error: "complaintId gereklidir" });
          }

          console.log(`\n   🔌 Webhook tetiklendi! Şikayet ID: ${complaintId}`);

          // Güncel sock referansını kullan (yeniden bağlantıda güncellenir)
          const activeSock = global.currentSock;
          if (!activeSock) {
            console.error("⚠️ WhatsApp bağlantısı hazır değil!");
            return res.status(503).json({ error: "WhatsApp bağlantısı hazır değil" });
          }

          // Şikayet detaylarını çek
          const { data: complaint, error: compError } = await supabase
            .from("complaints")
            .select(
              "citizen_phone, citizen_name, status, complaint_text, neighborhood_id, source, language",
            )
            .eq("id", complaintId)
            .single();

          if (compError || !complaint) {
            console.error("⚠️ Webhook şikayet bilgisi çekilemedi:", compError?.message);
            return res.status(404).json({ error: "Şikayet bulunamadı" });
          }

          console.log(
            `   📋 Şikayet bulundu: phone=${complaint.citizen_phone}, source=${complaint.source}, status=${complaint.status}`,
          );

          // Sadece WhatsApp kaynaklı şikayetler
          if (complaint.source !== "whatsapp_qr") {
            console.log(`   ⏭️ Kaynak whatsapp_qr değil (${complaint.source}), atlanıyor.`);
            return res.json({ status: "ignored", reason: "source_not_whatsapp" });
          }

          if (!complaint.citizen_phone) {
            console.log("   ⏭️ Telefon numarası yok, atlanıyor.");
            return res.json({ status: "ignored", reason: "no_phone" });
          }

          let jid = complaint.citizen_phone.includes("@")
            ? complaint.citizen_phone
            : `${complaint.citizen_phone}@s.whatsapp.net`;

          // Kendi numarasına (Self-Chat) gönderim yapılıyorsa cihaz JID'sini (user.id) kullan
          const myJid = activeSock.user?.id;
          console.log(`   🐛 DEBUG: myJid = ${myJid}, targetPhone = ${complaint.citizen_phone}`);
          if (myJid) {
            const myBareId = myJid.split(":")[0].split("@")[0];
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

          let neighborhoodName = "";
          if (complaint.neighborhood_id) {
            const nbr = neighborhoodsCache.find((n) => n.id === complaint.neighborhood_id);
            if (nbr) neighborhoodName = nbr.name;
          }

          const loc = getLocalizedMessages(complaint.language);

          const responseText =
            `${loc.statusTitle}\n\n` +
            `${loc.dear} *${complaint.citizen_name || "Vatandaş"}*,\n\n` +
            `📋 ${loc.trackingNo}: ${mono(trackingNo)}\n` +
            (neighborhoodName ? `📍 ${loc.neighborhood}: *${neighborhoodName}*\n` : "") +
            `📌 ${loc.complaint}: "${(complaint.complaint_text || "").substring(0, 80)}${(complaint.complaint_text || "").length > 80 ? "..." : ""}"\n\n` +
            `🔄 Durum: *${loc.statusResolved}*\n` +
            `${loc.resolvedDesc}\n\n` +
            `${loc.greeting}`;

          console.log(`   📤 Sohbet aktifleştiriliyor ve sendMessage çağrılıyor...`);

          // Gerçek bir kullanıcı gibi davranıp oturumu aktifleştirmek için "Yazıyor..." durumunu simüle et
          try {
            await activeSock.presenceSubscribe(jid);
            await new Promise((r) => setTimeout(r, 500));
            await activeSock.sendPresenceUpdate("composing", jid);
            await new Promise((r) => setTimeout(r, 1000));
            await activeSock.sendPresenceUpdate("paused", jid);
          } catch (e) {
            console.warn(`   ⚠️ Presence simülasyonu uyarı verdi: ${e.message}`);
          }

          const sent = await activeSock.sendMessage(jid, { text: responseText });
          console.log(`   📬 sendMessage sonucu:`, JSON.stringify(sent?.key || "BOŞ"));

          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }
          console.log(
            `   🎙️ [Webhook] Sesli-köken mi? ${isVoiceComplaint(complaintId)} — ${complaintId?.substring(0, 8)}`,
          );
          if (isVoiceComplaint(complaintId)) {
            await sendVoiceNote(activeSock, jid, responseText, complaint.language);
          }

          console.log(
            `   💬 Çözüldü bildirimi Webhook aracılığıyla vatandaşa iletildi (${complaint.citizen_phone})`,
          );

          // Anket Gönderimi
          const phoneClean = complaint.citizen_phone;
          pendingSurveys.set(phoneClean, complaintId);
          const surveyVoice = isVoiceComplaint(complaintId);
          let surveyText = `${loc.surveyTitle}\n\n${loc.surveyBody}`;
          if (surveyVoice) surveyText = voiceify(surveyText, complaint.language);

          setTimeout(async () => {
            try {
              const sentSurvey = await activeSock.sendMessage(jid, { text: surveyText });
              if (sentSurvey?.key?.id) {
                addBotMessageId(sentSurvey.key.id);
              }
              if (surveyVoice) {
                await sendVoiceNote(activeSock, jid, surveyText, complaint.language);
              }
              console.log(`   📊 Memnuniyet anketi vatandaşa gönderildi (${phoneClean})`);
            } catch (e) {
              console.error("⚠️ Anket gönderilirken hata oluştu:", e.message);
            }
          }, 1500);

          return res.json({ status: "success", messageId: sent?.key?.id || null });
        } catch (err) {
          console.error("⚠️ Webhook hatası:", err.message);
          return res.status(500).json({ error: err.message });
        }
      });

      // 📢 MANUEL CEVAP WEBHOOK'U (Realtime'a güvenmemek için)
      app.post("/webhook/response", async (req, res) => {
        try {
          const { complaintId, responseText: manualText, isQuestion } = req.body;
          if (!complaintId || !manualText) {
            return res.status(400).json({ status: "error", reason: "Missing payload" });
          }

          console.log(`\n   🔌 Webhook (Manuel Cevap) tetiklendi! Şikayet ID: ${complaintId}`);

          const { data: complaint, error: compError } = await supabase
            .from("complaints")
            .select("citizen_phone, citizen_name, status, source, language")
            .eq("id", complaintId)
            .single();

          if (compError || !complaint) {
            return res.status(404).json({ status: "error", reason: "Complaint not found" });
          }

          if (complaint.source !== "whatsapp_qr") {
            return res.json({ status: "ignored", reason: "Not whatsapp_qr" });
          }

          const activeSock = global.currentSock;
          if (!activeSock) {
            return res.status(500).json({ status: "error", reason: "Bot not connected" });
          }

          let jid = complaint.citizen_phone.includes("@")
            ? complaint.citizen_phone
            : `${complaint.citizen_phone}@s.whatsapp.net`;

          const myJid = activeSock.user?.id;
          if (myJid) {
            const myBareId = myJid.split(":")[0].split("@")[0];
            if (complaint.citizen_phone === myBareId) jid = myJid;
          }

          const exactJid = global.activeJids.get(complaint.citizen_phone);
          if (exactJid) {
            jid = exactJid;
          }

          const trackingNo = complaintId.substring(0, 8).toUpperCase();
          let msgText;
          const loc = getLocalizedMessages(complaint.language);

          if (isQuestion || complaint.status === "vatandas_yaniti_bekleniyor") {
            msgText =
              `${loc.infoTitle}\n\n` +
              `${loc.dear} *${complaint.citizen_name || "Vatandaş"}*,\n\n` +
              `📋 ${loc.trackingNo}: ${mono(trackingNo)}\n\n` +
              `${loc.infoBody}\n"${manualText}"\n\n` +
              `${loc.infoFooter}`;
          } else {
            const statusEmoji = complaint.status === "cozuldu" ? "✅" : "📢";
            const statusText =
              complaint.status === "cozuldu" ? loc.statusResolved : loc.statusUpdated;

            msgText =
              `${statusEmoji} ${loc.generalTitle}\n\n` +
              `${loc.dear} *${complaint.citizen_name || "Vatandaş"}*,\n` +
              `Şikayetinizin durumu *${statusText}* olarak güncellenmiştir.\n\n` +
              `${loc.infoDesc}\n"${manualText}"\n\n` +
              `${loc.greeting}`;
          }

          console.log(`   📤 Sohbet aktifleştiriliyor ve sendMessage çağrılıyor...`);
          try {
            await activeSock.presenceSubscribe(jid);
            await new Promise((r) => setTimeout(r, 500));
            await activeSock.sendPresenceUpdate("composing", jid);
            await new Promise((r) => setTimeout(r, 1000));
            await activeSock.sendPresenceUpdate("paused", jid);
          } catch (e) {}

          const sent = await activeSock.sendMessage(jid, { text: msgText });
          console.log(`   📬 sendMessage sonucu:`, JSON.stringify(sent?.key || "BOŞ"));
          console.log(
            `   💬 Manuel Cevap Webhook aracılığıyla iletildi (${complaint.citizen_phone})`,
          );

          res.json({ status: "success", messageId: sent?.key?.id || "unknown" });
        } catch (error) {
          console.error("⚠️ Webhook hatası:", error.message);
          res.status(500).json({ status: "error", reason: error.message });
        }
      });

      // Zaten dinlemede olan bir express sunucusu varsa tekrar başlatmamak için global nesnede tutalım
      if (!global.webhookServer) {
        global.webhookServer = app.listen(3001, () => {
          console.log("   🔌 Webhook sunucusu port 3001 üzerinden dinleniyor...");
        });
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errorMsg = lastDisconnect?.error?.message || "Bilinmeyen hata";
      console.log(`🔴 Bağlantı kapandı: statusCode=${statusCode}, hata=${errorMsg}`);

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔄 3 saniye sonra yeniden bağlanılıyor...");
        setTimeout(() => startBot(), 3000);
      } else {
        console.log("🔴 Oturum kapatıldı. Eski auth temizleniyor...");
        const fs = await import("fs");
        fs.rmSync("./.baileys_auth", { recursive: true, force: true });
        console.log("🔄 Temiz oturum ile yeniden başlatılıyor...");
        setTimeout(() => startBot(), 1000);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // (messages.update iptal edildi, anket oyları upsert içinde pollUpdateMessage olarak geliyor)

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log(">>> MESSAGES.UPSERT TETIKLENDI, type:", type);
    // 'append' tipinde sadece anket oylarını işle, şikayet akışını tetikleme
    const isNotify = type === "notify";

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (jid && messageQueues.has(jid)) {
        try {
          await messageQueues.get(jid);
        } catch (e) {}
      }

      let resolvePromise = () => {};
      const currentPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      if (jid) {
        messageQueues.set(jid, currentPromise);
      }

      try {
        if (!msg.message) continue;

        // Protokol mesajlarını yoksay
        if (msg.message.protocolMessage) continue;

        // Anket Yanıtı (Native Poll) Kontrolü - hem notify hem append'te işle
        if (msg.message.pollUpdateMessage) {
          console.log(">>> POLL UPDATE MESSAGE GELDİ!");
          try {
            const pollUpdateMsg = msg.message.pollUpdateMessage;
            const creationMsgKey = pollUpdateMsg.pollCreationMessageKey;
            const msgKeyId = creationMsgKey?.id;
            const meIdNorm = jidNormalizedUser(sock.user?.id);
            const pollCreatorJid = getKeyAuthor(creationMsgKey, meIdNorm);
            const voterJid = getKeyAuthor(msg.key, meIdNorm);
            const voterPhone = (msg.key.remoteJid || voterJid || "").split("@")[0];

            console.log(
              `>>> Oylanan Mesaj ID: ${msgKeyId}, Oy Veren: ${voterPhone}, pollCreatorJid: ${pollCreatorJid}, voterJid: ${voterJid}`,
            );

            const secretData = getPollSecret(msgKeyId);
            if (secretData && secretData.secret) {
              console.log(`>>> Secret bulundu! Poll ID: ${secretData.pollId}`);

              const pollEncKey = Buffer.from(secretData.secret, "base64");

              // WhatsApp LID ve normal JID kullanabiliyor, tüm kombinasyonları dene
              const meIdLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : null;
              const creationRemoteJid = creationMsgKey?.remoteJid || null;

              // Olası creator ve voter JID kombinasyonları
              const jidCombinations = [];
              // 1) Normal JID'ler
              jidCombinations.push({ creator: pollCreatorJid, voter: voterJid });
              // 2) LID JID'ler
              if (meIdLid) {
                jidCombinations.push({ creator: meIdLid, voter: meIdLid });
              }
              // 3) creationMsgKey.remoteJid ile
              if (creationRemoteJid) {
                jidCombinations.push({ creator: creationRemoteJid, voter: creationRemoteJid });
              }
              // 4) LID creator + normal voter
              if (meIdLid) {
                jidCombinations.push({ creator: meIdLid, voter: voterJid });
                jidCombinations.push({ creator: pollCreatorJid, voter: meIdLid });
              }

              console.log(`>>> ${jidCombinations.length} JID kombinasyonu denenecek...`);

              let decryptedVote = null;
              for (const combo of jidCombinations) {
                try {
                  decryptedVote = decryptPollVote(pollUpdateMsg.vote, {
                    pollEncKey,
                    pollCreatorJid: combo.creator,
                    pollMsgId: msgKeyId,
                    voterJid: combo.voter,
                  });
                  console.log(
                    `>>> Şifre çözüldü! Creator: ${combo.creator}, Voter: ${combo.voter}`,
                  );
                  break;
                } catch (decErr) {
                  console.log(
                    `>>> Kombinasyon başarısız (${combo.creator} / ${combo.voter}): ${decErr.message}`,
                  );
                }
              }

              if (!decryptedVote) {
                console.error(">>> Tüm JID kombinasyonları başarısız oldu!");
                continue;
              }

              console.log(">>> Çözülen Oy:", JSON.stringify(decryptedVote));

              // Seçilen şıkların hash'leri
              const selectedHashes = (decryptedVote?.selectedOptions || []).map((h) =>
                h.toString(),
              );
              console.log(">>> Seçilen hash'ler:", selectedHashes);

              if (selectedHashes.length > 0) {
                // DB'den anket şıklarını çek
                const { data: pollData, error: dbErr } = await supabase
                  .from("polls")
                  .select("id, title, question, poll_options(id, option_text, created_at)")
                  .eq("id", secretData.pollId)
                  .single();

                if (dbErr) {
                  console.error(">>> DB Poll çekme hatası:", dbErr.message);
                }

                if (pollData && pollData.poll_options) {
                  const { createHash } = await import("crypto");
                  const sortedOpts = pollData.poll_options.sort((a, b) =>
                    a.created_at.localeCompare(b.created_at),
                  );

                  // Her şık için SHA-256 hash oluştur
                  const optionHashMap = {};
                  for (const opt of sortedOpts) {
                    const hash = createHash("sha256")
                      .update(Buffer.from(opt.option_text))
                      .digest()
                      .toString();
                    optionHashMap[hash] = opt;
                  }
                  console.log(">>> Option Hash Map keys:", Object.keys(optionHashMap));

                  // Seçilen hash ile eşleştir
                  const matchedOpt = optionHashMap[selectedHashes[0]];
                  if (matchedOpt) {
                    console.log(
                      `   🗳️ Native Anket oyu alındı [${voterPhone}]: Poll ${pollData.id}, Şık: ${matchedOpt.option_text}`,
                    );

                    const { error: voteErr } = await supabase.from("poll_votes").upsert(
                      {
                        poll_id: pollData.id,
                        option_id: matchedOpt.id,
                        phone_number: voterPhone,
                      },
                      { onConflict: "poll_id, phone_number" },
                    );

                    if (voteErr) {
                      console.error("⚠️ Native Oy kaydedilemedi:", voteErr.message);
                    } else {
                      const ackMsg = `✅ *${pollData.title}* anketine oyunuz (*${matchedOpt.option_text}*) kaydedilmiştir. Görüşleriniz bizim için değerlidir!`;
                      const sent = await sock.sendMessage(msg.key.remoteJid, { text: ackMsg });
                      if (sent?.key?.id) addBotMessageId(sent.key.id);
                    }
                  } else {
                    console.log(">>> Eşleşen şık bulunamadı! Seçilen hash:", selectedHashes[0]);
                  }
                }
              } else {
                console.log(">>> Çözülen oyda selectedOptions boş!");
              }
            } else {
              console.log(`>>> Secret BULUNAMADI! msgKeyId: ${msgKeyId}`);
            }
          } catch (e) {
            console.error("⚠️ PollUpdate işlenirken hata:", e.message, e.stack);
          }
          continue;
        }

        // Eğer mesaj notify değilse (örn. append geçmiş mesajları), şikayet/anket akışını çalıştırma
        if (!isNotify) continue;

        const getBareId = (jid) => (jid ? jid.split(":")[0].split("@")[0] : null);
        const myJid = sock.user?.id;
        const myLid = sock.user?.lid;
        const myBareId = getBareId(myJid);
        const myLidBareId = getBareId(myLid);

        const remoteJid = msg.key.remoteJid || "";
        const remoteBareId = getBareId(remoteJid);
        const isSelfChat =
          !!remoteBareId && (remoteBareId === myBareId || remoteBareId === myLidBareId);

        const KOKSAL_NUMBER = "905454597000";
        const KOKSAL_LID = "78902861029557"; // Köksal'ın WhatsApp LID'si
        const isKoksal = remoteBareId === KOKSAL_NUMBER || remoteBareId === KOKSAL_LID;

        // Gerçek telefon numarasını belirle
        let rawPhone = resolveLidToPhone(remoteBareId);
        if (isSelfChat && myBareId) {
          rawPhone = myBareId; // Self chat'te LID yerine giriş yapılan bot hesabının gerçek telefonunu kullan
        } else if (isKoksal) {
          rawPhone = KOKSAL_NUMBER;
        } else if (remoteJid.endsWith("@lid")) {
          const altJid = msg.key.remoteJidAlt || msg.key.participantAlt;
          if (altJid && !altJid.includes("lid")) {
            rawPhone = getBareId(altJid);
          }
        }

        const basePhone = rawPhone ? rawPhone.split("-")[0] : "";
        let cleanPhone = basePhone.replace(/\D/g, "");
        if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
          cleanPhone = "90" + cleanPhone.substring(1);
        }
        if (cleanPhone.length === 10 && cleanPhone.startsWith("5")) {
          cleanPhone = "90" + cleanPhone;
        }
        let phone = cleanPhone;

        console.log(
          "   ℹ️ Normalized cleanPhone:",
          cleanPhone,
          "isSelfChat:",
          isSelfChat,
          "isKoksal:",
          isKoksal,
        );

        if (botMessageIds.has(msg.key.id)) {
          continue;
        }

        let actualMessage = msg.message;
        if (actualMessage?.ephemeralMessage?.message) {
          actualMessage = actualMessage.ephemeralMessage.message;
        } else if (actualMessage?.viewOnceMessage?.message) {
          actualMessage = actualMessage.viewOnceMessage.message;
        } else if (actualMessage?.viewOnceMessageV2?.message) {
          actualMessage = actualMessage.viewOnceMessageV2.message;
        }

        let text =
          actualMessage?.conversation ||
          actualMessage?.extendedTextMessage?.text ||
          actualMessage?.imageMessage?.caption ||
          actualMessage?.videoMessage?.caption ||
          actualMessage?.documentMessage?.caption ||
          "";

        const cameFromVoice = !!(actualMessage?.audioMessage || actualMessage?.ptvMessage);

        if ((actualMessage?.audioMessage || actualMessage?.ptvMessage) && openai) {
          try {
            console.log("   🎤 Ses kaydı alındı, metne dönüştürülüyor...");
            const audioBuffer = await downloadMediaMessage(msg, "buffer", {}, { logger });
            const tmpAudioPath = path.join(__dirname, `voice_${msg.key.id}.ogg`);
            fs.writeFileSync(tmpAudioPath, audioBuffer);

            const transcription = await openai.audio.transcriptions.create({
              file: fs.createReadStream(tmpAudioPath),
              model: "whisper-1",
            });
            text = transcription.text;
            console.log(`   📝 Sesten metne dönüştürüldü: "${text}"`);

            try {
              fs.unlinkSync(tmpAudioPath);
            } catch (e) {}
          } catch (err) {
            console.error("   ❌ Ses kaydı dönüştürme hatası:", err.message);
            text = "(Ses kaydı anlaşılamadı, lütfen şikayetinizi yazarak iletiniz.)";
          }
        }

        const lowerText = text.toLowerCase();

        // Grup mesajlarını yoksay
        if (msg.key.remoteJid.endsWith("@g.us")) continue;

        // Sadece kendi chat'lerimize cevap verme modu aktifse kontrol et
        const koksalEnabled = getBotSettings().koksalChatOnly === true;
        if (isSelfChatOnly() && !isSelfChat) {
          if (!(koksalEnabled && isKoksal)) {
            console.log(
              "   ℹ️ Blocking message from",
              cleanPhone,
              "(self‑chat only, Köksal disabled)",
            );
            continue;
          }
          console.log("   ✅ Köksal override aktif – mesaj işleniyor!");
        }

        // Eğer mesaj bizden gitmişse (fromMe = true)
        if (msg.key.fromMe) {
          // Sadece kendi kendimize (test amaçlı) yazdığımız mesajları şikayet olarak kabul et.
          // Vatandaşlara telefonumuzdan verdiğimiz cevapları (veya botun vatandaşlara attığı cevapları) yoksay!
          // Ancak Köksal override aktifse ve mesaj Köksal'a gidiyorsa, bunu da işle.
          console.log(
            "   ℹ️ fromMe:",
            msg.key.fromMe,
            "isSelfChat:",
            isSelfChat,
            "isKoksal:",
            isKoksal,
          );
          if (!isSelfChat && !(koksalEnabled && isKoksal)) {
            continue;
          }
        }

        let name = msg.pushName || "Vatandaş";
        const knownName = await getKnownCitizenName(phone);
        if (knownName) {
          name = knownName;
        }
        global.activeJids.set(phone, msg.key.remoteJid);
        const lowerTextTrim = text ? text.toLowerCase().trim() : "";

        // ── Ad-Soyad Kaydı Bekleniyorsa (KVKK & İsim Alma Akışı) ──
        if (pendingNameRequests.has(phone)) {
          const pendingReq = pendingNameRequests.get(phone);
          const userProvidedName = text ? text.trim() : "";

          if (isFullName(userProvidedName) && !/^(iptal|durum|sorgu)/i.test(userProvidedName)) {
            console.log(`   👤 Vatandaş tam ad-soyad bildirdi [${phone}]: "${userProvidedName}"`);
            name = userProvidedName;
            pendingNameRequests.delete(phone);
            if (pendingReq && pendingReq.originalText) {
              text = pendingReq.originalText;
              if (pendingReq.curImageBuffer) curImageBuffer = pendingReq.curImageBuffer;
              if (pendingReq.curImageMime) curImageMime = pendingReq.curImageMime;
              if (pendingReq.visionAnalysis) visionAnalysis = pendingReq.visionAnalysis;
            }
          } else {
            const askNameAgain = `Sayın vatandaşımız, başvurunuzu kaydedebilmemiz için lütfen **Adınızı ve Soyadınızı** (örnek: Ahmet Yılmaz) en az iki kelime olacak şekilde eksiksiz yazınız.\n\n📄 *KVKK Aydınlatma Metni: https://alanya.bel.tr/kvkk*\nℹ️ *Adınızı ve soyadınızı iletmeniz halinde KVKK Aydınlatma Metni'ni okuduğunuz ve kabul ettiğiniz varsayılmaktadır.*`;
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: askNameAgain });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
            await speakIfVoice(sock, msg, askNameAgain, "tr", cameFromVoice);
            continue;
          }
        }

        // ── Memnuniyet Anketi Kontrolü ──
        if (pendingSurveys.has(phone)) {
          const complaintId = pendingSurveys.get(phone);

          // Şikayetin dilini öğren
          const { data: survComp } = await supabase
            .from("complaints")
            .select("language")
            .eq("id", complaintId)
            .single();
          const loc = getLocalizedMessages(survComp?.language);
          const voiceComp = isVoiceComplaint(complaintId);

          // Puanı rakamdan VEYA sözcükten (bir–beş / one–five) çöz — sesle de girilebilsin
          let score = parseSurveyScore(lowerTextTrim);
          console.log(`   🔢 Anket puanı çözümü: giriş="${lowerTextTrim}" → ${score}`);

          // Sesli yanıtta çözülemezse: kısa klip Whisper'ı yanıltmış olabilir; rakam odaklı
          // prompt + dil ipucuyla SESİ YENİDEN çözümleyip tekrar dene.
          if (!score && openai && (actualMessage?.audioMessage || actualMessage?.ptvMessage)) {
            try {
              const ab = await downloadMediaMessage(msg, "buffer", {}, { logger });
              const tp = path.join(__dirname, `sv_${msg.key.id}.ogg`);
              fs.writeFileSync(tp, ab);
              const tr = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tp),
                model: "whisper-1",
                language: normLang(survComp?.language) === "tr" ? "tr" : undefined,
                prompt:
                  "Vatandaş memnuniyet anketine tek bir rakam söylüyor: bir, iki, üç, dört veya beş.",
              });
              try {
                fs.unlinkSync(tp);
              } catch (e) {}
              console.log(
                `   🔁 Anket için sesi yeniden çözümledim: "${tr.text}" → ${parseSurveyScore(tr.text)}`,
              );
              score = parseSurveyScore(tr.text);
            } catch (e) {
              console.error("   ⚠️ Anket sesi yeniden çözümleme hatası:", e.message);
            }
          }

          if (score && score >= 1 && score <= 5) {
            console.log(
              `   📊 Anket yanıtı alındı [${phone}]: ${score} (Şikayet ID: ${complaintId})`,
            );
            const { error: surveyError } = await supabase
              .from("complaints")
              .update({ satisfaction_score: score })
              .eq("id", complaintId);

            if (surveyError) {
              console.error("⚠️ Anket puanı kaydedilemedi:", surveyError.message);
            }
            pendingSurveys.delete(phone);

            const thanksMsg = loc.surveyThanks;
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: thanksMsg });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
            if (voiceComp)
              await sendVoiceNote(sock, msg.key.remoteJid, thanksMsg, survComp?.language);
            continue;
          } else {
            const warnMsg = loc.surveyWarn;
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: warnMsg });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
            if (voiceComp)
              await sendVoiceNote(sock, msg.key.remoteJid, warnMsg, survComp?.language);
            continue;
          }
        }

        // ── Temsilci Talebi Kontrolü ──
        if (
          lowerTextTrim === "temsilci" ||
          lowerTextTrim === "temsilci ile görüş" ||
          lowerTextTrim === "temsilci ile gorus"
        ) {
          console.log(`   📞 Temsilci talebi algılandı [${phone}]`);
          // Vatandaşın en son aktif şikayetini bulup temsilci talebini işaretleyelim
          const { data: lastComplaint } = await supabase
            .from("complaints")
            .select("id")
            .eq("citizen_phone", phone)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastComplaint) {
            await supabase
              .from("complaints")
              .update({ wants_human_representative: true })
              .eq("id", lastComplaint.id);
          }

          const repMsg = `Talebiniz alınmıştır. Gerçek temsilcimiz en kısa sürede sizinle iletişime geçecektir. Teşekkür ederiz.`;
          const sent = await sock.sendMessage(msg.key.remoteJid, { text: repMsg });
          if (sent?.key?.id) addBotMessageId(sent.key.id);
          continue;
        }

        // ── Şikayet Durum Sorgusu (takip numarası ile) ──
        // Vatandaş "durum 1A2B3C4D", "sorgu 1A2B3C4D" ya da sadece takip numarasını
        // yazarak şikayetinin son durumunu öğrenebilir. Takip no = UUID'nin ilk 8 hanesi.
        {
          const codeM = (text || "").toUpperCase().match(/\b([0-9A-F]{8})\b/);
          const trackCode = codeM ? codeM[1] : null;
          const statusKw =
            /(durum|sorgu|sorgula|takip|nerede kald|ne oldu|ne durumda|hangi a[sş]ama|ak[iı]bet|status|track)/i.test(
              lowerTextTrim,
            );
          // Mesaj neredeyse yalnızca koddan mı ibaret? (etiket kelimeleri temizlenir)
          // Not: Türkçe "ş" gibi harflerde \b güvenilmez olduğundan word-boundary kullanılmaz.
          const cleaned = lowerTextTrim
            .replace(/[#:.\-()]/g, " ")
            .replace(/(takip\s*no|takip|numaras[iı]|numara|[sş]ikayet\s*no|[sş]ikayet|no)/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();
          const codeOnly = trackCode && cleaned === trackCode;
          // Anahtar kelime + kod yolu YALNIZCA kısa mesajlarda geçerli; böylece içinde
          // "durum" ya da "takip" gibi bir kelime + kod benzeri bir dizi geçen UZUN şikayetler
          // yanlışlıkla durum sorgusu sayılmaz. (codeOnly zaten kısa mesajdır.)
          const shortMsg = lowerTextTrim.length <= 100;
          // Numara verilmeden, kısa ve açık bir durum-sorgu ifadesiyle gelinmişse numara iste.
          const askStatusNoCode =
            !trackCode &&
            lowerTextTrim.length <= 100 &&
            /^(durum|sorgu|takip|[sş]ikayet durumu|[sş]ikayetim ne durumda|durumu ne|[sş]ikayet sorgula|status|track)\b/i.test(
              lowerTextTrim,
            );

          console.log("   🔍 DEBUG STATUS CHECK:", {
            text,
            trackCode,
            statusKw,
            cleaned,
            codeOnly,
            shortMsg,
            isMatch: !!(trackCode && ((statusKw && shortMsg) || codeOnly)),
          });

          if (trackCode && ((statusKw && shortMsg) || codeOnly)) {
            console.log(`   🔎 Durum sorgusu [${phone}]: ${trackCode}`);
            const { data: myComplaints, error: qErr } = await supabase
              .from("complaints")
              .select(
                "id, status, category, created_at, resolved_at, neighborhood_id, assigned_department_id, language, complaint_text",
              )
              .eq("citizen_phone", phone)
              .order("created_at", { ascending: false })
              .limit(50);
            if (qErr) console.error("   ⚠️ Durum sorgusu DB hatası:", qErr.message);
            const found = (myComplaints || []).find(
              (c) => c.id.substring(0, 8).toUpperCase() === trackCode,
            );
            const qLang = found?.language || (/status|track/i.test(lowerTextTrim) ? "en" : "tr");

            let statusMsg;
            if (found && found.status === "cozuldu" && !shouldSendStatus(found.id)) {
              console.log("   ⚠️ Duplicate solved status suppressed for", found.id);
              continue;
            }
            if (found) {
              const nbr = found.neighborhood_id
                ? neighborhoodsCache.find((n) => n.id === found.neighborhood_id)
                : null;
              const dept = found.assigned_department_id
                ? departmentsCache.find((d) => d.id === found.assigned_department_id)
                : null;
              const subjectRaw = (found.complaint_text || "").replace(/\s+/g, " ").trim();
              const subject = subjectRaw
                ? subjectRaw.length > 80
                  ? subjectRaw.slice(0, 80) + "…"
                  : subjectRaw
                : null;
              statusMsg = msgComplaintStatus(qLang, {
                trackingNo: trackCode,
                statusLabel: statusLabelML(found.status, qLang),
                category: found.category || null,
                createdText: formatDateTimeLocal(found.created_at, qLang),
                resolvedText: found.resolved_at
                  ? formatDateTimeLocal(found.resolved_at, qLang)
                  : null,
                nbrName: nbr ? nbr.name : null,
                deptName: dept ? dept.name : null,
                subject,
                resolved: found.status === "cozuldu",
              });
            } else {
              statusMsg = msgStatusNotFound(qLang, trackCode);
            }
            const sentStatus = await sock.sendMessage(msg.key.remoteJid, { text: statusMsg });
            if (sentStatus?.key?.id) addBotMessageId(sentStatus.key.id);
            await speakIfVoice(sock, msg, statusMsg, qLang, cameFromVoice);
            continue;
          }

          if (askStatusNoCode) {
            console.log(`   🔎 Durum sorgusu (numara yok) [${phone}]`);
            const sentAsk = await sock.sendMessage(msg.key.remoteJid, {
              text: msgAskTrackingNo(/status|track/i.test(lowerTextTrim) ? "en" : "tr"),
            });
            if (sentAsk?.key?.id) addBotMessageId(sentAsk.key.id);
            continue;
          }
        }

        const wantsNewComplaint =
          lowerTextTrim === "yeni şikayet" || lowerTextTrim === "yeni sikayet";

        if (wantsNewComplaint) {
          console.log(
            `   🔄 Kullanıcı yeni şikayet talep etti. '${phone}' için bekleyen eski şikayetlerin durumu 'incelemede' olarak güncelleniyor...`,
          );
          const { error: updateError } = await supabase
            .from("complaints")
            .update({ status: "incelemede" })
            .eq("citizen_phone", phone)
            .eq("status", "vatandas_yaniti_bekleniyor");
          if (updateError) {
            console.error(
              "⚠️ Eski bekleyen şikayetler güncellenirken hata oluştu:",
              updateError.message,
            );
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
          lowerText.includes("vatandaş") ||
          lowerText.includes("belediye") ||
          lowerText.includes("takip numara") ||
          text.startsWith("✅") ||
          text.startsWith("⚠️")
        ) {
          console.log(`   ℹ️ Mesaj döngü engeline takıldı (yoksayılıyor): "${text}"`);
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

        console.log(
          `\n📩 Yeni Mesaj [${phone}]: ${isLocation ? "(Konum Paylaşımı)" : text ? text.substring(0, 50) + "..." : "(Medya)"}`,
        );

        // Bekleyen şikayet kontrolü / iptal işlemi
        let pending = pendingComplaints.get(phone);
        if (
          pending &&
          (lowerTextTrim === "iptal" ||
            lowerTextTrim.includes("vazgeç") ||
            lowerTextTrim.includes("vazgectim"))
        ) {
          pendingComplaints.delete(phone);
          const sent = await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Şikayet talebiniz iptal edilmiştir. Yeni bir mesaj gönderebilirsiniz.",
          });
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

          // Koordinattan detaylı adresi (sokak, cadde, mevki) otomatik çıkar
          const geo = await reverseGeocode(locLat, locLng);
          const locAddress = geo ? geo.full : null;
          if (locAddress) {
            console.log(`   🗺️ Detaylı adres: ${locAddress}`);
          }

          // Adres metnindeki mahalle adı, en yakın merkez (centroid) tahmininden daha doğrudur.
          const geoNbr = geo ? matchNeighborhood(geo.full) || matchNeighborhood(geo.short) : null;
          if (geoNbr) {
            locationNbr = geoNbr;
            console.log(`   📍 Adresten eşleşen mahalle: ${geoNbr.name}`);
          }

          if (pending && pending.text) {
            // Önce şikayet metnini yazmıştı, şimdi konumu yolladı
            console.log(
              `   🗂️ Bekleyen şikayet metni ile konum birleştiriliyor: "${pending.text}"`,
            );

            let analysis;
            if (pending.visionAnalysis) {
              analysis = pending.visionAnalysis; // foto daha önce gelmişti → görsel analizini kullan
              console.log("   📊 Analiz kaynağı: önceki fotoğraf (saklı vision) + konum");
            } else {
              const textToAnalyze = `Önceki şikayet konusu: "${pending.text}". Şikayetin gerçekleştiği mahalle bilgisi: "${locationNbr ? locationNbr.name : ""}".`;
              console.log("   🤖 Yapay zeka analizi yapılıyor (Konum birleşimi)...");
              analysis = await analyzeWithAI(textToAnalyze);
            }

            let departmentId = null;
            if (analysis.department) {
              const foundDept = matchDepartment(analysis.department);
              if (foundDept) departmentId = foundDept.id;
            }

            // ── Mükerrer / benzer şikayet kontrolü ──
            const dupLoc = await findDuplicateComplaint({
              neighborhoodId: locationNbr ? locationNbr.id : null,
              category: analysis.category,
              text: pending.text,
            });
            if (dupLoc) {
              pendingComplaints.delete(phone);
              const dupLang = (pending && pending.language) || analysis.language || "tr";
              const dupMsg = msgDuplicateComplaint(dupLang, {
                nbrName: locationNbr ? locationNbr.name : null,
                category: analysis.category || "Diğer",
                agoText: formatAgo(dupLoc.created_at, dupLang),
                trackingNo: dupLoc.id.substring(0, 8).toUpperCase(),
              });
              const sentDup = await sock.sendMessage(msg.key.remoteJid, { text: dupMsg });
              if (sentDup?.key?.id) {
                addBotMessageId(sentDup.key.id);
              }
              continue;
            }

            const { data: complaint, error: dbError } = await supabase
              .from("complaints")
              .insert([
                {
                  citizen_phone: phone,
                  citizen_name: name,
                  complaint_text: pending.text,
                  status: "yeni",
                  source: "whatsapp_qr",
                  language: analysis.language || "tr",
                  neighborhood_id: locationNbr ? locationNbr.id : null,
                  address: locAddress,
                  latitude: locLat,
                  longitude: locLng,
                },
              ])
              .select()
              .single();

            if (dbError) throw dbError;
            if (cameFromVoice || (pending && pending.voice)) markVoiceComplaint(complaint.id);

            await supabase
              .from("complaints")
              .update({
                category: analysis.category || "Diğer",
                ai_category: analysis.category,
                ai_department_id: departmentId,
                assigned_department_id: departmentId,
                priority: analysis.priority,
              })
              .eq("id", complaint.id);

            // Foto daha önce gelmişse şikayete ekle
            if (pending.imageBuffer) {
              const fileUrl = await uploadMediaToSupabase(
                pending.imageBuffer,
                phone,
                pending.imageContentType || "image/jpeg",
              );
              if (fileUrl) {
                await supabase
                  .from("complaint_attachments")
                  .insert([{ complaint_id: complaint.id, file_url: fileUrl, file_type: "image" }]);
                console.log("   ✅ Önceki fotoğraf şikayete eklendi.");
              }
            }

            pendingComplaints.delete(phone);

            // Dil: önce şikayet metninin dili (pending), yoksa mevcut analiz
            const replyLang = (pending && pending.language) || analysis.language || "tr";
            const reply = msgLocationConfirmation(replyLang, {
              name,
              nbrName: locationNbr ? locationNbr.name : null,
              category: analysis.category,
              department:
                analysis.department ||
                (normLang(replyLang) === "tr" ? "İlgili Müdürlük" : "Relevant Department"),
              addressShort: geo && geo.short ? geo.short : null,
              trackingNo: complaint.id.substring(0, 8).toUpperCase(),
            });

            const sent = await sock.sendMessage(msg.key.remoteJid, { text: reply });
            if (sent?.key?.id) {
              addBotMessageId(sent.key.id);
            }
            await speakIfVoice(
              sock,
              msg,
              reply,
              replyLang,
              cameFromVoice || (pending && pending.voice),
            );
            continue;
          } else {
            // Önce konumu yolladı, şikayet detayını sonra yazacak
            pendingComplaints.set(phone, {
              lat: locLat,
              lng: locLng,
              neighborhoodId: locationNbr ? locationNbr.id : null,
              neighborhoodName: locationNbr ? locationNbr.name : null,
              address: locAddress,
              voice: cameFromVoice,
              timestamp: Date.now(),
            });

            const reply =
              `📍 Gönderdiğiniz konuma göre ${locationNbr ? locationNbr.name + " Mahallesi" : "Alanya"} sınırlarında olduğunuzu tespit ettik.\n\n` +
              (geo && geo.short ? `🗺️ Tespit edilen adres: ${geo.short}\n\n` : "") +
              `Lütfen bu bölgedeki şikayetinizin/talebinizin detaylarını yazar mısınız?`;

            const sent = await sock.sendMessage(msg.key.remoteJid, { text: reply });
            if (sent?.key?.id) {
              addBotMessageId(sent.key.id);
            }
            await speakIfVoice(sock, msg, reply, "tr", cameFromVoice);
            continue;
          }
        }

        // ── Bekleyen (konum/mahalle bekleyen) şikayet koruması ─────
        // Vatandaş, önceki şikayetinin konumunu vermeden yeni bir şikayet YAZARSA,
        // ikinci mesajı sessizce birincinin "mahalle bilgisi" sanıp akışı kilitleme.
        // Bunun yerine açıkça: önce konum/mahalle iste ya da "iptal" yönlendirmesi yap.
        // (İptal / "yeni şikayet" / konum paylaşımı / mahalle adı yazma yukarıda işlenir.)
        if (pending && pending.text && !isLocation) {
          const pendingFresh = Date.now() - (pending.timestamp || 0) < 5 * 60 * 1000;
          if (!pendingFresh) {
            // Bekleme süresi dolmuş → eski şikayeti düşür, bu mesaj yeni şikayet gibi işlensin.
            console.log("   ⌛ Bekleyen şikayet zaman aşımına uğradı, düşürülüyor.");
            pendingComplaints.delete(phone);
          } else {
            const _guardMsgType = Object.keys(actualMessage || msg.message)[0];
            const _isMediaMsg =
              _guardMsgType === "imageMessage" ||
              _guardMsgType === "documentMessage" ||
              _guardMsgType === "videoMessage";
            const _providesLocation = !!(text && text.trim() && matchNeighborhood(text));
            const isSkipMedia = lowerTextTrim === "yok" || lowerTextTrim === "geç" || lowerTextTrim === "gec" || lowerTextTrim === "hayır" || lowerTextTrim === "skip";



            // AWAITING_LOCATION_AFTER_MEDIA_ASK adımındayken fotoğraf/video gelirse, AI Vision'a girmeden direkt kaydet
            if (pending.state === "AWAITING_LOCATION_AFTER_MEDIA_ASK" && _isMediaMsg) {
              console.log("   📷 Kullanıcı medya gönderdi (AI Vision analizi atlanıyor).");
              let downloadBuffer = null;
              let downloadMime = null;
              try {
                downloadBuffer = await downloadMediaMessage(msg, "buffer", {}, { logger });
                if (_guardMsgType === "imageMessage") {
                  downloadMime = msg.message.imageMessage.mimetype || "image/jpeg";
                } else if (_guardMsgType === "videoMessage") {
                  downloadMime = msg.message.videoMessage.mimetype || "video/mp4";
                } else if (_guardMsgType === "documentMessage") {
                  downloadMime = msg.message.documentMessage.mimetype || "application/octet-stream";
                }
              } catch (e) {
                console.error("   ⚠️ Medya indirme hatası:", e.message);
              }

              if (downloadBuffer) {
                pending.imageBuffer = downloadBuffer;
                pending.imageContentType = downloadMime;
              }

              // Mahalle zaten biliniyorsa doğrudan kayıt adımına geç
              if (pending.neighborhoodId) {
                console.log("   ✅ Medya alındı, mahalle zaten biliniyor → kayıt adımına geçiliyor.");
                pending.state = "READY_TO_SAVE";
                // state'i READY_TO_SAVE yaparak aşağıda şikayet oluşturma adımına düşmesini sağlıyoruz
              } else {
                pending.state = "AWAITING_LOCATION";
                let askBase = msgAskNeighborhood(pending.language || "tr", name);
                askBase = askBase.replace(/[^.]*102 mahalle[^.]*\./gi, "").trim();
                let askReply = askBase + msgLocationHint(pending.language || "tr");
                if (cameFromVoice || pending.voice) askReply = voiceify(askReply, pending.language || "tr");
                const sent = await sock.sendMessage(msg.key.remoteJid, { text: askReply });
                if (sent?.key?.id) addBotMessageId(sent.key.id);
                await speakIfVoice(sock, msg, askReply, pending.language || "tr", cameFromVoice);
                continue;
              }
            }

            if (text && text.trim().length > 0 && !_providesLocation && !_isMediaMsg) {
              if (pending.state === "AWAITING_LOCATION_AFTER_MEDIA_ASK" && isSkipMedia) {
                console.log("   ⏭️ Kullanıcı medya eklemeyi geçti.");
                // Mahalle zaten biliniyorsa doğrudan kayıt adımına geç
                if (pending.neighborhoodId) {
                  console.log("   ✅ Mahalle zaten biliniyor → kayıt adımına geçiliyor.");
                  pending.state = "READY_TO_SAVE";
                  // continue etme, aşağıdaki şikayet oluşturma akışına düşsün
                } else {
                  pending.state = "AWAITING_LOCATION";
                  let askBase = msgAskNeighborhood(pending.language || "tr", name);
                  askBase = askBase.replace(/[^.]*102 mahalle[^.]*\./gi, "").trim();
                  let askReply = askBase + msgLocationHint(pending.language || "tr");
                  if (cameFromVoice || pending.voice) askReply = voiceify(askReply, pending.language || "tr");
                  const sent = await sock.sendMessage(msg.key.remoteJid, { text: askReply });
                  if (sent?.key?.id) addBotMessageId(sent.key.id);
                  await speakIfVoice(sock, msg, askReply, pending.language || "tr", cameFromVoice);
                  continue;
                }
              }

              console.log(
                "   🚧 Bekleyen şikayet varken konum yerine yeni metin geldi → yönlendirme yapılıyor.",
              );
              pending.timestamp = Date.now(); // bekleme süresini tazele
              
              let guardMsg;
              if (pending.state === "AWAITING_LOCATION_AFTER_MEDIA_ASK") {
                guardMsg = {
                  tr: "⚠️ Şikayetinizi kaydetmek için lütfen medya (fotoğraf/video) gönderin veya geçmek için *Yok* yazın.",
                  en: "⚠️ To save your complaint, please send media (photo/video) or type *Yok* to skip.",
                  de: "⚠️ Um Ihre Beschwerde zu speichern, senden Sie bitte Medien (Foto/Video) oder schreiben Sie *Yok*, um fortzufahren.",
                  ru: "⚠️ Чтобы сохранить жалобу, отправьте медиа (фото/видео) или напишите *Yok*, чтобы пропустить."
                }[normLang(pending.language)] || "⚠️ Şikayetinizi kaydetmek için lütfen medya (fotoğraf/video) gönderin veya geçmek için *Yok* yazın.";
              } else {
                guardMsg = msgPendingLocationGuard(pending.language || "tr", pending.text);
              }
              if (cameFromVoice || pending.voice)
                guardMsg = voiceify(guardMsg, pending.language || "tr");
              const sent = await sock.sendMessage(msg.key.remoteJid, { text: guardMsg });
              if (sent?.key?.id) {
                addBotMessageId(sent.key.id);
              }
              await speakIfVoice(sock, msg, guardMsg, pending.language || "tr", cameFromVoice);
              continue;
            }
          }
        }


        // ── 0) Fotoğraf varsa AI Vision ile analiz et ──────────────
        const _curMsgType = Object.keys(actualMessage || msg.message)[0];
        let curImageBuffer = null,
          curImageMime = null,
          visionAnalysis = null;
        if (_curMsgType === "imageMessage") {
          try {
            curImageBuffer = await downloadMediaMessage(msg, "buffer", {}, { logger });
            curImageMime = msg.message.imageMessage.mimetype || "image/jpeg";
            console.log("   🖼️ Fotoğraf AI (vision) ile analiz ediliyor...");
            visionAnalysis = await analyzeImageWithAI(curImageBuffer, curImageMime, text);
            console.log("   📊 Görsel analizi:", JSON.stringify(visionAnalysis));
          } catch (e) {
            console.error("   ⚠️ Fotoğraf indirme/analiz hatası:", e.message);
          }
        }

        let textToAnalyze = text;
        if (pending && Date.now() - pending.timestamp < 5 * 60 * 1000) {
          if (pending.text) {
            textToAnalyze = `Önceki şikayet konusu: "${pending.text}". Şikayetin gerçekleştiği mahalle bilgisi: "${text}".`;
          } else if (pending.lat !== undefined) {
            textToAnalyze = `Şikayet konusu: "${text}". Şikayetin gerçekleştiği mahalle bilgisi: "${pending.neighborhoodName || ""}".`;
          }
          console.log(`📌 Bekleyen oturum verisi birleştirildi: ${textToAnalyze}`);
        }

        // ── 1) AI ile Önce Analiz Et ──────────────────────────────
        let analysis;
        if (visionAnalysis) {
          // Bu mesajda fotoğraf var → görsel analizini kullan
          analysis = visionAnalysis;
          console.log("   📊 Analiz kaynağı: FOTOĞRAF (vision)");
        } else if (pending && pending.visionAnalysis) {
          // Fotoğraf daha önce gelmişti, şimdi mahalle/konum yazıldı → saklı görsel analizini kullan
          analysis = pending.visionAnalysis;
          console.log("   📊 Analiz kaynağı: önceki fotoğraf (saklı vision)");
        } else if (pending && pending.analysis) {
          // İlk mesajda yapılan metin analizi zaten kaydedilmişti → tekrar AI'a gitme
          analysis = pending.analysis;
          console.log("   ⚡ Analiz kaynağı: önceki metin analizi (saklı, AI tekrar çağrılmadı)");
        } else if (textToAnalyze && textToAnalyze.trim().length > 3) {
          console.log("   🤖 Yapay zeka analizi yapılıyor...");
          analysis = await analyzeWithAI(textToAnalyze);
          console.log("   📊 Analiz Sonucu:", JSON.stringify(analysis, null, 2));
        } else {
          analysis = {
            category: "Diğer",
            department: "",
            neighborhood: null,
            address: null,
            priority: "orta",
            auto_response: "",
            send_pdfs: [],
            interaction_type: "sikayet",
            language: "tr",
          };
        }

        // ── 2) Bilgi Talebi mi, Şikayet mi? ─────────────────────
        if (analysis.interaction_type === "bilgi") {
          // ─── BİLGİ TALEBİ: Şikayet tablosuna kaydetme, ai_bot_logs'a yaz ───
          console.log("   ℹ️ Bilgi talebi tespit edildi, şikayet kaydı OLUŞTURULMUYOR.");

          await supabase.from("ai_bot_logs").insert([
            {
              question: text || "(Medya)",
              answer: analysis.auto_response || "Bilgi verildi.",
              related_filters: {
                citizen_phone: phone,
                citizen_name: name,
                category: analysis.category,
                department: analysis.department,
                language: analysis.language || "tr",
                source: "whatsapp_qr",
              },
            },
          ]);

          // Vatandaşa bilgi cevabını gönder
          const infoReply =
            analysis.auto_response ||
            `Sayın ${name}, bilgi talebiniz için teşekkür ederiz. Alanya Belediyesi olarak size yardımcı olmaktan memnuniyet duyarız. 😊`;

          const sent = await sock.sendMessage(msg.key.remoteJid, { text: infoReply });
          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }
          await speakIfVoice(sock, msg, infoReply, analysis.language, cameFromVoice);

          // PDF gönder (birden fazla PDF destekli)
          const pdfsToSend =
            analysis.send_pdfs || (analysis.send_pdf ? ["nikah-evraklari.pdf"] : []);
          for (const pdfFileName of pdfsToSend) {
            const pdfMeta = pdfConfig.pdfs.find((p) => p.dosya === pdfFileName);
            const displayName = pdfMeta
              ? pdfMeta.goruntu_adi.replace(/\s+/g, "_") + ".pdf"
              : pdfFileName;
            const pdfFilePath = path.join(__dirname, "assets", pdfFileName);
            if (fs.existsSync(pdfFilePath)) {
              console.log(`   📄 PDF gönderiliyor: ${pdfFileName}`);
              const pdfBuffer = fs.readFileSync(pdfFilePath);
              const sentDoc = await sock.sendMessage(msg.key.remoteJid, {
                document: pdfBuffer,
                mimetype: "application/pdf",
                fileName: displayName,
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

          // Vatandaşın daha önce kaydedilmiş tam ad-soyadı (en az 2 kelime) yoksa Ad ve Soyadını iste
          if (!isFullName(name) && !pendingNameRequests.has(phone)) {
            console.log(
              `   ⚠️ Vatandaşın kayıtlı geçerli Adı-Soyadı yok (${name}), isim ve KVKK bilgilendirmesi isteniyor...`,
            );
            pendingNameRequests.set(phone, {
              originalText: text,
              curImageBuffer,
              curImageMime,
              visionAnalysis,
              timestamp: Date.now(),
            });

            const askNameKvkk = `🏛️ *Alanya Belediyesi AI Asistanı*\n\nSayın vatandaşımız, başvurunuzun takibi ve KVKK (6698 Sayılı Kanun) bilgilendirmesi uyarınca tarafınıza dönüş yapılabilmesi için lütfen **Adınızı ve Soyadınızı** (örnek: Ahmet Yılmaz) yazınız.\n\n📄 *KVKK Aydınlatma Metni: https://alanya.bel.tr/kvkk*\nℹ️ *Adınızı ve soyadınızı iletmeniz halinde KVKK Aydınlatma Metni'ni okuduğunuz ve kabul ettiğiniz varsayılmaktadır.*`;
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: askNameKvkk });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
            await speakIfVoice(sock, msg, askNameKvkk, analysis?.language || "tr", cameFromVoice);
            continue;
          }

          // AI Sonuçlarına göre Müdürlük bul
          let departmentId = null;
          if (analysis.department) {
            const foundDept = matchDepartment(analysis.department);
            if (foundDept) departmentId = foundDept.id;
          }

          // Mahalle bul: 1) konumdan gelen, 2) AI'ın bulduğu ad, 3) kullanıcının yazdığı ham metin
          let neighborhoodId = null;
          let matchedNbr = null;
          let manualLocationText = null;
          if (pending && pending.neighborhoodId) {
            neighborhoodId = pending.neighborhoodId;
          } else {
            if (analysis.neighborhood) matchedNbr = matchNeighborhood(analysis.neighborhood);
            // AI mahalleyi yakalayamadıysa, kullanıcının yazdığı mesajda mahalle adını doğrudan ara
            if (!matchedNbr && text) matchedNbr = matchNeighborhood(text);
            if (matchedNbr) neighborhoodId = matchedNbr.id;
            // Kullanıcı bir şikayet metni bekleniyorken konum/mahalle bilgisini yazdıysa,
            // yazdığı metni (örn. "Saray Mahallesi Barbaros Caddesi No:5") adres detayı olarak sakla.
            if (matchedNbr && pending && pending.text && text) manualLocationText = text.trim();
          }

          // Mahalle bulunamadıysa veritabanına ekleme, kullanıcıya sor
          if (!neighborhoodId) {
            console.log(
              "   ⚠️ Mahalle belirlenemedi veya bulunamadı, şikayet kaydı veritabanına OLUŞTURULMUYOR.",
            );

            // Şikayetin dilini bekleyen kayda taşı (konum adımında da aynı dilde cevap verebilmek için)
            const askLang = analysis.language || "tr";
            // Eğer henüz bekleyen bir şikayet yoksa, bu orijinal şikayet metnini (ve varsa fotoğrafı) hafızaya alalım
            if (!pending) {
              const _initialMsgType = Object.keys(actualMessage || msg.message)[0];
              const _isMediaMsg =
                _initialMsgType === "imageMessage" ||
                _initialMsgType === "documentMessage" ||
                _initialMsgType === "videoMessage";
              const isMediaPresent = !!(visionAnalysis || curImageBuffer || _isMediaMsg);
              
              pendingComplaints.set(phone, {
                state: isMediaPresent ? "AWAITING_LOCATION" : "AWAITING_MEDIA",
                text:
                  text && text.trim()
                    ? text.trim()
                    : visionAnalysis
                      ? visionAnalysis.complaint_text
                      : curImageBuffer
                        ? "(Fotoğraflı şikayet)"
                        : "(Medya İçeren Şikayet)",
                analysis: analysis || null,
                visionAnalysis: visionAnalysis || null,
                imageBuffer: curImageBuffer || null,
                imageContentType: curImageMime || null,
                language: askLang,
                voice: cameFromVoice,
                timestamp: Date.now(),
              });
              pending = pendingComplaints.get(phone);
            } else {
              // Süreyi yenile ve bu mesajda fotoğraf/analiz geldiyse pending'e ekle
              pending.timestamp = Date.now();
              if (!pending.language) pending.language = askLang;
              if (cameFromVoice) pending.voice = true;
              if (curImageBuffer) {
                pending.imageBuffer = curImageBuffer;
                pending.imageContentType = curImageMime;
                if (pending.state === "AWAITING_LOCATION_AFTER_MEDIA_ASK") {
                  pending.state = "AWAITING_LOCATION";
                }
              }
              if (visionAnalysis) {
                pending.visionAnalysis = visionAnalysis;
                if (!pending.text || /^\(/.test(pending.text))
                  pending.text = visionAnalysis.complaint_text;
              }
            }

            if (pending.state === "AWAITING_MEDIA") {
              pending.state = "AWAITING_LOCATION_AFTER_MEDIA_ASK";
              let askMediaMsg = {
                tr: "Şikayetinizi anladım. Buna dair elinizde bir fotoğraf veya video varsa şimdi gönderebilirsiniz. 📸\n\nEğer medya eklemek istemiyorsanız sadece *Yok* veya *Geç* yazabilirsiniz.",
                en: "I understand your complaint. If you have a photo or video related to this, you can send it now. 📸\n\nIf you don't want to add media, simply type *Yok* or *Skip*.",
                de: "Ich habe Ihre Beschwerde verstanden. Wenn Sie ein Foto oder Video dazu haben, können Sie es jetzt senden. 📸\n\nWenn Sie keine Medien hinzufügen möchten, schreiben Sie einfach *Yok* oder *Weiter*.",
                ru: "Я понял вашу жалобу. Если у вас есть фото или видео по этому поводу, вы можете отправить их сейчас. 📸\n\nЕсли вы не хотите добавлять медиа, просто напишите *Yok* или *Пропустить*."
              }[normLang(askLang)];
              
              if (cameFromVoice || pending.voice) askMediaMsg = voiceify(askMediaMsg, askLang);
              
              const sent = await sock.sendMessage(msg.key.remoteJid, { text: askMediaMsg });
              if (sent?.key?.id) addBotMessageId(sent.key.id);
              await speakIfVoice(sock, msg, askMediaMsg, askLang, cameFromVoice);
              continue; 
            }

            let askBase = analysis.auto_response || msgAskNeighborhood(askLang, name);
            // "102 mahalle" ifadelerini temizle
            askBase = askBase.replace(/[^.]*102 mahalle[^.]*\./gi, "").trim();
            let askReply = askBase + msgLocationHint(askLang);
            if (cameFromVoice || (pending && pending.voice)) askReply = voiceify(askReply, askLang);

            const sent = await sock.sendMessage(msg.key.remoteJid, { text: askReply });
            if (sent?.key?.id) {
              addBotMessageId(sent.key.id);
            }
            await speakIfVoice(sock, msg, askReply, askLang, cameFromVoice);
            continue; // döngüde sonraki mesaja geç
          }

          // ── Mahalle bulundu ama henüz medya sorulmadıysa → medya sor ──
          const _freshMsgType = Object.keys(actualMessage || msg.message)[0];
          const _hasFreshMedia = !!(
            curImageBuffer ||
            visionAnalysis ||
            _freshMsgType === "imageMessage" ||
            _freshMsgType === "videoMessage" ||
            _freshMsgType === "documentMessage"
          );
          const _comingFromPending = !!(pending && ((pending.state || "").startsWith("AWAITING") || pending.state === "READY_TO_SAVE"));

          if (!_comingFromPending && !_hasFreshMedia) {
            // İlk mesajda mahalle bulundu ama medya yok → medya sor
            const askLang = analysis.language || "tr";
            pendingComplaints.set(phone, {
              state: "AWAITING_LOCATION_AFTER_MEDIA_ASK",
              text: text && text.trim() ? text.trim() : "(Şikayet)",
              analysis: analysis || null,
              visionAnalysis: visionAnalysis || null,
              imageBuffer: null,
              imageContentType: null,
              neighborhoodId: neighborhoodId,
              neighborhoodName: matchedNbr ? matchedNbr.name : null,
              address: manualLocationText || null,
              language: askLang,
              voice: cameFromVoice,
              timestamp: Date.now(),
            });

            let askMediaMsg = {
              tr: "Şikayetinizi anladım. Buna dair elinizde bir fotoğraf veya video varsa şimdi gönderebilirsiniz. 📸\n\nEğer medya eklemek istemiyorsanız sadece *Yok* veya *Geç* yazabilirsiniz.",
              en: "I understand your complaint. If you have a photo or video related to this, you can send it now. 📸\n\nIf you don't want to add media, simply type *Yok* or *Skip*.",
              de: "Ich habe Ihre Beschwerde verstanden. Wenn Sie ein Foto oder Video dazu haben, können Sie es jetzt senden. 📸\n\nWenn Sie keine Medien hinzufügen möchten, schreiben Sie einfach *Yok* oder *Weiter*.",
              ru: "Я понял вашу жалобу. Если у вас есть фото или видео по этому поводу, вы можете отправить их сейчас. 📸\n\nЕсли вы не хотите добавлять медиа, просто напишите *Yok* или *Пропустить*."
            }[normLang(askLang)];

            if (cameFromVoice) askMediaMsg = voiceify(askMediaMsg, askLang);

            console.log("   📸 Mahalle bulundu ama medya sorulacak (ilk mesaj).");
            const sent = await sock.sendMessage(msg.key.remoteJid, { text: askMediaMsg });
            if (sent?.key?.id) addBotMessageId(sent.key.id);
            await speakIfVoice(sock, msg, askMediaMsg, askLang, cameFromVoice);
            continue;
          }

          console.log("   🗂️ Şikayet tespit edildi, kayıt oluşturuluyor.");

          // ── Adresi çöz: en az mahalle adı garanti; varsa detay (konum pini / kullanıcı metni) ──
          const nbrObj =
            matchedNbr ||
            (neighborhoodId ? neighborhoodsCache.find((n) => n.id === neighborhoodId) : null);
          const nbrName = nbrObj ? nbrObj.name : (pending && pending.neighborhoodName) || null;
          const aiAddr =
            analysis.address &&
            String(analysis.address).trim() &&
            String(analysis.address).toLowerCase() !== "null"
              ? String(analysis.address).trim()
              : null;
          let resolvedAddress =
            pending && pending.address // konum pininden gelen tam adres
              ? pending.address
              : manualLocationText || aiAddr || null; // kullanıcı metni ya da AI'ın çıkardığı sokak/cadde detayı
          // Detay yoksa en azından mahalle adını yaz
          if (!resolvedAddress && nbrName) resolvedAddress = `${nbrName} Mahallesi`;
          // Kullanıcının yazdığı metin mahalle adını içermiyorsa başına ekle (örn. sadece "Barbaros Caddesi No:5")
          if (
            resolvedAddress &&
            nbrName &&
            !normalizeTr(resolvedAddress).includes(normalizeTr(nbrName))
          ) {
            resolvedAddress = `${nbrName} Mahallesi, ${resolvedAddress}`;
          }
          if (resolvedAddress) console.log(`   🏠 Kaydedilen adres: ${resolvedAddress}`);

          // Şikayet metni: gerçek metin > bu mesajdaki caption/yazı > vision açıklaması > yer tutucu
          let complaintTextToSave;
          if (pending && pending.text && !/^\(/.test(pending.text)) {
            complaintTextToSave = pending.text;
          } else if (text && text.trim()) {
            complaintTextToSave = text.trim();
          } else if (analysis && analysis.complaint_text) {
            complaintTextToSave = analysis.complaint_text;
          } else if (pending && pending.text) {
            complaintTextToSave = pending.text;
          } else {
            complaintTextToSave = "(Fotoğraflı/Medya şikayeti)";
          }

          // ── Mükerrer / benzer şikayet kontrolü ──
          // Aynı mahalle+kategoride, kısa süre önce açılmış aynı sorun varsa
          // yeni kayıt AÇMA; vatandaşa zaten bildirildiğini ve çalışıldığını söyle.
          const dupExisting = await findDuplicateComplaint({
            neighborhoodId,
            category: analysis.category,
            text: complaintTextToSave,
          });
          if (dupExisting) {
            pendingComplaints.delete(phone);
            const dupLang = (pending && pending.language) || analysis.language || "tr";
            const dupMsg = msgDuplicateComplaint(dupLang, {
              nbrName: nbrName || null,
              category: analysis.category || "Diğer",
              agoText: formatAgo(dupExisting.created_at, dupLang),
              trackingNo: dupExisting.id.substring(0, 8).toUpperCase(),
            });
            const sentDup = await sock.sendMessage(msg.key.remoteJid, { text: dupMsg });
            if (sentDup?.key?.id) {
              addBotMessageId(sentDup.key.id);
            }
            continue;
          }

          const { data: complaint, error: dbError } = await supabase
            .from("complaints")
            .insert([
              {
                citizen_phone: phone,
                citizen_name: name,
                complaint_text: complaintTextToSave,
                status: "yeni",
                source: "whatsapp_qr",
                language: analysis.language || "tr",
                address: resolvedAddress,
                latitude: pending && pending.lat !== undefined ? pending.lat : null,
                longitude: pending && pending.lng !== undefined ? pending.lng : null,
              },
            ])
            .select()
            .single();

          if (dbError) throw dbError;
          if (cameFromVoice || (pending && pending.voice)) markVoiceComplaint(complaint.id);

          // Medya/Fotoğraf Ekle — bu mesajdaki fotoğraf, önceki mesajda gelen (pending) fotoğraf, veya belge
          const messageType = Object.keys(msg.message)[0];
          let attachBuffer = curImageBuffer || (pending && pending.imageBuffer) || null;
          let attachMime = curImageMime || (pending && pending.imageContentType) || null;
          let attachType = "image";
          if (!attachBuffer && messageType === "documentMessage") {
            // Belge (PDF vb.) — indir
            console.log("   📎 Belge algılandı, indiriliyor...");
            attachBuffer = await downloadMediaMessage(msg, "buffer", {}, { logger });
            attachMime = msg.message.documentMessage.mimetype || "application/octet-stream";
            attachType = "document";
          }
          if (attachBuffer) {
            console.log("   📷 Medya şikayete ekleniyor...");
            const fileUrl = await uploadMediaToSupabase(
              attachBuffer,
              phone,
              attachMime || "image/jpeg",
            );
            if (fileUrl) {
              let finalFileType = "document";
              if (attachMime) {
                if (attachMime.startsWith("image/")) finalFileType = "image";
                else if (attachMime.startsWith("video/")) finalFileType = "video";
                else if (attachMime.startsWith("audio/")) finalFileType = "audio";
              }
              await supabase.from("complaint_attachments").insert([
                {
                  complaint_id: complaint.id,
                  file_url: fileUrl,
                  file_type: finalFileType,
                },
              ]);
              console.log("   ✅ Medya eklendi.");
            }
          }

          // AI Sonuçlarını Güncelle
          await supabase
            .from("complaints")
            .update({
              category: analysis.category || "Diğer",
              ai_category: analysis.category,
              ai_department_id: departmentId,
              assigned_department_id: departmentId,
              neighborhood_id: neighborhoodId,
              priority: analysis.priority,
              language: analysis.language || "tr",
            })
            .eq("id", complaint.id);

          // Bekleyen şikayeti temizle
          pendingComplaints.delete(phone);

          // Kullanıcıya Cevap Gönder
          const lang = ((pending && pending.language) || analysis.language || "tr")
            .toLowerCase()
            .trim();

          let confirmationText = `✅ Sayın ${name}, şikayetiniz başarıyla alınmıştır.`;
          let categoryText = `📋 Kategori: ${analysis.category}`;
          let departmentText = `🏢 Yönlendirilen Birim: ${analysis.department || "İlgili Müdürlük"}`;
          let trackingText = `Takip numaranız: ${mono(complaint.id.substring(0, 8).toUpperCase())}`;
          let footerText = `Alanya Belediyesi olarak en kısa sürede dönüş yapacağız.`;
          let representativeText = `💬 Gerçek bir temsilci ile görüşmek isterseniz aşağıdaki linke tıklayabilirsiniz:\nhttps://wa.me/905362206204?text=temsilci`;

          if (lang === "en" || lang === "english") {
            confirmationText = `✅ Dear ${name}, your request has been successfully received.`;
            categoryText = `📋 Category: ${analysis.category}`;
            departmentText = `🏢 Assigned Department: ${analysis.department || "Relevant Department"}`;
            trackingText = `Tracking number: ${mono(complaint.id.substring(0, 8).toUpperCase())}`;
            footerText = `As Alanya Municipality, we will get back to you as soon as possible.`;
            representativeText = `💬 If you want to speak with a real representative, you can click the link below:\nhttps://wa.me/905362206204?text=representative`;
          } else if (lang === "de" || lang === "german" || lang === "deutsch") {
            confirmationText = `✅ Sehr geehrte(r) ${name}, Ihr Anliegen wurde erfolgreich entgegengenommen.`;
            categoryText = `📋 Kategorie: ${analysis.category}`;
            departmentText = `🏢 Zuständige Abteilung: ${analysis.department || "Zuständige Abteilung"}`;
            trackingText = `Auftragsnummer: ${mono(complaint.id.substring(0, 8).toUpperCase())}`;
            footerText = `Als Stadtverwaltung Alanya werden wir uns so schnell wie möglich bei Ihnen melden.`;
            representativeText = `💬 Wenn Sie mit einem echten Vertreter sprechen möchten, klicken Sie bitte auf den folgenden Link:\nhttps://wa.me/905362206204?text=vertreter`;
          } else if (lang === "ru" || lang === "russian" || lang === "русский") {
            confirmationText = `✅ Уважаемый(ая) ${name}, ваш запрос успешно получен.`;
            categoryText = `📋 Категория: ${analysis.category}`;
            departmentText = `🏢 Назначенный отдел: ${analysis.department || "Соответствующий отдел"}`;
            trackingText = `Номер отслеживания: ${mono(complaint.id.substring(0, 8).toUpperCase())}`;
            footerText = `Муниципалитет Алании свяжется с вами в кратчайшие сроки.`;
            representativeText = `💬 Если вы хотите поговорить с настоящим представителем, нажмите на ссылку ниже:\nhttps://wa.me/905362206204?text=представитель`;
          }

          const kvkkNotice = `\n\n----------------------------------\nℹ️ _Alanya Belediyesi olarak 6698 sayılı KVKK uyarınca verilerinizi başvuru takibi amacıyla işliyoruz. Detay: https://alanya.bel.tr/kvkk_`;

          const reply =
            (analysis.auto_response ? analysis.auto_response + "\n\n" : "") +
            `${confirmationText}\n\n` +
            `${categoryText}\n` +
            `${departmentText}\n` +
            `${trackingText}\n` +
            `${footerText}\n\n` +
            `${representativeText}` +
            `${kvkkNotice}`;

          const sent = await sock.sendMessage(msg.key.remoteJid, { text: reply });
          if (sent?.key?.id) {
            addBotMessageId(sent.key.id);
          }
          await speakIfVoice(
            sock,
            msg,
            reply,
            analysis.language || "tr",
            cameFromVoice || (pending && pending.voice),
          );

          // ŞİKAYET olsa bile eşleşen PDF'ler varsa gönder! (Örnek: Ruhsat sordu ama AI şikayet kategorisine attıysa)
          const pdfsToSend =
            analysis.send_pdfs || (analysis.send_pdf ? ["nikah-evraklari.pdf"] : []);
          for (const pdfFileName of pdfsToSend) {
            const pdfMeta = pdfConfig.pdfs.find((p) => p.dosya === pdfFileName);
            const displayName = pdfMeta
              ? pdfMeta.goruntu_adi.replace(/\s+/g, "_") + ".pdf"
              : pdfFileName;
            const pdfFilePath = path.join(__dirname, "assets", pdfFileName);
            if (fs.existsSync(pdfFilePath)) {
              console.log(`   📄 PDF gönderiliyor (Şikayet akışı): ${pdfFileName}`);
              const pdfBuffer = fs.readFileSync(pdfFilePath);
              const sentDoc = await sock.sendMessage(msg.key.remoteJid, {
                document: pdfBuffer,
                mimetype: "application/pdf",
                fileName: displayName,
              });
              if (sentDoc?.key?.id) {
                addBotMessageId(sentDoc.key.id);
              }
            }
          }
        }
      } catch (err) {
        console.error("❌ Mesaj işleme hatası:", err);
      } finally {
        resolvePromise();
        if (jid && messageQueues.get(jid) === currentPromise) {
          messageQueues.delete(jid);
        }
      }
    }
  });
}

// E-Belediye online işlem portalı adresi ve konu tespiti.
const WEBPORTAL_URL = "https://webportal.alanya.bel.tr";
function looksLikePortalTopic(text) {
  const t = String(text || "").toLowerCase();
  const patterns = [
    /emlak vergi/,
    /çtv/,
    /çevre temizlik/,
    /vergi.{0,8}(borc|borç|öde|odeme)/,
    /(borc|borç)(um|umu|un| sorgu| öde| odeme| durum| bilg)/,
    /tahakkuk/,
    /e-?bilet/,
    /etkinlik bilet/,
    /evrak doğrula/,
    /evrak dogrula/,
    /belge doğrula/,
    /sicil (arama|sorgu)/,
    /rayiç/,
    /rayic/,
    /inşaat maliyet/,
    /insaat maliyet/,
    /aşınma oran/,
    /asinma oran/,
    /(meclis|encümen|encumen) karar/,
    /kararlar takip/,
    /vergi(mi|mizi)? öde/,
    /vergi ödeme/,
    /online öde/,
    /borç öde/,
    /borcumu öde/,
  ];
  return patterns.some((p) => p.test(t));
}

// ─── AI Analiz ────────────────────────────────────────────────────
async function analyzeWithAI(text) {
  const fallback = {
    category: "Diğer",
    department: "",
    neighborhood: null,
    address: null,
    priority: "orta",
    auto_response: "",
    send_pdfs: [],
    interaction_type: "sikayet",
    language: "tr",
  };

  if (!openai) {
    console.log("⚠️ OPENAI_API_KEY yok, anahtar kelime tabanlı sınıflandırma kullanılıyor.");
    const local = classifyByKeyword(text);
    return {
      ...fallback,
      ...local,
      interaction_type: local.department === "Yazı İşleri Müdürlüğü" ? "bilgi" : "sikayet",
    };
  }

  const deptList = departmentsCache.map((d) => d.name).join(", ");
  // Etkinlik bilgisini önce detaylı knowledge dosyasından, yoksa DB cache'den al
  const eventsList =
    eventsDocsText ||
    eventsCache
      .map((e) => `- ${e.title}: ${e.start_date} - ${e.end_date} (${e.description || ""})`)
      .join("\n");
  const pdfCatalog = buildPdfCatalogText();
  const mukhtarsList = neighborhoodsCache
    .filter((n) => n.mukhtar_name)
    .map(
      (n) =>
        `- ${n.name} Mahallesi Muhtarı: ${n.mukhtar_name} (İletişim/Telefon: ${n.mukhtar_phone || "Kayıtlı Değil"})`,
    )
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sen Alanya Belediyesi yapay zeka şikayet ve bilgi asistanısın. Antalya'nın Alanya ilçesinde görev yapıyorsun. Belediye Başkanı Osman Tarık Özçelik'tir.

Vatandaştan gelen şikayeti veya bilgi talebini analiz et ve SADECE JSON döndür:
{"category":"Kategori Adı","department":"Müdürlük Adı","neighborhood":"Şikayette geçen mahalle adı (Örn: Fığla, Mahmutlar, Oba, Konaklı vb.) veya null","address":"Şikayette geçen mahalle DIŞINDAKI adres detayı: sokak, cadde, bulvar, bina/kapı no, site adı, mevki vb. (Örn: 'Serap Sokak No:5', 'Barbaros Caddesi'). Böyle bir detay yoksa null","priority":"yuksek|orta|dusuk","interaction_type":"sikayet|bilgi","language":"tr|en|ru|de|... (mesajın dili)","send_pdfs":["dosya-adi.pdf"],"auto_response":"Vatandaşa kısa, nazik, profesyonel cevap (3-4 cümle, emoji kullanabilirsin. Alanya Belediyesi olarak hitap et. DİL KURALI: Gelen mesaj hangi dilde yazılmışsa, auto_response cevabını da O DİLDE oluştur.)"}

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

E-BELEDİYE ONLİNE İŞLEMLER PORTALI (web adresi: https://webportal.alanya.bel.tr):
Vatandaşlar şu işlemleri bu portaldan online yapabilir/sorgulayabilir:
- Emlak vergisi, Çevre Temizlik Vergisi (ÇTV) ve diğer belediye borçlarının SORGULANMASI ve ONLİNE ÖDENMESİ (Hızlı Sicil Borcu Ödeme; Borç/Tahakkuk/Ödeme Bilgileri)
- Etkinlik e-bilet işlemleri
- Evrak doğrulama; Sicil arama (gerçek/tüzel kişi)
- Arsa m² rayiç bedelleri, inşaat maliyet bedelleri, emlak aşınma oranları, ÇTV bedelleri sorgulama
- Belediye meclis/encümen kararlarının takibi (Kararlar Takip Sistemi)

KURALLAR:
- Nikah, evlilik, evlenme belgeleri vb. sorular için "Müdürlük Adı" olarak "Yazı İşleri Müdürlüğü" seç.
- İşyeri açma, ruhsat, sıhhi/gayrisıhhi müessese ruhsatı vb. sorular için "Müdürlük Adı" olarak "Ruhsat ve Denetim Müdürlüğü" seç.
- Vatandaş bir mahallenin muhtarını, muhtar ismini veya muhtarlık iletişim/telefon numarasını sorarsa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (MAHALLE MUHTARLARI)" listesini kullanarak net, doğru ve doğrudan isim ile telefon numarasını içeren bir auto_response hazırla. Bu tür bilgi talepleri için "Müdürlük Adı" olarak "Muhtarlık İşleri Müdürlüğü" seç.
- Vatandaş evlilik/nikah evrakları, yabancı evliliği, yaş sınırı, iddet müddeti gibi konuları sorursa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (EVLENDİRME İŞLEMLERİ)"ne göre akıl yürüterek tam, doğru ve detaylı bir auto_response hazırla.
- Vatandaş ruhsat başvurusu, gerekli evraklar veya ruhsat onay süreçleri hakkında soru sorarsa, yukarıdaki "BELEDİYE BİLGİ REHBERİ (RUHSAT VE İŞYERİ AÇMA İŞLEMLERİ)" bilgilerine göre gerekli evrakları ve adımları açıklayan detaylı bir auto_response hazırla.
- Vatandaş emlak vergisi, ÇTV, su veya belediyeye olan borcunu ÖDEMEK/SORGULAMAK, tahakkuk/ödeme bilgisi, e-bilet, evrak doğrulama, sicil arama, arsa rayiç/inşaat maliyet/aşınma oranı bedeli, ÇTV bedeli veya meclis/encümen kararı takibi gibi ONLİNE İŞLEM konularını sorarsa: "interaction_type" = "bilgi" seç ve "auto_response" içinde bu işlemi https://webportal.alanya.bel.tr E-Belediye portalından online yapabileceğini net şekilde belirt (mümkünse portaldaki ilgili bölümün adını da söyle). Bu tür sorular şikayet DEĞİLDİR.
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
        { role: "user", content: text },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    // Geriye uyumluluk: eski send_pdf:boolean formatını da destekle
    let sendPdfs = parsed.send_pdfs || [];
    if (!Array.isArray(sendPdfs)) {
      if (typeof sendPdfs === "string") {
        sendPdfs = [sendPdfs];
      } else {
        sendPdfs = [];
      }
    }
    // Eğer AI eski send_pdf formatında true dönmüşse, cümlenin içeriğine göre anahtar kelimeden bulalım
    if ((parsed.send_pdf === true || parsed.send_pdf === "true") && sendPdfs.length === 0) {
      const keywordResult = classifyByKeyword(text);
      if (keywordResult.send_pdfs && keywordResult.send_pdfs.length > 0) {
        sendPdfs = keywordResult.send_pdfs;
      } else {
        sendPdfs = ["nikah-evraklari.pdf"]; // En son çare
      }
    }
    let finalAuto = parsed.auto_response || fallback.auto_response;
    let finalType = parsed.interaction_type || fallback.interaction_type;
    // Online işlem (E-Belediye portalı) konusuysa: bilgi say + linki garanti et
    if (looksLikePortalTopic(text)) {
      finalType = "bilgi";
      if (!/webportal\.alanya\.bel\.tr/i.test(finalAuto)) {
        finalAuto =
          (finalAuto ? finalAuto.trim() + "\n\n" : "") +
          `🌐 Bu işlemi Alanya Belediyesi E-Belediye portalından online yapabilirsiniz:\n${WEBPORTAL_URL}`;
      }
    }
    return {
      category: parsed.category || fallback.category,
      department: parsed.department || fallback.department,
      neighborhood: parsed.neighborhood || null,
      address: parsed.address || null,
      priority: parsed.priority || fallback.priority,
      auto_response: finalAuto,
      send_pdfs: sendPdfs,
      interaction_type: finalType,
      language: parsed.language || "tr",
    };
  } catch (err) {
    console.error("⚠️ AI analiz hatası:", err.message);
    return { ...fallback, ...classifyByKeyword(text) };
  }
}

// ─── Fotoğraf/Görsel Analizi (AI Vision) ─────────────────────────
// Vatandaşın gönderdiği fotoğrafı gpt-4o-mini vision ile inceler:
// kategori, müdürlük, öncelik ve şikayet açıklamasını otomatik üretir.
async function analyzeImageWithAI(buffer, mimetype, captionText) {
  const fallback = {
    category: "Diğer",
    department: "",
    neighborhood: null,
    address: null,
    priority: "orta",
    auto_response: "",
    send_pdfs: [],
    interaction_type: "sikayet",
    language: "tr",
    complaint_text:
      captionText && captionText.trim()
        ? captionText.trim()
        : "Vatandaş tarafından gönderilen fotoğraflı şikayet.",
  };
  if (!openai || !buffer) return fallback;

  const deptList = departmentsCache.map((d) => d.name).join(", ");
  const b64 = buffer.toString("base64");
  const mime = mimetype || "image/jpeg";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Görsel/plaka okuma (OCR) için mini'den çok daha güçlü
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sen Alanya Belediyesi yapay zeka şikayet asistanısın. Vatandaşın gönderdiği FOTOĞRAFI incele ve belediyeyi ilgilendiren sorunu tespit et. SADECE JSON döndür:
{"category":"Kategori Adı","department":"Müdürlük Adı","neighborhood":"Fotoğrafta/başlıkta açık bir mahalle/sokak tabelası görünüyorsa adı, yoksa null","address":"Fotoğrafta/başlıkta görünen sokak/cadde/bina no gibi adres detayı veya null","license_plate":"Fotoğrafta NET okunabilen Türk araç plakası (Örn: 07 ABC 123). Okunamıyorsa veya araç yoksa null","priority":"yuksek|orta|dusuk","interaction_type":"sikayet","language":"tr","complaint_text":"Fotoğrafta görünen sorunu 1-2 cümleyle, memur bakış açısıyla, nesnel olarak Türkçe tarif et (Örn: 'Yol kenarında toplanmamış çöp/atık yığını var.', 'Kaldırımda kırık zemin ve çukur mevcut.')","auto_response":"Vatandaşa kısa, nazik, profesyonel Türkçe cevap (2-3 cümle, emoji olabilir, Alanya Belediyesi olarak hitap et)."}

Kategoriler: Yol / Altyapı, Temizlik / Atık, Park ve Bahçeler, İmar / Yapı, Çevre / Sıfır Atık, Zabıta / Düzen, Hayvan Hakları, Kültür / Sosyal, Kırsal Hizmetler, Kentsel Dönüşüm, Afet / Acil, Diğer.
Mevcut Müdürlükler: ${deptList}
KURALLAR:
- Müdürlük adını yukarıdaki listeden BİREBİR AYNI yazımla seç.
- Tehlikeli/acil durumlar (patlak trafo, su baskını, çökme, yangın vb.) priority = "yuksek".
- Fotoğrafta belediyeyle ilgili bir sorun yoksa category "Diğer" ve complaint_text'te durumu belirt.
- ARAÇ/PARK İHLALİ: Fotoğrafta bir araç kural dışı park etmişse (kaldırım/yaya yolu/yaya geçidi/engelli rampası üzeri vb.) category "Zabıta / Düzen" seç. Eğer aracın plakası NET okunuyorsa "license_plate" alanına yaz VE complaint_text'i şu biçimde, plakayı **çift yıldız** ile kalın yazarak oluştur: "**07 ABC 123** plakalı araç yaya yolu üzerine park etmiştir. Bu durum yaya geçişini engellemektedir." (Plakayı okuyamıyorsan license_plate null bırak ve plakadan bahsetme.)
- Başlık (caption) varsa onu da dikkate al: "${(captionText || "").replace(/"/g, "'").slice(0, 400)}"`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                captionText && captionText.trim()
                  ? `Vatandaşın notu: ${captionText.trim()}`
                  : "Bu fotoğraftaki belediye sorununu analiz et.",
            },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } },
          ],
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return {
      category: parsed.category || fallback.category,
      department: parsed.department || fallback.department,
      neighborhood: parsed.neighborhood || null,
      address: parsed.address || null,
      priority: parsed.priority || fallback.priority,
      auto_response: parsed.auto_response || fallback.auto_response,
      send_pdfs: [],
      interaction_type: "sikayet",
      language: parsed.language || "tr",
      complaint_text: parsed.complaint_text || fallback.complaint_text,
      license_plate: parsed.license_plate || null,
    };
  } catch (err) {
    console.error("⚠️ Görsel analiz hatası:", err.message);
    return fallback;
  }
}

// ─── Anahtar Kelime Tabanlı Yedek Sınıflandırma (Alanya) ─────────
function classifyByKeyword(text) {
  const lower = text.toLowerCase();
  const rules = [
    {
      keywords: ["yol", "asfalt", "çukur", "kaldırım", "köprü", "altyapı"],
      category: "Yol / Altyapı",
      department: "Fen İşleri Müdürlüğü",
    },
    {
      keywords: ["çöp", "temizlik", "süpür", "atık", "pis", "koku", "konteyner"],
      category: "Temizlik / Atık",
      department: "Temizlik İşleri Müdürlüğü",
    },
    {
      keywords: ["park", "bahçe", "ağaç", "yeşil", "çim", "budama", "peyzaj"],
      category: "Park ve Bahçeler",
      department: "Park ve Bahçeler Müdürlüğü",
    },
    {
      keywords: ["imar", "inşaat", "kaçak", "yapı", "kat"],
      category: "İmar / Yapı",
      department: "İmar ve Şehircilik Müdürlüğü",
    },
    {
      keywords: ["geri dönüşüm", "sıfır atık", "iklim", "çevre kirliliği"],
      category: "Çevre / Sıfır Atık",
      department: "İklim Değişikliği ve Sıfır Atık Müdürlüğü",
    },
    {
      keywords: ["gürültü", "seyyar", "düzen", "zabıta", "işgal", "müzik"],
      category: "Zabıta / Düzen",
      department: "Zabıta Müdürlüğü",
    },
    {
      keywords: ["köpek", "kedi", "hayvan", "sokak hayvanı", "barınak", "mama"],
      category: "Hayvan Hakları",
      department: "Veteriner İşleri Müdürlüğü",
    },
    {
      keywords: ["kültür", "etkinlik", "konser", "festival", "sergi", "tiyatro"],
      category: "Kültür / Sosyal",
      department: "Kültür, Sanat ve Sosyal İşler Müdürlüğü",
    },
    {
      keywords: ["köy", "kırsal", "tarla", "tarım"],
      category: "Kırsal Hizmetler",
      department: "Kırsal Hizmetler Müdürlüğü",
    },
    {
      keywords: ["dönüşüm", "riskli", "deprem", "yıkım", "kentsel"],
      category: "Kentsel Dönüşüm",
      department: "Kentsel Dönüşüm Müdürlüğü",
    },
    {
      keywords: ["sel", "yangın", "afet", "heyelan", "acil"],
      category: "Afet / Acil",
      department: "Afet İşleri ve Risk Yönetimi Müdürlüğü",
    },
    {
      keywords: ["emlak", "arsa", "kamulaştırma", "kira"],
      category: "Diğer",
      department: "Emlak ve İstimlak Müdürlüğü",
    },
    {
      keywords: ["vergi", "ödeme", "borç", "tahsilat"],
      category: "Diğer",
      department: "Gelirler Müdürlüğü",
    },
    {
      keywords: ["sosyal yardım", "engelli", "yardım", "ihtiyaç"],
      category: "Diğer",
      department: "Sosyal Hizmetler Müdürlüğü",
    },
    {
      keywords: ["nikah", "evlilik", "evlenme", "düğün", "aile cüzdanı"],
      category: "Diğer",
      department: "Yazı İşleri Müdürlüğü",
      send_pdfs: ["nikah-evraklari.pdf"],
    },
    {
      keywords: ["sıhhi", "sihhi", "berber", "kuaför", "lokanta", "bakkal", "market", "ofis"],
      category: "Diğer",
      department: "Ruhsat ve Denetim Müdürlüğü",
      send_pdfs: ["Sıhhi Form.pdf"],
    },
    {
      keywords: ["gayrisıhhi", "gayrisihhi", "gsm", "imalathane", "atölye", "fabrika", "depo"],
      category: "Diğer",
      department: "Ruhsat ve Denetim Müdürlüğü",
      send_pdfs: ["Gayrisıhhi Form.pdf"],
    },
    {
      keywords: ["umuma açık", "otel", "pansiyon", "bar", "disko", "eğlence"],
      category: "Diğer",
      department: "Ruhsat ve Denetim Müdürlüğü",
      send_pdfs: ["Umuma Açık Form.pdf"],
    },
    {
      keywords: ["tekne", "gezi teknesi", "yat", "deniz turizmi"],
      category: "Diğer",
      department: "Ruhsat ve Denetim Müdürlüğü",
      send_pdfs: ["Gezi Tekneleri.pdf"],
    },
    {
      keywords: ["ruhsat", "işyeri açma", "dükkan açma"],
      category: "Diğer",
      department: "Ruhsat ve Denetim Müdürlüğü",
      send_pdfs: ["Sıhhi Form.pdf", "Gayrisıhhi Form.pdf", "Umuma Açık Form.pdf"],
    },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return {
        category: rule.category,
        department: rule.department,
        send_pdfs: rule.send_pdfs || [],
      };
    }
  }
  return { category: "Diğer", department: "", send_pdfs: [] };
}

// ─── Vatandaş Yanıtı (Bekleyen Şikayete Ekleme) ─────────────────
async function checkIfMessageIsReplyToPending(complaintText, adminQuestion, userMessage) {
  if (!openai) {
    const lower = userMessage.toLowerCase().trim();
    if (lower === "yeni şikayet" || lower === "yeni sikayet" || lower === "yeni") return false;
    return true;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sen bir belediye WhatsApp botu asistanısın.
Kullanıcının bekleyen aktif bir şikayeti var. Bu şikayet ve belediyenin sorduğu soru aşağıdadır:

Şikayet Konusu: "${complaintText}"
Belediyenin Sorusu: "${adminQuestion || ""}"

Kullanıcı şimdi yeni bir mesaj gönderdi:
"${userMessage}"

Görevin: Kullanıcının bu son mesajının, belediyenin sorduğu soruya bir CEVAP/YANIT mı (yani aynı şikayetle mi ilgili), yoksa tamamen YENİ/FARKLI/BAĞIMSIZ bir şikayet veya talep mi olduğunu belirle.

Sadece aşağıdaki JSON formatında çıktı ver:
{
  "is_reply": true (eğer mesaj önceki şikayete/soruya verilen bir cevapsa veya onunla ilgiliyse) veya false (eğer tamamen yeni/farklı bir şikayet/konu ise veya kullanıcı yeni bir şikayet açmak istediğini belirtiyorsa)
}`,
        },
      ],
      temperature: 0.1,
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return !!parsed.is_reply;
  } catch (err) {
    console.error("⚠️ is_reply sınıflandırma hatası:", err);
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
    .from("complaints")
    .select("id, complaint_text, citizen_name")
    .eq("citizen_phone", phone)
    .eq("status", "vatandas_yaniti_bekleniyor")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("⚠️ Bekleyen şikayet sorgusu hatası:", error.message);
    return false;
  }

  if (!awaiting) return false;

  // AI ile bu yeni mesajın eski şikayete bir cevap mı yoksa yeni bir şikayet mi olduğunu sorgula
  let isReply = true;
  if (text && text.trim().length > 0) {
    // Son belediye sorusunu çek
    const { data: lastQuestion } = await supabase
      .from("complaint_responses")
      .select("response_text")
      .eq("complaint_id", awaiting.id)
      .eq("response_type", "soru")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const adminQuestion = lastQuestion ? lastQuestion.response_text : "";

    // AI sınıflandırması yap
    isReply = await checkIfMessageIsReplyToPending(awaiting.complaint_text, adminQuestion, text);
    console.log(
      `   🤖 Mesaj sınıflandırması: Eski şikayete cevap mı? = ${isReply ? "EVET" : "HAYIR"}`,
    );
  }

  if (!isReply) {
    // Eğer yeni bir şikayet ise, eski şikayeti 'incelemede' durumuna çekip yeni şikayet akışına bırakıyoruz
    console.log(
      `   🔄 Vatandaş yeni bir şikayet yazmış. Eski şikayet (${awaiting.id.substring(0, 8)}) durumu 'incelemede' olarak güncelleniyor...`,
    );
    await supabase.from("complaints").update({ status: "incelemede" }).eq("id", awaiting.id);
    return false;
  }

  console.log(`   💬 Vatandaş yanıtı mevcut şikayete ekleniyor (${awaiting.id.substring(0, 8)})`);

  const replyText = text?.trim() || "(Medya yanıtı)";

  const { error: responseError } = await supabase.from("complaint_responses").insert({
    complaint_id: awaiting.id,
    response_text: replyText,
    response_type: "vatandas",
  });

  if (responseError) {
    console.error("⚠️ Vatandaş yanıtı kaydedilemedi:", responseError.message);
    return false;
  }

  const messageType = Object.keys(msg.message)[0];
  if (messageType === "imageMessage" || messageType === "documentMessage") {
    console.log("   📷 Vatandaş yanıtına medya ekleniyor...");
    const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger });
    const contentType = msg.message[messageType].mimetype;
    const fileUrl = await uploadMediaToSupabase(buffer, phone, contentType);

    if (fileUrl) {
      await supabase.from("complaint_attachments").insert([
        {
          complaint_id: awaiting.id,
          file_url: fileUrl,
          file_type: contentType.startsWith("image") ? "image" : "document",
        },
      ]);
    }
  }

  await supabase.from("complaints").update({ status: "incelemede" }).eq("id", awaiting.id);

  const trackingNo = awaiting.id.substring(0, 8).toUpperCase();
  const ackReply =
    `✅ Sayın ${name}, yanıtınız ${mono(trackingNo)} takip numaralı şikayetinize kaydedilmiştir.\n\n` +
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
    const ext = contentType.split("/")[1] || "jpg";
    const fileName = `whatsapp/${phone}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("attachments").upload(fileName, buffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      console.error("⚠️ Medya yüklenemedi:", error.message);
      return null;
    }

    const { data } = supabase.storage.from("attachments").getPublicUrl(fileName);
    return data.publicUrl;
  } catch (err) {
    console.error("⚠️ Medya yükleme hatası:", err.message);
    return null;
  }
}

// ─── Başlat ────────────────────────────────────────────────────────
startBot();
