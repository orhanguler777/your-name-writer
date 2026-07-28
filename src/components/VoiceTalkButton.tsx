import { useState } from "react";
import { Mic } from "lucide-react";

/** Kurumsal logo dosyası — public/ klasöründe, kare görsel daire olarak kırpılır. */
const LOGO_SRC = "/aib-logo.jpg";
/** Logonun daire içinde ne kadar dolgun görüneceği. Kırpma çok sıkı/gevşekse bunu değiştir. */
const LOGO_ZOOM = 1.35;

type Props = {
  /** Sesli sohbet oturumu açık mı. */
  active: boolean;
  listening: boolean;
  processing: boolean;
  speaking: boolean;
  disabled?: boolean;
  /** Daire çapı (px). */
  size?: number;
  onToggle: () => void;
};

/**
 * Sesli sohbet düğmesi — aib logosu daire olarak kırpılmış halde.
 *
 * Bir kez dokunulur, soru-cevap döngüsü kendiliğinden sürer; tekrar
 * dokununca durur. Logo public/aib-logo.jpg dosyasından okunur; dosya
 * yoksa mikrofon simgesi yedeğe düşer.
 */
export function VoiceTalkButton({
  active,
  listening,
  processing,
  speaking,
  disabled,
  size = 96,
  onToggle,
}: Props) {
  const [logoMissing, setLogoMissing] = useState(false);

  return (
    <div className="relative select-none" style={{ width: size, height: size }}>
      {/* Dinlerken dışa yayılan halka */}
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-[#ff6b00]/35" />}

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
            : active
              ? "Sesli sohbeti durdurmak için dokunun"
              : "Sesli sohbeti başlatmak için dokunun"
        }
        className={[
          "relative flex h-full w-full items-center justify-center",
          "overflow-hidden rounded-full text-white shadow-lg shadow-[#ff6b00]/30 outline-none",
          "transition-[transform,box-shadow,filter] duration-150 ease-out",
          "focus-visible:ring-4 focus-visible:ring-[#ff6b00]/35",
          logoMissing ? "bg-[#ff6b00]" : "",
          active ? "ring-4 ring-[#ff6b00]/40" : "",
          listening ? "brightness-90" : "",
          processing || speaking ? "animate-pulse" : "",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:brightness-105 active:scale-95 active:shadow-md",
        ].join(" ")}
      >
        {logoMissing ? (
          // public/aib-logo.jpg yoksa arayüz kırılmasın: sade mikrofon simgesi.
          <Mic className="pointer-events-none h-[38%] w-[38%]" />
        ) : (
          <img
            src={LOGO_SRC}
            alt="aib"
            draggable={false}
            onError={() => setLogoMissing(true)}
            className="pointer-events-none h-full w-full object-cover"
            style={{ transform: `scale(${LOGO_ZOOM})` }}
          />
        )}
      </button>
    </div>
  );
}
