import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { synthesizeSpeech } from "@/lib/voice.functions";
import {
  DEFAULT_VOICE,
  VOICE_OPTIONS,
  getSelectedVoice,
  setSelectedVoice,
  type VoiceGender,
} from "@/lib/voice-options";

/** Önizlemede okunan örnek brifing cümlesi. */
const SAMPLE_TEXT =
  "Başkanım, bu hafta çözüm oranı yüzde 62'ye çıktı. Yalnız yol bakımında 4 iş hâlâ bekliyor. Önerim, Fen İşleri'ne bugün talimat vermeniz.";

const GROUPS: Array<{ gender: VoiceGender; title: string }> = [
  { gender: "erkek", title: "Erkek sesler" },
  { gender: "kadin", title: "Kadın sesler" },
];

/**
 * Başkan AI'ın sesli yanıtlarında kullanılacak sesin seçildiği kart.
 * Seçim anında kaydedilir (kullanıcı başına, tarayıcıda saklanır).
 */
export function VoiceSettingsCard() {
  const speak = useServerFn(synthesizeSpeech);
  const [selected, setSelected] = useState(DEFAULT_VOICE);
  /** Önizlemesi hazırlanan sesin kimliği (yükleniyor göstergesi için). */
  const [loadingId, setLoadingId] = useState<string | null>(null);
  /** Şu an çalan sesin kimliği. */
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Her önizleme isteğine artan sıra no — iptal edilen isteğin sesi sonradan çalmasın. */
  const genRef = useRef(0);

  // localStorage yalnızca tarayıcıda okunabilir; ilk render'dan sonra al.
  useEffect(() => {
    setSelected(getSelectedVoice());
  }, []);

  const stop = () => {
    genRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
    setLoadingId(null);
  };

  // Sayfadan ayrılırken çalan önizleme arkada kalmasın.
  useEffect(() => () => stop(), []);

  const choose = (id: string) => {
    setSelected(id);
    setSelectedVoice(id);
  };

  const preview = async (id: string) => {
    if (playingId === id || loadingId === id) {
      stop();
      return;
    }
    stop();
    const gen = genRef.current;
    setLoadingId(id);
    try {
      const r = await speak({ data: { text: SAMPLE_TEXT, voice: id } });
      if (gen !== genRef.current) return;
      if (!r.audioBase64) {
        setLoadingId(null);
        toast.error("Ses önizlemesi alınamadı. OpenAI anahtarını kontrol edin.");
        return;
      }
      const audio = new Audio(`data:${r.mediaType ?? "audio/mpeg"};base64,${r.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => {
        if (gen === genRef.current) setPlayingId(null);
      };
      audio.onerror = () => {
        if (gen !== genRef.current) return;
        setPlayingId(null);
        toast.error("Ses çalınamadı.");
      };
      setLoadingId(null);
      setPlayingId(id);
      await audio.play();
    } catch {
      if (gen !== genRef.current) return;
      setLoadingId(null);
      setPlayingId(null);
      toast.error("Ses önizlemesi alınamadı.");
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-display font-semibold text-primary">Başkan AI Sesi</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Başkan AI sesli sohbette bu sesle konuşur. Dinle düğmesiyle örnek bir brifing cümlesini
          deneyebilirsiniz. Seçim anında kaydedilir ve yalnızca sizin hesabınız için geçerlidir.
        </p>
      </div>

      {GROUPS.map((group) => (
        <div key={group.gender} className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </Label>
          <div className="space-y-2">
            {VOICE_OPTIONS.filter((v) => v.gender === group.gender).map((v) => {
              const isSelected = selected === v.id;
              return (
                <div
                  key={v.id}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => choose(v.id)}
                    aria-pressed={isSelected}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected ? "border-primary" : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{v.label}</span>
                      <span className="block text-xs text-muted-foreground">{v.description}</span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => preview(v.id)}
                    disabled={loadingId !== null && loadingId !== v.id}
                    aria-label={`${v.label} sesini dinle`}
                  >
                    {loadingId === v.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : playingId === v.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">
                      {playingId === v.id ? "Durdur" : "Dinle"}
                    </span>
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Card>
  );
}
