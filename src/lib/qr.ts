import QRCode from "qrcode";
import { ALANYA_LOGO_DATA_URL } from "./alanya-logo";

/** Amblem her karekod için yeniden çözülmesin: toplu baskıda yüzlerce kod üretiliyor. */
let logoPromise: Promise<HTMLImageElement> | null = null;
function logoImage(): Promise<HTMLImageElement> {
  if (!logoPromise) logoPromise = loadImage(ALANYA_LOGO_DATA_URL);
  return logoPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi"));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof (ctx as any).roundRect === "function") {
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Ortasında Alanya Belediyesi amblemi olan karekod üretir.
 * Hata düzeltme seviyesi H (%30) seçildiği için ortadaki logo maskelemesine
 * rağmen kod okunabilir kalır. Canvas kullanılamazsa düz karekoda düşer.
 */
export async function qrWithLogoDataUrl(
  text: string,
  opts: { size?: number; logoRatio?: number } = {},
): Promise<string> {
  const size = opts.size ?? 480;
  const logoRatio = opts.logoRatio ?? 0.22;

  const plain = await QRCode.toDataURL(text, {
    margin: 1,
    width: size,
    errorCorrectionLevel: "H",
  });

  if (typeof document === "undefined") return plain;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return plain;

    ctx.drawImage(await loadImage(plain), 0, 0, size, size);

    const logo = await logoImage();
    const box = Math.round(size * logoRatio);
    const pad = Math.round(box * 0.16);
    const x = Math.round((size - box) / 2);

    // Amblemin arkasına beyaz zemin: modüllerin üstüne binmesini engeller
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x - pad, x - pad, box + pad * 2, box + pad * 2, Math.round(box * 0.2));
    ctx.fill();

    // Logonun en-boy oranını koru
    const ratio = logo.width && logo.height ? logo.width / logo.height : 1;
    const w = ratio >= 1 ? box : box * ratio;
    const h = ratio >= 1 ? box / ratio : box;
    ctx.drawImage(logo, x + (box - w) / 2, x + (box - h) / 2, w, h);

    return canvas.toDataURL("image/png");
  } catch {
    return plain;
  }
}

/**
 * Karekod hedeflerinin kök adresi.
 * Etiketler sahada basıldığı için canlı adres VITE_PUBLIC_BASE_URL ile sabitlenmeli;
 * aksi halde geliştirme makinesinde basılan etiket localhost'u gösterir.
 */
export function publicBaseUrl(): string {
  const configured = import.meta.env?.VITE_PUBLIC_BASE_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/**
 * İşyeri adını karekod/eşleştirme için normalize eder.
 * Karekod isim taşıdığı için "VAHA  MARKET" ile "Vaha Market" aynı adrese düşmeli.
 */
export function normalizeWorkplaceName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** İşyeri etiketi karekodunun hedefi — halka açık uyum durumu sayfası. */
export function workplaceQrUrl(workplaceName: string): string {
  return `${publicBaseUrl()}/isyeri/${encodeURIComponent(normalizeWorkplaceName(workplaceName))}`;
}

/**
 * Okunan karekod adresini çözer. Belediyeye ait değilse null döner.
 * Hem işyeri etiketi (/isyeri/<ad>) hem tutanak karekodu (/dogrula/<id>) desteklenir.
 */
export function parseQrTarget(
  raw: string,
): { kind: "workplace"; name: string } | { kind: "tutanak"; id: string } | null {
  const text = raw.trim();
  try {
    const url = new URL(text);

    // Yalnızca kendi adresimizdeki karekodlar kabul edilir; başka bir sitenin
    // /isyeri/... yolu taşıyan karekodu bizim etiketimiz sayılmamalı.
    const allowed = new Set<string>();
    if (typeof window !== "undefined") allowed.add(window.location.host);
    const base = publicBaseUrl();
    if (base) {
      try {
        allowed.add(new URL(base).host);
      } catch {
        /* geçersiz yapılandırma */
      }
    }
    if (allowed.size > 0 && !allowed.has(url.host)) return null;

    const isyeri = url.pathname.match(/\/isyeri\/(.+)$/);
    if (isyeri)
      return { kind: "workplace", name: normalizeWorkplaceName(decodeURIComponent(isyeri[1])) };
    const dogrula = url.pathname.match(/\/dogrula\/([0-9a-f-]{36})$/i);
    if (dogrula) return { kind: "tutanak", id: dogrula[1] };
    return null;
  } catch {
    // URL değilse: elle girilen işyeri adı olarak kabul edilir
    if (text.length >= 2 && !text.includes("://")) {
      return { kind: "workplace", name: normalizeWorkplaceName(text) };
    }
    return null;
  }
}

/** Tutanak doğrulama karekodunun hedefi. */
export function tutanakQrUrl(inspectionId: string): string {
  return `${publicBaseUrl()}/dogrula/${inspectionId}`;
}
