/**
 * Sık kullanılan kısaltmalar — sesli okunduğunda harf harf ya da yarım kelime
 * duyulmasın diye açık hâlleriyle değiştirilir. Sıra önemli: uzun anahtar önce.
 */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bvb\./gi, "ve benzeri"],
  [/\bvs\./gi, "vesaire"],
  [/\bbkz\./gi, "bakınız"],
  [/\börn\./gi, "örneğin"],
  [/\bvd\./gi, "ve diğerleri"],
  [/\bmax\.?/gi, "en fazla"],
  [/\bmin\.?/gi, "en az"],
  [/\bort\./gi, "ortalama"],
  [/\badet\b/g, "adet"],
  [/\bTL\b/g, "lira"],
  [/\bm2\b|\bm²/gi, "metrekare"],
  [/\bkm\b/g, "kilometre"],
];

/**
 * Markdown/işaretleme temizliği — sesli okunacak metin için. Hem sunucu hem tarayıcıda kullanılır.
 *
 * Sadece işaretlemeyi silmekle kalmaz; TTS'in Türkçe'de yanlış okuduğu
 * sembolleri (%, ₺, &) ve kısaltmaları okunabilir kelimelere çevirir.
 */
export function stripForSpeech(text: string): string {
  let out = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [İncele](/x) -> İncele
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/[*_#>|]/g, "")
    .replace(/\\\[|\\\]|\\frac|\\text/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/[►▶→⇒]|->|=>/g, ", ");

  // Semboller: "%62" ve "62%" biçimlerinin ikisi de "yüzde 62" olarak okunur.
  out = out
    .replace(/%\s*(\d)/g, "yüzde $1")
    .replace(/(\d)\s*%/g, "yüzde $1")
    .replace(/₺\s*(\d)/g, "$1 lira")
    .replace(/(\d)\s*₺/g, "$1 lira")
    .replace(/\s&\s/g, " ve ");

  for (const [pattern, replacement] of ABBREVIATIONS) {
    out = out.replace(pattern, replacement);
  }

  return out
    .replace(/\r?\n{2,}/g, ". ")
    .replace(/\r?\n/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 3800);
}
