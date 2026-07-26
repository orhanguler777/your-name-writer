import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, FileText, User as UserIcon, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "WhatsApp Belge Hattı — Belediye AI" }] }),
});

const DOCS = {
  evlendirme: [
    "Nüfus cüzdanı fotokopisi",
    "Vesikalık fotoğraf",
    "Sağlık raporu",
    "İkametgah belgesi",
    "Başvuru formu",
  ],
  ruhsat: [
    "Tapu fotokopisi",
    "Kira kontratı veya mülkiyet belgesi",
    "Vergi levhası",
    "Oda kayıt belgesi",
    "Gerekirse itfaiye uygunluk raporu",
    "Başvuru formu",
  ],
  numarataj: [
    "Tapu belgesi",
    "Yapı ruhsatı",
    "Kimlik fotokopisi",
    "Dilekçe",
    "Gerekirse adres krokisi",
  ],
};

function detectTopic(text: string): keyof typeof DOCS | null {
  const t = text.toLowerCase();
  if (/(nikah|evlen|evlilik)/.test(t)) return "evlendirme";
  if (/(ruhsat|işyeri|is yeri|açma)/.test(t)) return "ruhsat";
  if (/(numarataj|adres|kapı numarası)/.test(t)) return "numarataj";
  return null;
}

function Page() {
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "bot"; text: string; buttons?: string[]; docs?: string[] }>
  >([
    {
      role: "bot",
      text: 'Merhaba! 👋 Belediyemiz belge hattına hoş geldiniz. Size nasıl yardımcı olabilirim?\n\nÖrnek: "Nikah için hangi belgeler lazım?" veya "Ruhsat başvurusu"',
    },
  ]);
  const [input, setInput] = useState("");

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;
    const userMsg = { role: "user" as const, text: q };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    setTimeout(() => {
      const topic = detectTopic(q);
      if (topic) {
        const label =
          topic === "evlendirme"
            ? "Evlendirme / Nikah"
            : topic === "ruhsat"
              ? "İşyeri Ruhsatı"
              : "Numarataj / Adres";
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            text: `📄 ${label} işlemleri için gerekli belgeler:`,
            docs: DOCS[topic],
            buttons: [
              "Belgeleri PDF Olarak Gönder",
              "Gerçek Temsilci ile Görüş",
              "Şikayet Oluştur",
            ],
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            text: "Anlayamadım. Şu konularda yardımcı olabilirim:\n\n• Nikah / evlendirme belgeleri\n• İşyeri ruhsatı belgeleri\n• Numarataj / adres belgeleri",
            buttons: ["Nikah belgeleri", "Ruhsat belgeleri", "Numarataj belgeleri"],
          },
        ]);
      }
    }, 400);
  };

  return (
    <div>
      <PageHeader
        title="WhatsApp Belge Hattı"
        description="Vatandaşların belge sorgusu için WhatsApp benzeri simülasyon ekranı."
      />

      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden">
          <div className="bg-[oklch(0.5_0.15_155)] p-4 text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Belediye Belge Hattı</div>
              <div className="text-xs opacity-80">Çevrimiçi · yanıt süresi anlık</div>
            </div>
          </div>
          <div className="bg-[oklch(0.95_0.02_140)] p-4 h-[60vh] overflow-y-auto space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-3 text-sm ${m.role === "user" ? "bg-[oklch(0.7_0.12_155)] text-white" : "bg-white shadow-sm"}`}
                >
                  <div className="flex items-center gap-1 text-xs opacity-70 mb-1">
                    {m.role === "user" ? (
                      <UserIcon className="h-3 w-3" />
                    ) : (
                      <Bot className="h-3 w-3" />
                    )}
                    {m.role === "user" ? "Vatandaş" : "Belediye"}
                  </div>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.docs && (
                    <ul className="mt-2 space-y-1">
                      {m.docs.map((d) => (
                        <li key={d} className="flex items-start gap-2">
                          <FileText className="h-3 w-3 mt-1 text-accent" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.buttons && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.buttons.map((b) => (
                        <button
                          key={b}
                          onClick={() => send(b)}
                          className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent hover:bg-accent/20"
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t bg-white p-3 flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Mesaj yazın..."
              className="rounded-full"
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full bg-[oklch(0.5_0.15_155)] hover:bg-[oklch(0.45_0.15_155)]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
