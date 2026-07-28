/** Markdown/işaretleme temizliği — sesli okunacak metin için. Hem sunucu hem tarayıcıda kullanılır. */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [İncele](/x) -> İncele
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/[*_#>|]/g, "")
    .replace(/\\\[|\\\]|\\frac|\\text/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\r?\n{2,}/g, ". ")
    .replace(/\r?\n/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 3800);
}
