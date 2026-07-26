import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, Send, User } from "lucide-react";
import { askMayorBot } from "@/lib/mayor-bot.functions";

export const Route = createFileRoute("/_authenticated/baskan-ai-bot")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Başkan AI Bot — Belediye AI" }] }),
});

const SUGGESTIONS = [
  "Fığla mahallesine gideceğim, genel durum ve şikayetleri nelerdir?",
  "Neydi bu şikayetlerin detayları?",
  "En çok hangi mahalleden şikayet geliyor?",
  "Hangi müdürlük şikayetlere en hızlı dönüş yapıyor?",
  "Son 30 günde Fen İşleri Müdürlüğü performansı nasıl?",
  "Hangi araçlar uzun süredir tamirde?",
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
    {
      role: "assistant",
      content: "Merhaba başkanım. Belediye verileriniz hakkında sorularınızı sorabilirsiniz.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;

    // Yalnızca user mesajı eklendi
    const userMsg = { role: "user" as const, content: q };
    const newHistory = [...messages, userMsg];

    setMessages(newHistory);
    setInput("");
    setLoading(true);

    try {
      // Promptu tam history olarak atıyoruz (ilk karşılama mesajını hariç tutabiliriz veya gönderebiliriz)
      const r = await ask({
        data: {
          messages: newHistory.filter(
            (m) =>
              m.role === "user" ||
              m.content !==
                "Merhaba başkanım. Belediye verileriniz hakkında sorularınızı sorabilirsiniz.",
          ),
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: r.answer }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Üzgünüm, cevap üretilemedi: " + e.message },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Başkan AI Bot"
        description="Doğal dille belediye verileriniz hakkında sorular sorun."
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
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cevap üretiliyor...
              </div>
            )}
            <div ref={scrollRef} />
          </div>
          <div className="border-t pt-3 mt-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
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
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 font-semibold text-sm">Örnek Sorular</h3>
          <div className="space-y-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={loading}
                className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
