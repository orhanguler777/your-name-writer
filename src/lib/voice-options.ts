/**
 * Başkan AI'ın sesli yanıtlarında kullanılabilen sesler.
 *
 * Seçim kullanıcı başına tarayıcıda saklanır (localStorage): sunucu tarafında
 * yazılabilir dosya sistemi bulunmadığı için ayar dosyasına yazmak canlıda
 * kalıcı olmuyor. Seçilen ses her TTS isteğinde sunucuya parametre olarak gider.
 *
 * Bu dosya hem tarayıcıda hem sunucuda kullanılır — ses tanımlarının tek
 * doğruluk kaynağı burasıdır, sunucu tarafı da buradan okur.
 */

export type VoiceGender = "erkek" | "kadin";

export type VoiceOption = {
  /** OpenAI ses kimliği — TTS isteğine bu değer gönderilir. */
  id: string;
  label: string;
  gender: VoiceGender;
  /** Ayarlar ekranında seçeneğin altında görünen kısa karakter tarifi. */
  description: string;
};

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: "ash", label: "Ahmet", gender: "erkek", description: "Ağırbaşlı ve sıcak — önerilen" },
  { id: "onyx", label: "Kemal", gender: "erkek", description: "Derin ve otoriter" },
  { id: "ballad", label: "Sinan", gender: "erkek", description: "Yavaş, tok ve vurgulu" },
  { id: "echo", label: "Murat", gender: "erkek", description: "Net ve mesafeli" },
  { id: "verse", label: "Emre", gender: "erkek", description: "Canlı ve genç" },
  { id: "sage", label: "Elif", gender: "kadin", description: "Sakin ve dengeli" },
  { id: "coral", label: "Deniz", gender: "kadin", description: "Sıcak ve samimi" },
  { id: "nova", label: "Selin", gender: "kadin", description: "Net ve enerjik" },
  { id: "shimmer", label: "Ayşe", gender: "kadin", description: "Yumuşak ve ince" },
];

export const DEFAULT_VOICE = "ash";

const STORAGE_KEY = "mayor-ai-voice";

export function findVoiceOption(id: string): VoiceOption | undefined {
  return VOICE_OPTIONS.find((v) => v.id === id);
}

/** Kullanıcının seçtiği ses. Seçim yoksa ya da tanınmıyorsa varsayılana döner. */
export function getSelectedVoice(): string {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    // Elle bozulmuş ya da eski bir değere düşmemek için doğrula.
    return v && findVoiceOption(v) ? v : DEFAULT_VOICE;
  } catch {
    // Gizli sekme / depolama kapalı olabilir.
    return DEFAULT_VOICE;
  }
}

export function setSelectedVoice(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* yoksay */
  }
}

export function getVoiceLabel(id: string): string {
  return findVoiceOption(id)?.label ?? id;
}
