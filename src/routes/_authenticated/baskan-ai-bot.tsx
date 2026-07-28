import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, Send, User, Volume2, Mic, X, Menu } from "lucide-react";
import { askMayorBot } from "@/lib/mayor-bot.functions";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { VoiceTalkButton } from "@/components/VoiceTalkButton";

export const Route = createFileRoute("/_authenticated/baskan-ai-bot")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Başkan AI Bot — Belediye AI" }] }),
});

const GREETING = "Merhaba başkanım, size nasıl yardımcı olabilirim?";

const SUGGESTIONS = [
  "Bugünün genel durumu nedir, öne çıkan riskler neler?",
  "En uzun süredir çözülmeyen şikayetler hangileri?",
  "Hangi mahallede şikayet çok ama memnuniyet düşük?",
  "Müdürlüklerin çözüm süresi ve memnuniyet karnesi nasıl?",
  "Fığla mahallesine gideceğim, genel durum nedir?",
  "Zabıta denetimlerinde riskli işyerleri hangileri?",
  "Hangi araçlar uzun süredir tamirde?",
  "Personel devamsızlık ve fazla mesai tablosu nasıl?",
  "Yaklaşan etkinlikler ve anket sonuçları neler?",
];

// Basit bir parser: Metin içindeki [İncele](/sikayetler/123) yapısını bulur ve <Link> render eder.
function MarkdownText({ text }: { text: string }) {
  const parts = text.split(/(\[.*?\]\(.*?\))/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/\[(.*?)\]\((.*?)\)/);
        if (match) {
          return (
            <Link
              key={i}
              to={match[2]}
              className="text-blue-300 font-semibold underline hover:text-blue-200 ml-1 mr-1"
            >
              {match[1]}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Page() {
  const ask = useServerFn(askMayorBot);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getLogoSize = () => {
    if (windowWidth < 768) return 280;   // Mobil
    if (windowWidth < 1024) return 420;  // Tablet (iPad)
    return 520;                         // Masaüstü / Büyük Ekran
  };

  const send = useCallback(
    async (text?: string, opts?: { voice?: boolean }) => {
      const q = (text ?? input).trim();
      if (!q) return;

      const newHistory = [...messagesRef.current, { role: "user" as const, content: q }];
      setMessages(newHistory);
      setInput("");
      setLoading(true);

      try {
        const r = await ask({
          data: {
            messages: newHistory.filter((m) => m.role === "user" || m.content !== GREETING),
            voice: !!opts?.voice,
          },
        });
        setMessages((m) => [...m, { role: "assistant", content: r.answer }]);
        return r.answer;
      } catch (e: any) {
        const msg = "Üzgünüm, cevap üretilemedi: " + e.message;
        setMessages((m) => [...m, { role: "assistant", content: msg }]);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [ask, input],
  );

  // Sesli sohbet döngüsünü hook yönetir: cevabı döndürmek yeterli.
  const voice = useVoiceChat({ onFinalTranscript: (text) => send(text, { voice: true }) });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  // Sayfa açılışında karşılama cümlesini sesli oku. Tarayıcı otomatik sesi
  // engellerse (sayfa doğrudan yenilenmişse olur) ilk dokunuşta tekrar dener.
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;

    let retryHandler: (() => void) | null = null;
    const cleanupRetry = () => {
      if (retryHandler) {
        window.removeEventListener("pointerdown", retryHandler);
        retryHandler = null;
      }
    };

    void (async () => {
      const v = voiceRef.current;
      if (!v.autoSpeak) return;

      // Oturumu otomatik başlat (Mikrofonu ve dinleme döngüsünü aktif eder)
      if (!v.session) {
        v.startSession();
      }

      const played = await v.speakText(GREETING);
      if (played) return;
      
      retryHandler = () => {
        cleanupRetry();
        // Dokunuş turuncu düğmeye geldiyse oturum başlıyor demektir; karşılama
        // sözünü araya sokmamak için tıklamanın işlenmesini bekleyip vazgeç.
        setTimeout(() => {
          const cv = voiceRef.current;
          if (cv.autoSpeak && !cv.session && !cv.listening) void cv.speakText(GREETING);
        }, 250);
      };
      window.addEventListener("pointerdown", retryHandler, { once: true });
    })();

    return cleanupRetry;
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading, voice.interim]);

  const getStatusText = () => {
    if (voice.listening) return voice.interim || "Dinliyorum başkanım...";
    if (voice.processing || loading) return "Düşünüyorum...";
    if (voice.speaking) return "Konuşuyorum...";
    if (voice.session) return "Başlamak için logoya veya mikrofona dokunun";
    return "Sesli sohbet için logoya dokunun";
  };

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-slate-950 overflow-hidden relative">
      
      {/* Üst Minimalist Nav Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-900 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("toggle-sidebar"))}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors flex items-center justify-center"
            title="Menüyü Aç"
          >
            <Menu className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
          <span className="font-semibold text-slate-800 dark:text-slate-200">ALA Bot</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {isVoiceMode ? "Sesli Odak Modu" : "Yazılı Geçmiş Modu"}
        </div>
      </div>

      {isVoiceMode ? (
        /* ================================================================== */
        /* MOD 1: TAM SAYFA SESLİ ODAK MODU                                     */
        /* ================================================================== */
        <div className="flex-1 flex flex-col items-center justify-between p-6 relative">
          
          <div className="flex-1 flex flex-col items-center justify-center relative z-10 w-full">
            {/* Ortada Dev Animasyonlu Logo */}
            <div className="transition-all duration-300">
              <VoiceTalkButton
                active={voice.session}
                listening={voice.listening}
                processing={voice.processing || loading}
                speaking={voice.speaking}
                disabled={!voice.supported}
                size={getLogoSize()}
                onToggle={voice.toggleSession}
              />
            </div>
            
            {/* Durum Metni */}
            <p className="mt-8 md:mt-10 text-lg md:text-2xl font-semibold text-slate-500 dark:text-slate-400 text-center max-w-xl min-h-[2rem] tracking-wide">
              {getStatusText()}
            </p>

            {/* Son Konuşulanlar (Mini Transkript) */}
            {messages.length > 1 && (
              <div className="mt-6 md:mt-8 flex flex-col gap-3 max-w-xl w-full text-center bg-slate-50 dark:bg-slate-900/50 px-6 py-4 rounded-2xl border border-slate-100 dark:border-slate-800 backdrop-blur-sm z-10 shadow-sm">
                {/* Son Kullanıcı Sorusu */}
                {(() => {
                  const lastUser = [...messages].reverse().find((m) => m.role === "user");
                  return lastUser ? (
                    <div className="text-xs md:text-sm text-slate-400 dark:text-slate-500 italic line-clamp-2">
                      “{lastUser.content}”
                    </div>
                  ) : null;
                })()}
                {/* Son Asistan Yanıtı */}
                {(() => {
                  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content !== GREETING);
                  return lastAssistant ? (
                    <div className="text-sm md:text-lg font-semibold text-slate-700 dark:text-slate-300 line-clamp-4 leading-relaxed mt-1.5">
                      {lastAssistant.content}
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Alt Kontrol Barı (ChatGPT Sesli Modeli Stili) */}
          <div className="w-full max-w-2xl mx-auto z-10 flex-shrink-0 pb-4 px-2">
            <div className="flex gap-3 md:gap-4 items-center">
              
              {/* Giriş Kutusu */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  voice.stopSession();
                  void send();
                }}
                className="flex-1 flex gap-2 bg-slate-100 dark:bg-slate-900 p-2 md:p-2.5 rounded-full items-center pl-5 pr-2 shadow-sm border border-slate-200/50 dark:border-slate-800"
              >
                <span className="text-slate-400 text-lg font-medium mr-1 select-none">+</span>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="ALA'ya sor..."
                  disabled={loading}
                  className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-base md:text-lg text-slate-800 dark:text-slate-100 flex-1 h-10 md:h-11 p-0 placeholder:text-slate-400"
                />
                <Button 
                  type="submit" 
                  size="icon"
                  disabled={loading || !input.trim()}
                  className="h-10 w-10 rounded-full bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-300 text-white dark:text-black flex-shrink-0"
                >
                  <Send className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              </form>

              {/* Mikrofon Butonu */}
              <button
                type="button"
                onClick={() => {
                  voice.startSession();
                }}
                disabled={!voice.supported}
                className={`h-12 w-12 md:h-14 md:w-14 rounded-full flex items-center justify-center border transition-all ${
                  voice.session 
                    ? "bg-emerald-500 border-emerald-500 text-white animate-pulse" 
                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                }`}
                title="Sesli Konuşmayı Başlat"
              >
                <Mic className="h-6 w-6 md:h-7 md:w-7" />
              </button>

              {/* Kapatma Butonu (Siyah X) */}
              <button
                type="button"
                onClick={() => {
                  voice.stopSession();
                  setIsVoiceMode(false);
                }}
                className="h-12 w-12 md:h-14 md:w-14 rounded-full bg-black hover:bg-slate-900 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                title="Geçmişe Dön"
              >
                <X className="h-6 w-6" />
              </button>

            </div>
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* MOD 2: TAM SAYFA YAZILI GEÇMİŞ MODU                                   */
        /* ================================================================== */
        <div className="flex-1 flex flex-col justify-between p-6 relative overflow-hidden">
          
          {/* Mesajlar Listesi (Çerçevesiz, düz ve temiz iMessage/ChatGPT stili) */}
          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto space-y-6 pr-2 mb-4 scroll-smooth max-w-2xl mx-auto w-full"
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    m.role === "user" 
                      ? "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200" 
                      : "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                  }`}
                >
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === "user" 
                      ? "bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-tr-none" 
                      : "bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 text-slate-800 dark:text-slate-100 rounded-tl-none shadow-sm"
                  }`}
                >
                  <MarkdownText text={m.content} />
                  {m.role === "assistant" && i > 0 && (
                    <button
                      onClick={() => voice.speakText(m.content)}
                      className="mt-2.5 flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title="Bu cevabı sesli dinle"
                    >
                      <Volume2 className="h-3.5 w-3.5" /> Dinle
                    </button>
                  )}
                </div>
              </div>
            ))}

            {voice.listening && (
              <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium pl-11">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {voice.interim || "Dinleniyor..."}
              </div>
            )}
            {voice.processing && (
              <div className="flex items-center gap-2 text-xs text-slate-400 pl-11">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ses çözümleniyor...
              </div>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-400 pl-11">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> ALA yanıt hazırlıyor...
              </div>
            )}
            {voice.error && <div className="text-xs text-red-500 pl-11">{voice.error}</div>}
          </div>

          {/* Alt Giriş Barı ve ALA Logosu */}
          <div className="w-full max-w-2xl mx-auto flex-shrink-0 border-t border-slate-100 dark:border-slate-900 pt-4 pb-2 bg-white dark:bg-slate-950">
            <div className="flex gap-3 items-center">
              
              {/* Giriş Kutusu */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className="flex-1 flex gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-full items-center pl-4 pr-1.5 shadow-sm border border-slate-200/50 dark:border-slate-800"
              >
                <span className="text-slate-400 text-base font-medium mr-1 select-none">+</span>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Sorunuzu yazın..."
                  disabled={loading}
                  className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm text-slate-800 dark:text-slate-100 flex-1 h-9 p-0 placeholder:text-slate-400"
                />
                <Button 
                  type="submit" 
                  size="icon"
                  disabled={loading || !input.trim()}
                  className="h-8 w-8 rounded-full bg-slate-800 hover:bg-slate-700 dark:bg-slate-200 dark:hover:bg-slate-300 text-white dark:text-black flex-shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>

              {/* Mikrofon Butonu (Yazılı modda sesli girişi tetikler) */}
              <button
                type="button"
                onClick={() => {
                  setIsVoiceMode(true);
                  if (!voice.session) voice.startSession();
                }}
                disabled={!voice.supported}
                className="h-11 w-11 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
                title="Sesli Girişi Başlat"
              >
                <Mic className="h-5 w-5" />
              </button>

              {/* Bizim Logo Butonumuz (Mavi dalga ikonu yerine logomuza tıklayınca Sesli Odak Moduna geçiş) */}
              <button
                type="button"
                onClick={() => {
                  setIsVoiceMode(true);
                  if (!voice.session) voice.toggleSession();
                }}
                className="h-11 w-11 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-1.5 shadow-md transition-transform hover:scale-105 active:scale-95"
                title="ALA Sesli Odak Modunu Aç"
              >
                <img 
                  src="/alalogo.png" 
                  alt="ALA Sesli" 
                  className="h-full w-full object-contain"
                />
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
