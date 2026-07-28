import { useState } from "react";
import { Mic } from "lucide-react";

/** Kurumsal logo dosyası — public/ klasöründe. */
const LOGO_SRC = "/aib-logo.gif";
/**
 * Logo yatay (en/boy ≈ 1.4), düğme ise daire. object-contain logoyu kare kutuya
 * sığdırır ama kutunun köşeleri dairenin dışında kaldığı için logonun sol/sağ
 * uçları kesilirdi. Bu ölçek, logo içeriğinin köşelerini dairenin içinde tutan
 * en büyük değer (ölçüldü: sınır 0.88, güvenlik payıyla 0.86).
 * Logo dosyası değişirse bu değeri yeniden ölçmek gerekir.
 */
const LOGO_SCALE = 0.86;

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
      {/*
        Üç durum, üç ayrı hareket — biri diğerine benzemesin:
        dinliyor = dışa yayılan, analiz = çevresinde dönen, konuşuyor = yerinde nabız.
        Önceden analiz ve konuşma aynı animate-pulse'u paylaşıyordu, ayırt edilemiyordu.
      */}

      {/* Dinliyor: dışa yayılan dolgu halka (ses içeri giriyor) */}
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-[#ff6b00]/35" />}

      {/*
        Analiz ediyor: çevresinde dönen yay. Süre bilinmediği için baştan sona
        dolan bir çubuk değil — o "%80 bitti" gibi tutulamayacak bir söz olurdu.
      */}
      {processing && (
        <svg
          className="pointer-events-none absolute -inset-[7px] animate-spin"
          style={{ animationDuration: "1.1s" }}
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="#ff6b00"
            strokeWidth="5"
            strokeLinecap="round"
            /* çevre ≈ 295; ilk değer yayın uzunluğu (~çeyrek tur) */
            strokeDasharray="78 217"
          />
        </svg>
      )}

      {/* Konuşuyor: yerinde duran, nabız atan halka */}
      {speaking && (
        <span className="pointer-events-none absolute -inset-[7px] animate-pulse rounded-full border-[5px] border-[#ff6b00]/60" />
      )}

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
          "relative flex h-full w-full items-center justify-center",
          "overflow-hidden rounded-full text-white shadow-lg shadow-[#ff6b00]/30 outline-none",
          "transition-[transform,box-shadow,filter] duration-150 ease-out",
          "focus-visible:ring-4 focus-visible:ring-[#ff6b00]/35",
          // Logonun zemini beyaz; düğme zemini de beyaz olmalı, yoksa dairenin
          // köşelerinde beyaz kutu ile düğme rengi arasında dikiş görünür.
          logoMissing ? "bg-[#ff6b00]" : "bg-white",
          active ? "ring-4 ring-[#ff6b00]/40" : "",
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
            className="pointer-events-none h-full w-full object-contain"
            style={{ transform: `scale(${LOGO_SCALE})` }}
          />
        )}
      </button>
    </div>
  );
}
