import { createServerFn } from "@tanstack/react-start";
import { generateSpeech, transcribe } from "ai";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { stripForSpeech } from "@/lib/speech-text";

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

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SpeakInput.parse(i))
  .handler(async ({ data }) => {
    if (!process.env.OPENAI_API_KEY) {
      return { audioBase64: null as string | null, mediaType: null as string | null };
    }
    try {
      const r = await generateSpeech({
        model: openai.speech(process.env.MAYOR_TTS_MODEL || "gpt-4o-mini-tts"),
        text: stripForSpeech(data.text),
        voice: data.voice || process.env.MAYOR_TTS_VOICE || "alloy",
        outputFormat: "mp3",
        instructions:
          "Türkçe konuş. Bir belediye başkanına brifing veren, sakin, kendinden emin ve saygılı bir danışman tonu kullan. Orta hızda, net telaffuz et.",
      });
      return { audioBase64: r.audio.base64, mediaType: r.audio.mediaType || "audio/mpeg" };
    } catch {
      // Tarayıcı tarafındaki speechSynthesis yedeğine düşmesi için null döndür.
      return { audioBase64: null as string | null, mediaType: null as string | null };
    }
  });
