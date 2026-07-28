import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, Send, User, Volume2, VolumeX, Square } from "lucide-react";
import { askMayorBot } from "@/lib/mayor-bot.functions";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import { VoiceTalkButton } from "@/components/VoiceTalkButton";
import { getVoiceLabel } from "@/lib/voice-options";

export const Route = createFileRoute("/_authenticated/baskan-ai-bot")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Başkan AI Bot — Belediye AI" }] }),
});

const GREETING = "Merhaba başkanım, size nasıl yardımcı olabilirim?";

/**
 * Karşılama sesi bu süre içinde tekrar çalınmaz. Bileşen kısa aralıkla yeniden
 * mount olursa (HMR, ileri/geri gezinme) başkan aynı cümleyi iki kez duymasın.
 */
const GREET_COOLDOWN_MS = 30_000;
let lastGreetedAt = 0;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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
    if (Date.now() - lastGreetedAt < GREET_COOLDOWN_MS) return;
    lastGreetedAt = Date.now();

    let retryHandler: (() => void) | null = null;
    const cleanupRetry = () => {
      if (retryHandler) {
        window.removeEventListener("pointerdown", retryHandler);
        retryHandler = null;
      }
    };

    void (async () => {
      if (!voiceRef.current.autoSpeak) return;
      const played = await voiceRef.current.speakText(GREETING);
      if (played) return;
      retryHandler = () => {
        cleanupRetry();
        // Dokunuş turuncu düğmeye geldiyse oturum başlıyor demektir; karşılama
        // sözünü araya sokmamak için tıklamanın işlenmesini bekleyip vazgeç.
        setTimeout(() => {
          const v = voiceRef.current;
          if (v.autoSpeak && !v.session && !v.listening) void v.speakText(GREETING);
        }, 250);
      };
      window.addEventListener("pointerdown", retryHandler, { once: true });
    })();

    return cleanupRetry;
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, voice.interim]);

  return (
    // Alt boşluk: sabit duran sesli sohbet düğmesi içeriğin üstünü örtmesin.
    <div className="pb-36">
      <PageHeader
        title="Başkan AI Bot"
        description="Yazarak veya sesli konuşarak belediye verileriniz hakkında sorular sorun."
      />
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="p-4 lg:col-span-3 flex flex-col h-[70vh]">
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
                >
                  {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[80%] rounded-lg p-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-slate-800 text-slate-100"}`}
                >
                  <MarkdownText text={m.content} />
                  {m.role === "assistant" && i > 0 && (
                    <button
                      onClick={() => voice.speakText(m.content)}
                      className="mt-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
                      title="Bu cevabı sesli dinle"
                    >
                      <Volume2 className="h-3 w-3" /> Dinle
                    </button>
                  )}
                </div>
              </div>
            ))}

            {voice.listening && (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
                {voice.interim || "Dinliyorum başkanım..."}
              </div>
            )}
            {voice.processing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Sesiniz yazıya çevriliyor...
              </div>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cevap üretiliyor...
              </div>
            )}
            {voice.error && <div className="text-sm text-red-400">{voice.error}</div>}
            <div ref={scrollRef} />
          </div>

          <div className="border-t pt-3 mt-3 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Yazıya geçildi: sesli oturumu kapat, ikisi çakışmasın.
                voice.stopSession();
                void send();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Sorunuzu yazın..."
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={voice.autoSpeak ? "default" : "outline"}
                onClick={() => voice.setAutoSpeak(!voice.autoSpeak)}
                title="Cevapları sesli oku"
                className="text-xs"
              >
                {voice.autoSpeak ? (
                  <Volume2 className="mr-1 h-3 w-3" />
                ) : (
                  <VolumeX className="mr-1 h-3 w-3" />
                )}
                Sesli cevap {voice.autoSpeak ? "açık" : "kapalı"} ·{" "}
                {getVoiceLabel(voice.activeVoice)}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={voice.speaking ? "destructive" : "outline"}
                onClick={() => {
                  // Sesli oturumu da kapat, yoksa döngü hemen yeni bir tura
                  // geçip tekrar konuşmaya başlar. stopSession sesi de keser.
                  voice.stopSession();
                }}
                title="Konuşmayı kes"
                className="text-xs"
              >
                <Square className="mr-1 h-3 w-3" /> Sesi kes
              </Button>
              {!voice.supported && (
                <span className="col-span-2 text-xs text-muted-foreground">
                  Sesli giriş için Chrome, Edge veya Safari kullanın.
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 font-semibold text-sm">Örnek Sorular</h3>
          <div className="space-y-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void send(s)}
                disabled={loading}
                className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Sesli sohbet düğmesi ekranın altına sabit: sayfa kaydırılsa da hep erişilebilir. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center">
        <div className="pointer-events-auto">
          <VoiceTalkButton
            active={voice.session}
            listening={voice.listening}
            processing={voice.processing}
            speaking={voice.speaking}
            disabled={!voice.supported}
            size={116}
            onToggle={voice.toggleSession}
          />
        </div>
      </div>
    </div>
  );
}
