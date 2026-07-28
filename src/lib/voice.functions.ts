import { createServerFn } from "@tanstack/react-start";
import { generateSpeech, transcribe } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { stripForSpeech } from "@/lib/speech-text";
import { findVoiceOption } from "@/lib/voice-options";

/* ------------------------------------------------------------------ */
/* Konuşmayı metne çevirme (STT)                                       */
/* ------------------------------------------------------------------ */

const TranscribeInput = z.object({
  // base64 kodlanmış ses verisi (data: öneki olmadan)
  audioBase64: z.string().min(16),
  mediaType: z.string().default("audio/webm"),
});

export const transcribeSpeech = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => TranscribeInput.parse(i))
  .handler(async ({ data }) => {
    if (!process.env.OPENAI_API_KEY) {
      return { text: "", error: "OPENAI_API_KEY tanımlı değil." };
    }
    try {
      const bin = atob(data.audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const r = await transcribe({
        model: openai.transcription(process.env.MAYOR_STT_MODEL || "gpt-4o-mini-transcribe"),
        audio: bytes,
        providerOptions: { openai: { language: "tr" } },
      });
      return { text: r.text ?? "", error: null as string | null };
    } catch (e: any) {
      return { text: "", error: e?.message ?? "Ses metne çevrilemedi." };
    }
  });

/* ------------------------------------------------------------------ */
/* Metni sese çevirme (TTS)                                            */
/* ------------------------------------------------------------------ */

const SpeakInput = z.object({
  text: z.string().min(1).max(4000),
  voice: z.string().optional(),
});

/**
 * Sesin karakterini belirleyen yönlendirme. gpt-4o-mini-tts bu talimatı
 * prosodiye (tempo, vurgu, duraklama, sıcaklık) uygular; kısa bir talimat
 * düz/robotik, ayrıntılı bir talimat belirgin biçimde daha insani sonuç verir.
 */
const VOICE_INSTRUCTIONS = `Sen bir belediye başkanının kıdemli danışmanısın ve ona yüz yüze brifing veriyorsun. Yazılı metin okumuyorsun — karşındaki kişiyle konuşuyorsun.

Kimlik ve ton: Orta yaşlı, deneyimli, kendinden emin. Sıcak ama ciddi. Asla neşeli bir sunucu ya da çağrı merkezi görevlisi gibi değil.

Konuşma biçimi:
- Anadili Türkçe olan biri gibi konuş. Yabancı aksanı, hece hece okuma, yapay tonlama olmasın.
- Tempo orta-yavaş, sakin. Aceleci ya da tek düze değil.
- Cümle içinde anlamlı yerlere kısa duraklar koy; cümle sonlarında biraz daha uzun nefes al.
- Önemli rakamları ve sonuçları hafifçe vurgula, üzerinden hızla geçme.
- Tonlamayı cümle boyunca doğal biçimde değiştir; her cümleyi aynı melodiyle bitirme.
- Kötü bir tabloyu aktarırken tonun hafifçe ağırlaşsın, iyi bir gelişmede biraz açılsın. Abartma, ölçülü kal.
- Sonundaki aksiyon önerisini net ve kararlı bir tonla söyle.

Telaffuz: Türkçe'ye özgü sesleri (ı, ğ, ş, ç, ö, ü) tam ve doğru çıkar. Rakamları Türkçe okumayı ihmal etme.`;

/**
 * Varsayılan ses. "ash" ekspresif seslerden: ağırbaşlı ve sıcak, ton
 * talimatlarına eski seslerden (alloy/onyx) çok daha iyi uyuyor ve Türkçe'de
 * belirgin bir yabancı aksanı bırakmıyor.
 */
const FALLBACK_VOICE = "ash";

/**
 * İstemciden gelen ses kimliğini doğrular. Tanınmayan bir değer TTS çağrısını
 * hataya düşürür, o yüzden bilinmeyen kimlikleri sessizce varsayılana çeviriyoruz.
 */
const TTS_VOICE_MAP: Record<string, string> = {
  // Erkek sesler -> Standart OpenAI Erkek Sesleri
  ash: "alloy",
  ballad: "onyx",
  verse: "echo",
  onyx: "onyx",
  echo: "echo",
  alloy: "alloy",
  // Kadın sesler -> Standart OpenAI Kadın Sesleri
  sage: "shimmer",
  coral: "nova",
  nova: "nova",
  shimmer: "shimmer",
};

function resolveVoice(requested?: string): string {
  const option =
    (requested ? findVoiceOption(requested) : undefined) ??
    (process.env.MAYOR_TTS_VOICE ? findVoiceOption(process.env.MAYOR_TTS_VOICE) : undefined);
  const resolvedId = option?.id ?? FALLBACK_VOICE;

  // OpenAI API'sinin standart olarak desteklediği seslere güvenli eşleme
  const mappedVoice = TTS_VOICE_MAP[resolvedId] ?? "alloy";

  console.log(
    `[TTS Debug] resolveVoice: requested="${requested}", env="${process.env.MAYOR_TTS_VOICE}", resolvedId="${resolvedId}", mappedTo="${mappedVoice}"`,
  );
  return mappedVoice;
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SpeakInput.parse(i))
  .handler(async ({ data }) => {
    console.log("[TTS Debug] synthesizeSpeech received data:", data);
    if (!process.env.OPENAI_API_KEY) {
      return {
        audioBase64: null as string | null,
        mediaType: null as string | null,
        error: "OPENAI_API_KEY tanımlı değil." as string | null,
      };
    }
    try {
      const r = await generateSpeech({
        model: openai.speech(process.env.MAYOR_TTS_MODEL || "gpt-4o-mini-tts"),
        text: stripForSpeech(data.text),
        voice: resolveVoice(data.voice),
        outputFormat: "mp3",
        instructions: VOICE_INSTRUCTIONS,
      });
      return {
        audioBase64: r.audio.base64,
        mediaType: r.audio.mediaType || "audio/mpeg",
        error: null as string | null,
      };
    } catch (e: any) {
      // Hatayı yutmayıp logluyoruz: yedeğe düşüldüğünde kullanıcı "seçtiğim ses
      // konuşmuyor" diyor ve sebebi görünmez oluyordu.
      console.error("TTS failed", e);
      // İstemci yanlış bir sesle konuşmak yerine sessiz kalıp hatayı gösterir.
      const detail = String(e?.message ?? "");
      const isQuota = e?.statusCode === 429 || /quota|rate limit|insufficient/i.test(detail);
      return {
        audioBase64: null as string | null,
        mediaType: null as string | null,
        error: isQuota
          ? "Yapay zeka servisinin kullanım kotası dolduğu için sesli cevap verilemiyor."
          : ((e?.message as string) ?? "Ses üretilemedi."),
      };
    }
  });
