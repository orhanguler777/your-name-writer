import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { synthesizeSpeech, transcribeSpeech } from "@/lib/voice.functions";
import { stripForSpeech } from "@/lib/speech-text";
import { getSelectedVoice } from "@/lib/voice-options";

type Recognition = any;

/** Üst üste bu kadar boş/başarısız dinleme olursa oturum kendiliğinden kapanır. */
const MAX_EMPTY_STREAK = 3;

function getRecognitionCtor(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/**
 * Başkan AI için sesli sohbet katmanı.
 *
 * Oturum mantığı: bir kez başlatılır, sonra dinle → cevap üret → sesli oku →
 * yeniden dinle döngüsü kendiliğinden sürer. Kapatılana kadar devam eder.
 *
 * Dinleme: öncelik tarayıcının Web Speech API'si (canlı yazıya döker, gecikmesiz).
 * Desteklenmiyorsa MediaRecorder ile kaydedip sunucudaki OpenAI transkripsiyonuna gönderir.
 *
 * Konuşma: OpenAI TTS, kullanıcının Ayarlar'dan seçtiği sesle. Ses üretilemezse
 * yanlış bir sesle konuşmamak için sessiz kalır ve sebebini `error` ile bildirir.
 */
export function useVoiceChat(opts: {
  /**
   * Konuşma yazıya döküldüğünde çağrılır. Ürettiği cevap metnini döndürmeli —
   * döngü bu cevabı sesli okuyup tekrar dinlemeye geçer.
   */
  onFinalTranscript: (text: string) => Promise<string | null | undefined>;
}) {
  const speak = useServerFn(synthesizeSpeech);
  const transcribe = useServerFn(transcribeSpeech);

  const [supported, setSupported] = useState(false);
  const [session, setSession] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  /** Aktif olarak konuşulan ses — arayüzde göstermek için. */
  const [activeVoice, setActiveVoice] = useState(getSelectedVoice);

  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const emptyStreak = useRef(0);
  /** Her okuma girişimine artan sıra numarası — kesilen okumaların geri çağrılarını iptal eder. */
  const speakGen = useRef(0);
  /** Süren okumanın çözücüsü — kesildiğinde bekleyen promise askıda kalmasın. */
  const speakDoneRef = useRef<((played: boolean) => void) | null>(null);

  // Döngü içinde güncel değerlere erişmek için (bayat closure olmasın).
  const sessionRef = useRef(false);
  /** Her oturum açılış/kapanışında artar — eski turların devamını geçersiz kılar. */
  const sessionGen = useRef(0);
  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;
  const onFinalRef = useRef(opts.onFinalTranscript);
  onFinalRef.current = opts.onFinalTranscript;

  useEffect(() => {
    const hasRec = !!getRecognitionCtor();
    const hasMedia =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window !== "undefined" &&
      typeof (window as any).MediaRecorder !== "undefined";
    setSupported(hasRec || hasMedia);
  }, []);

  /* ------------------------- KONUŞMA (TTS) ------------------------- */

  const stopSpeaking = useCallback(() => {
    // Jenerasyonu ilerlet: sürmekte olan okumanın geri çağrıları geçersiz olur,
    // böylece kesilen bir okumanın 'error' olayı hata mesajı göstermez.
    speakGen.current += 1;
    const audio = audioRef.current;
    if (audio) {
      // Handler'ları önce kopar: pause/src değişimi 'error' olayı tetikleyebilir.
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
    }
    // Bekleyen okuma promise'ini kapat, yoksa await eden taraf sonsuza kadar bekler.
    const pending = speakDoneRef.current;
    speakDoneRef.current = null;
    pending?.(false);
    setSpeaking(false);
  }, []);

  /**
   * Metni, kullanıcının Ayarlar'dan seçtiği sesle okur; okuma bitince çözülür.
   * Dönen değer: ses çalabildi mi. false ise tarayıcı otomatik oynatmayı
   * engellemiştir — çağıran taraf ilk kullanıcı dokunuşunda tekrar deneyebilir.
   *
   * Bilinçli olarak tarayıcının speechSynthesis'ine düşmüyoruz: sistem sesi
   * (macOS'ta tr-TR için "Yelda") seçilen sesle ilgisiz olduğundan, kullanıcı
   * erkek ses seçtiğinde bile kadın bir ses duyuyor ve seçim bozuk sanıyordu.
   * Ses üretilemezse yanlış bir sesle konuşmak yerine sebebini bildiriyoruz.
   *
   * Aynı anda tek bir okuma çalar: yeni bir çağrı ya da stopSpeaking()
   * öncekini geçersiz kılar, iki sesin üst üste binmesi mümkün değildir.
   */
  const speakText = useCallback(
    async (text: string): Promise<boolean> => {
      const clean = stripForSpeech(text);
      if (!clean) return false;
      stopSpeaking();
      const gen = speakGen.current;
      const isStale = () => gen !== speakGen.current;
      setSpeaking(true);
      try {
        // Ses her seferinde okunur: kullanıcı Ayarlar'dan değiştirdiğinde
        // sayfayı yenilemeye gerek kalmadan bir sonraki cevapta geçerli olur.
        const voice = getSelectedVoice();
        setActiveVoice(voice);
        const r = await speak({ data: { text: clean, voice } });
        if (isStale()) return false;
        if (!r.audioBase64) {
          setSpeaking(false);
          setError(r.error ?? "Seçtiğiniz ses üretilemedi, sesli cevap verilemiyor.");
          return false;
        }
        const audio = new Audio(`data:${r.mediaType ?? "audio/mpeg"};base64,${r.audioBase64}`);
        audioRef.current = audio;
        return await new Promise<boolean>((resolve) => {
          let settled = false;
          const done = (v: boolean) => {
            if (settled) return;
            settled = true;
            if (speakDoneRef.current === done) speakDoneRef.current = null;
            audio.onended = null;
            audio.onerror = null;
            setSpeaking(false);
            resolve(v);
          };
          speakDoneRef.current = done;
          audio.onended = () => done(true);
          audio.onerror = () => {
            if (!isStale()) setError("Ses çalınamadı.");
            done(false);
          };
          // Otomatik oynatma engellenmiş olabilir: bu bir hata değil, çağıran
          // taraf ilk kullanıcı dokunuşunda yeniden dener.
          audio.play().catch(() => done(false));
        });
      } catch (e: any) {
        setSpeaking(false);
        if (isStale()) return false;
        setError(e?.message ?? "Sesli cevap üretilemedi.");
        return false;
      }
    },
    [speak, stopSpeaking],
  );

  /* ------------------------- DİNLEME (STT) ------------------------- */

  const startListeningRef = useRef<() => void>(() => {});

  /**
   * Döngünün hâlâ bu oturuma ait olup olmadığı. Oturum kapatılıp hemen yeniden
   * açılırsa eski turun devamı yeni oturumu ele geçirip ikinci bir döngü
   * (dolayısıyla üst üste binen sesler) başlatmasın diye sıra numarası tutuyoruz.
   */
  const isLive = useCallback((gen: number) => sessionRef.current && gen === sessionGen.current, []);

  /** Bir tur: cevabı üret, sesliyse oku, oturum sürüyorsa yeniden dinle. */
  const runTurn = useCallback(
    async (text: string, gen: number) => {
      try {
        const answer = await onFinalRef.current(text);
        if (answer && autoSpeakRef.current && isLive(gen)) {
          await speakText(answer);
        }
      } catch {
        /* cevap üretilemedi — döngüyü yine de sürdür */
      }
      if (isLive(gen)) {
        setTimeout(() => {
          if (isLive(gen)) startListeningRef.current();
        }, 300);
      }
    },
    [speakText, isLive],
  );

  const finish = useCallback(
    (text: string) => {
      const gen = sessionGen.current;
      const t = text.trim();
      setInterim("");
      setListening(false);

      if (t) {
        emptyStreak.current = 0;
        void runTurn(t, gen);
        return;
      }

      // Ses algılanmadı: oturum açıksa tekrar dene, üst üste boşsa kapat.
      if (!isLive(gen)) return;
      emptyStreak.current += 1;
      if (emptyStreak.current >= MAX_EMPTY_STREAK) {
        emptyStreak.current = 0;
        sessionGen.current += 1;
        sessionRef.current = false;
        setSession(false);
        setError("Sesiniz algılanamadı, sesli sohbet kapatıldı.");
        return;
      }
      setTimeout(() => {
        if (isLive(gen)) startListeningRef.current();
      }, 400);
    },
    [runTurn, isLive],
  );

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
        if (blob.size < 1200) return finish("");
        setProcessing(true);
        try {
          const buf = await blob.arrayBuffer();
          let bin = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const r = await transcribe({
            data: { audioBase64: btoa(bin), mediaType: blob.type || "audio/webm" },
          });
          if (r.error) setError(r.error);
          finish(r.text ?? "");
        } catch (e: any) {
          setError(e?.message ?? "Ses işlenemedi.");
        } finally {
          setProcessing(false);
        }
      };
      mr.start();
      setListening(true);
      // Web Speech yoksa sabit süreli kayıt: 12 saniye sonra kendiliğinden kapat.
      setTimeout(() => {
        if (mediaRef.current === mr && mr.state !== "inactive") mr.stop();
      }, 12000);
    } catch (e: any) {
      sessionRef.current = false;
      setSession(false);
      setError(
        e?.name === "NotAllowedError"
          ? "Mikrofon izni verilmedi. Tarayıcı adres çubuğundaki mikrofon simgesinden izin verin."
          : (e?.message ?? "Mikrofon açılamadı."),
      );
      setListening(false);
    }
  }, [transcribe, finish]);

  /** Sessizlik sonrası kaç ms beklenecek (kullanıcı nefes alıp devam edebilsin). */
  const SILENCE_TIMEOUT_MS = 2500;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    stopSpeaking();
    clearSilenceTimer();
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      void startMediaRecorder();
      return;
    }
    try {
      const rec: Recognition = new Ctor();
      rec.lang = "tr-TR";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      finalRef.current = "";

      /** Kullanıcının manuel olarak durdurduğunu izlemek için bayrak. */
      let manualStop = false;

      rec.onresult = (ev: any) => {
        let live = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalRef.current += r[0].transcript;
          else live += r[0].transcript;
        }
        setInterim(finalRef.current + live);

        // Her yeni konuşma algılandığında sessizlik zamanlayıcısını sıfırla.
        // Kullanıcı nefes alıp devam ederse zamanlayıcı yeniden başlar.
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          // Sessizlik süresi doldu — biriken transcript'i gönder.
          manualStop = true;
          try { rec.stop(); } catch { /* yoksay */ }
        }, SILENCE_TIMEOUT_MS);
      };
      rec.onerror = (ev: any) => {
        clearSilenceTimer();
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          sessionRef.current = false;
          setSession(false);
          setError("Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verin.");
        } else if (ev.error !== "aborted" && ev.error !== "no-speech") {
          setError("Ses tanıma hatası: " + ev.error);
        }
        setListening(false);
      };
      rec.onend = () => {
        clearSilenceTimer();
        recRef.current = null;
        finish(finalRef.current);
      };

      recRef.current = rec;
      setInterim("");
      setListening(true);
      rec.start();
    } catch {
      void startMediaRecorder();
    }
  }, [stopSpeaking, startMediaRecorder, finish, clearSilenceTimer]);

  startListeningRef.current = startListening;

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* yoksay */
      }
      return;
    }
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
      mediaRef.current = null;
    }
    setListening(false);
  }, [clearSilenceTimer]);

  /* ------------------------- OTURUM KONTROLÜ ------------------------- */

  const stopSession = useCallback(() => {
    clearSilenceTimer();
    // Sıra numarasını ilerlet: uçuşta olan turların devamı bu oturuma ait
    // sayılmaz, kapattıktan sonra kendiliğinden yeniden dinlemeye geçemezler.
    sessionGen.current += 1;
    sessionRef.current = false;
    setSession(false);
    emptyStreak.current = 0;
    setInterim("");
    stopSpeaking();
    if (recRef.current) {
      try {
        recRef.current.abort();
      } catch {
        /* yoksay */
      }
      recRef.current = null;
    }
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
      mediaRef.current = null;
    }
    setListening(false);
  }, [stopSpeaking, clearSilenceTimer]);

  const startSession = useCallback(() => {
    // Önce eskiyi tamamen kapat: yarım kalmış tur varsa yeni oturuma sızmasın.
    stopSession();
    sessionGen.current += 1;
    emptyStreak.current = 0;
    sessionRef.current = true;
    setSession(true);
    startListening();
  }, [startListening, stopSession]);

  const toggleSession = useCallback(() => {
    if (sessionRef.current) stopSession();
    else startSession();
  }, [startSession, stopSession]);

  useEffect(
    () => () => {
      sessionGen.current += 1;
      sessionRef.current = false;
      try {
        recRef.current?.abort?.();
      } catch {
        /* yoksay */
      }
      if (mediaRef.current && mediaRef.current.state !== "inactive") mediaRef.current.stop();
      if (audioRef.current) audioRef.current.pause();
    },
    [],
  );

  return {
    supported,
    session,
    listening,
    speaking,
    processing,
    interim,
    error,
    autoSpeak,
    setAutoSpeak,
    activeVoice,
    startSession,
    stopSession,
    toggleSession,
    stopListening,
    speakText,
    stopSpeaking,
  };
}
