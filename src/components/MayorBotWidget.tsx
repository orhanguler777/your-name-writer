import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Loader2, Send, User, MessageSquareText, X } from "lucide-react";
import { askMayorBot } from "@/lib/mayor-bot.functions";

const SUGGESTIONS = [
  "Fığla şikayetleri neler?",
  "En çok şikayet alan mahalle?",
  "Hangi araçlar tamirde?",
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
            <Link key={i} to={match[2]} className="text-blue-300 font-semibold underline hover:text-blue-200 ml-1 mr-1">
              {match[1]}
            </Link>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function MayorBotWidget() {
  const ask = useServerFn(askMayorBot);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "Merhaba başkanım. Nasıl yardımcı olabilirim?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, isOpen]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;
    
    const userMsg = { role: "user" as const, content: q };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInput("");
    setLoading(true);
    
    try {
      const r = await ask({ data: { messages: newHistory.filter(m => m.role === "user" || m.content !== "Merhaba başkanım. Nasıl yardımcı olabilirim?") } });
      setMessages((m) => [...m, { role: "assistant", content: r.answer }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: "Üzgünüm, cevap üretilemedi: " + e.message }]);
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button 
          onClick={() => setIsOpen(!isOpen)}
          size="icon" 
          className="h-16 w-16 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground relative"
        >
          {isOpen ? <X className="h-7 w-7" /> : <Bot className="h-7 w-7" />}
          {!isOpen && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-5 w-5 bg-accent"></span>
            </span>
          )}
        </Button>
      </div>

      {/* Chat Window */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 z-50 w-[350px] sm:w-[400px] h-[550px] max-h-[calc(100vh-120px)] flex flex-col shadow-2xl border-primary/20 overflow-hidden flex-shrink-0">
          <div className="bg-primary p-3 text-primary-foreground flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <div>
              <h3 className="font-semibold text-sm">Başkan AI Bot</h3>
              <p className="text-[10px] opacity-80">Belediye Veri Asistanı</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full mt-1 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}>
                  {m.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>
                <div className={`rounded-xl p-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-slate-800 text-slate-100 rounded-tl-none"}`}>
                  <MarkdownText text={m.content} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full mt-1 bg-accent text-accent-foreground">
                  <Bot className="h-3 w-3" />
                </div>
                <div className="rounded-xl p-3 text-sm bg-slate-800 text-slate-300 rounded-tl-none flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Yanıtlıyor...
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <div className="p-3 border-t bg-background space-y-3">
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SUGGESTIONS.map(s => (
                  <button 
                    key={s} 
                    onClick={() => send(s)} 
                    disabled={loading}
                    className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground px-2 py-1 rounded-full transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
              <Input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Başkanım, sorunuz nedir?" 
                disabled={loading}
                className="text-sm"
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      )}
    </>
  );
}
