import { useState } from "react";
import { Mic } from "lucide-react";

/** Kurumsal logo dosyası — public/ klasöründe. */
const LOGO_SRC = "/alalogo.png";

type Props = {
  /** Sesli sohbet oturumu açık mı. */
  active: boolean;
  listening: boolean;
  processing: boolean;
  speaking: boolean;
  disabled?: boolean;
  /** Logo genişliği (px). */
  size?: number;
  onToggle: () => void;
};

/*
 * CSS keyframes — bileşen mount olunca bir kere enjekte edilir.
 */
const STYLE_ID = "ala-voice-fx";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes ala-orbit {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes ala-listen-ring {
      0%   { transform: scale(1);   opacity: 0.6; }
      70%  { transform: scale(1.18); opacity: 0; }
      100% { transform: scale(1.18); opacity: 0; }
    }
    @keyframes ala-speak-pulse {
      0%, 100% { filter: drop-shadow(0 0 8px rgba(255,107,0,0.4)); }
      50%      { filter: drop-shadow(0 0 22px rgba(255,107,0,0.75)); }
    }
    /* Düşünce baloncuğu: küçükten büyüyerek yukarı süzülür, sonra kaybolur */
    @keyframes ala-think-bubble {
      0%   { transform: scale(0.3) translateY(0);   opacity: 0; }
      15%  { transform: scale(0.9)   translateY(-5px); opacity: 0.85; }
      70%  { transform: scale(0.9)   translateY(-18px); opacity: 0.7; }
      100% { transform: scale(0.55) translateY(-28px); opacity: 0; }
    }
    /* Üç nokta animasyonu — baloncuğun içindeki noktalar sırayla zıplar */
    @keyframes ala-dot-bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30%           { transform: translateY(-3px); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Düşünce baloncukları — processing durumunda logonun sağ üstünden çıkar.
 * Comic-book tarzı: küçük → orta → büyük baloncuk zinciri + "..." animasyonu.
 */
function ThinkingBubbles({ size }: { size: number }) {
  const s = Math.max(size * 0.1, 12);

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        right: -s * 0.1,
        top: size * 0.1,
      }}
      aria-hidden="true"
    >
      {/* Küçük baloncuk — logoya en yakın */}
      <div
        className="absolute rounded-full bg-[#ff6b00]"
        style={{
          width: s * 0.35,
          height: s * 0.35,
          right: s * 1.2,
          bottom: -s * 0.1,
          animation: "ala-think-bubble 2.4s ease-in-out infinite",
          animationDelay: "0s",
        }}
      />
      {/* Orta baloncuk */}
      <div
        className="absolute rounded-full bg-[#ff6b00]"
        style={{
          width: s * 0.55,
          height: s * 0.55,
          right: s * 0.6,
          bottom: s * 0.2,
          animation: "ala-think-bubble 2.4s ease-in-out infinite",
          animationDelay: "0.2s",
        }}
      />
      {/* Ana baloncuk — içinde üç nokta var */}
      <div
        className="absolute rounded-full bg-[#ff6b00] flex items-center justify-center gap-[2.5px]"
        style={{
          width: s * 1.5,
          height: s * 1.1,
          right: -s * 0.3,
          bottom: s * 0.7,
          borderRadius: "50%",
          animation: "ala-think-bubble 2.4s ease-in-out infinite",
          animationDelay: "0.4s",
        }}
      >
        {/* Üç nokta */}
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block rounded-full bg-white"
            style={{
              width: s * 0.18,
              height: s * 0.18,
              minWidth: 2.5,
              minHeight: 2.5,
              animation: `ala-dot-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Sesli sohbet düğmesi — logo doğrudan gösterilir.
 *
 * Durumlar:
 *  - idle/active: doğal gölge
 *  - listening: dışa yayılan turuncu halka + parlak glow
 *  - processing: dönen halka + düşünce baloncukları
 *  - speaking: ritmik glow pulse
 */
export function VoiceTalkButton({
  active,
  listening,
  processing,
  speaking,
  disabled,
  size = 120,
  onToggle,
}: Props) {
  const [logoMissing, setLogoMissing] = useState(false);
  ensureStyles();

  // Sabit drop-shadow — duruma göre
  const getFilter = () => {
    if (processing) {
      return "drop-shadow(0 0 16px rgba(255,107,0,0.5))";
    }
    if (listening) {
      return "drop-shadow(0 0 18px rgba(255,107,0,0.65)) drop-shadow(0 0 40px rgba(255,107,0,0.3))";
    }
    if (speaking) {
      return undefined; // animate ile kontrol ediliyor
    }
    if (active) {
      return "drop-shadow(0 0 8px rgba(255,107,0,0.4))";
    }
    return "drop-shadow(0 4px 8px rgba(0,0,0,0.12))";
  };

  // Logo boyutunu ring boşluğuna göre ayarla
  const ringGap = processing ? 18 : listening ? 12 : 0;
  const totalSize = size + ringGap * 2;

  return (
    <div
      className="relative select-none"
      style={{ width: totalSize, height: totalSize }}
    >
      {/* ====== PROCESSING: Dönen gradient halka ====== */}
      {processing && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, #ff6b00 30%, #ffaa00 50%, #ff6b00 70%, transparent 100%)",
            animation: "ala-orbit 1.3s linear infinite",
            WebkitMask: `radial-gradient(circle, transparent ${Math.round(
              (size / 2 / (totalSize / 2)) * 100 - 4
            )}%, black ${Math.round(
              (size / 2 / (totalSize / 2)) * 100
            )}%)`,
            mask: `radial-gradient(circle, transparent ${Math.round(
              (size / 2 / (totalSize / 2)) * 100 - 4
            )}%, black ${Math.round(
              (size / 2 / (totalSize / 2)) * 100
            )}%)`,
          }}
          aria-hidden="true"
        />
      )}

      {/* ====== PROCESSING: Düşünce baloncukları ====== */}
      {processing && <ThinkingBubbles size={size} />}

      {/* ====== LISTENING: Dışa yayılan halkalar ====== */}
      {listening && (
        <>
          <div
            className="absolute rounded-full border-2 border-[#ff6b00]"
            style={{
              inset: ringGap - 4,
              animation: "ala-listen-ring 1.6s ease-out infinite",
            }}
            aria-hidden="true"
          />
          <div
            className="absolute rounded-full border-2 border-[#ff6b00]"
            style={{
              inset: ringGap - 4,
              animation: "ala-listen-ring 1.6s ease-out 0.5s infinite",
            }}
            aria-hidden="true"
          />
        </>
      )}

      {/* ====== ANA BUTON ====== */}
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={active ? "Sesli sohbeti kapat" : "Sesli sohbeti başlat"}
        aria-pressed={active}
        title={
          disabled
            ? "Bu tarayıcı sesli girişi desteklemiyor"
            : processing
              ? "Sorunuz değerlendiriliyor..."
              : speaking
                ? "Cevap okunuyor — durdurmak için dokunun"
                : listening
                  ? "Dinliyorum, konuşabilirsiniz"
                  : active
                    ? "Sesli sohbeti durdurmak için dokunun"
                    : "Sesli sohbeti başlatmak için dokunun"
        }
        className={[
          "absolute bg-transparent border-none outline-none p-0",
          "transition-[transform,filter] duration-200 ease-out",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:brightness-110 active:scale-95",
        ].join(" ")}
        style={{
          inset: ringGap,
          filter: getFilter(),
          animation: speaking
            ? "ala-speak-pulse 1.4s ease-in-out infinite"
            : undefined,
        }}
      >
        {logoMissing ? (
          <div
            className="flex items-center justify-center rounded-2xl bg-[#ff6b00] text-white w-full"
            style={{ aspectRatio: "1.43" }}
          >
            <Mic className="h-[40%] w-[40%]" />
          </div>
        ) : (
          <img
            src={LOGO_SRC}
            alt="Ala Asistan"
            draggable={false}
            onError={() => setLogoMissing(true)}
            className="pointer-events-none w-full h-auto"
          />
        )}
      </button>
    </div>
  );
}
