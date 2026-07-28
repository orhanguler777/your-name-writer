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

/**
 * Sesli sohbet düğmesi — logo doğrudan, hiçbir container olmadan gösterilir.
 * Efektler drop-shadow / filter ile logonun kendi silüetine göre uygulanır.
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

  // Duruma göre drop-shadow efektleri — logonun kendi alpha kanalına göre çalışır.
  const getFilter = () => {
    if (listening) {
      return "drop-shadow(0 0 18px rgba(255,107,0,0.7)) drop-shadow(0 0 40px rgba(255,107,0,0.4))";
    }
    if (processing) {
      return "drop-shadow(0 0 14px rgba(255,107,0,0.6)) drop-shadow(0 0 30px rgba(255,170,0,0.35))";
    }
    if (speaking) {
      return "drop-shadow(0 0 12px rgba(255,107,0,0.55)) drop-shadow(0 0 24px rgba(255,140,0,0.3))";
    }
    if (active) {
      return "drop-shadow(0 0 8px rgba(255,107,0,0.4))";
    }
    return "drop-shadow(0 4px 8px rgba(0,0,0,0.15))";
  };

  return (
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
        "relative select-none bg-transparent border-none outline-none p-0",
        "transition-[transform,filter] duration-200 ease-out",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:brightness-110 active:scale-95",
      ].join(" ")}
      style={{ width: size, filter: getFilter() }}
    >
      {/* Dinliyor: nabız animasyonu */}
      <div
        className={[
          "relative w-full",
          listening ? "animate-pulse" : "",
          speaking ? "animate-bounce" : "",
        ].join(" ")}
        style={
          speaking
            ? { animationDuration: "1.5s" }
            : listening
              ? { animationDuration: "1.2s" }
              : undefined
        }
      >
        {logoMissing ? (
          <div
            className="flex items-center justify-center rounded-2xl bg-[#ff6b00] text-white"
            style={{ width: size, height: size * 0.7 }}
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
      </div>

      {/* Processing: dönen ince halka — logonun altında, inline SVG */}
      {processing && (
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full animate-spin"
          style={{ animationDuration: "1.4s" }}
          viewBox="0 0 100 70"
          fill="none"
          aria-hidden="true"
        >
          <ellipse
            cx="50"
            cy="35"
            rx="48"
            ry="33"
            stroke="#ff6b00"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="50 250"
          />
        </svg>
      )}
    </button>
  );
}
