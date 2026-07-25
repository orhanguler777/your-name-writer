export const STATUS_LABELS: Record<string, string> = {
  yeni: "Yeni",
  incelemede: "İncelemede",
  personele_atandi: "Personele Atandı",
  devam_ediyor: "Devam Ediyor",
  vatandas_yaniti_bekleniyor: "Vatandaş Yanıtı Bekleniyor",
  cozuldu: "Çözüldü",
  reddedildi: "Reddedildi",
};

export const STATUS_TOKENS: Record<string, string> = {
  yeni: "yeni",
  incelemede: "yeni",
  personele_atandi: "beklemede",
  devam_ediyor: "devam",
  vatandas_yaniti_bekleniyor: "beklemede",
  cozuldu: "cozuldu",
  reddedildi: "reddedildi",
};

export const PRIORITY_LABELS: Record<string, string> = {
  yuksek: "Yüksek",
  orta: "Orta",
  dusuk: "Düşük",
};

export const ROLE_LABELS: Record<string, string> = {
  vatandas: "Vatandaş",
  cozum_masasi: "Çözüm Masası",
  mudurluk: "Müdürlük Kullanıcısı",
  baskan: "Başkan",
  admin: "Admin",
  zabita: "Zabıta Ekibi",
};

export const CATEGORIES = [
  "Yol / Altyapı",
  "Temizlik",
  "Park ve Bahçeler",
  "İmar",
  "Su / Kanalizasyon",
  "Ulaşım",
  "Gürültü",
  "Sokak Hayvanları",
  "Evlendirme",
  "Ruhsat",
  "Numarataj",
  "Diğer",
] as const;

export const LANGUAGES: Record<string, string> = {
  tr: "Türkçe",
  en: "İngilizce",
  ar: "Arapça",
  de: "Almanca",
};

// Keyword → department mapping for local AI fallback
export const KEYWORD_MAP: Array<{ words: string[]; category: string; department: string }> = [
  { words: ["çöp", "temizlik", "koku", "atık", "konteyner"], category: "Temizlik", department: "Temizlik İşleri Müdürlüğü" },
  { words: ["yol", "asfalt", "çukur", "kaldırım"], category: "Yol / Altyapı", department: "Fen İşleri Müdürlüğü" },
  { words: ["park", "ağaç", "bahçe", "yeşil alan", "budama"], category: "Park ve Bahçeler", department: "Park ve Bahçeler Müdürlüğü" },
  { words: ["ruhsat", "işyeri açma", "izin"], category: "Ruhsat", department: "Ruhsat ve Denetim Müdürlüğü" },
  { words: ["evlilik", "nikah", "evlendirme"], category: "Evlendirme", department: "Evlendirme Memurluğu" },
  { words: ["numarataj", "adres", "kapı numarası"], category: "Numarataj", department: "Numarataj Birimi" },
  { words: ["imar", "kaçak yapı", "inşaat"], category: "İmar", department: "İmar ve Şehircilik Müdürlüğü" },
  { words: ["hayvan", "sokak köpeği", "kedi"], category: "Sokak Hayvanları", department: "Veteriner İşleri Müdürlüğü" },
  { words: ["otobüs", "durak", "ulaşım", "sefer"], category: "Ulaşım", department: "Ulaşım Hizmetleri Müdürlüğü" },
  { words: ["su", "kanalizasyon", "sızıntı", "vidanjör"], category: "Su / Kanalizasyon", department: "Su ve Kanalizasyon Müdürlüğü" },
  { words: ["gürültü", "ses"], category: "Gürültü", department: "Zabıta Müdürlüğü" },
];

export const HIGH_PRIORITY_WORDS = ["acil", "tehlike", "kaza", "yangın", "tehlikeli", "çocuk"];
export const LOW_PRIORITY_WORDS = ["bilgi", "öğrenmek", "soru", "nasıl"];

export function classifyLocally(text: string) {
  const t = text.toLowerCase();
  let match = KEYWORD_MAP.find((k) => k.words.some((w) => t.includes(w)));
  if (!match) match = { words: [], category: "Diğer", department: "Kültür ve Sosyal İşler Müdürlüğü" };
  const priority = HIGH_PRIORITY_WORDS.some((w) => t.includes(w))
    ? "yuksek"
    : LOW_PRIORITY_WORDS.some((w) => t.includes(w))
    ? "dusuk"
    : "orta";
  return { category: match.category, department: match.department, priority, confidence: 0.72 };
}

export function statusToken(status: string): string {
  return STATUS_TOKENS[status] ?? "yeni";
}
