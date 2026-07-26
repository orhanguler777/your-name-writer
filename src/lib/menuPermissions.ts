export type AppRole =
  | "superuser"
  | "baskan"
  | "baskan_yardimcisi"
  | "mudur"
  | "sef"
  | "personel"
  | "zabita_memuru"
  | "vatandas"
  | "cozum_masasi"
  | "mudurluk"
  | "admin"
  | "zabita";

export interface MenuItemConfig {
  id: string;
  to: string;
  label: string;
  iconName: string;
  defaultRoles: AppRole[];
  /**
   * Birime özel modül. Doluysa bu menü yalnızca kullanıcının müdürlüğünde
   * ilgili modül tanımlıysa görünür (rol kademeyi, modül birimi belirler).
   */
  module?: string;
  description?: string;
}

export const MENU_ITEMS_CONFIG: MenuItemConfig[] = [
  {
    id: "panel",
    to: "/panel",
    label: "Ana Panel",
    iconName: "LayoutDashboard",
    defaultRoles: [
      "superuser",
      "baskan",
      "baskan_yardimcisi",
      "mudur",
      "sef",
      "admin",
      "cozum_masasi",
      "mudurluk",
      "zabita_memuru",
      "zabita",
    ],
  },
  {
    id: "sikayetler",
    to: "/sikayetler",
    label: "Şikayetler",
    iconName: "MessageSquare",
    defaultRoles: [
      "superuser",
      "baskan",
      "baskan_yardimcisi",
      "mudur",
      "sef",
      "admin",
      "cozum_masasi",
      "mudurluk",
    ],
  },
  {
    id: "bilgi-talepleri",
    to: "/bilgi-talepleri",
    label: "Bilgi Talepleri",
    iconName: "HelpCircle",
    defaultRoles: [
      "superuser",
      "baskan",
      "baskan_yardimcisi",
      "mudur",
      "sef",
      "admin",
      "cozum_masasi",
      "mudurluk",
    ],
  },
  {
    id: "cozum-masasi",
    to: "/cozum-masasi",
    label: "Çözüm Masası",
    iconName: "HeadphonesIcon",
    defaultRoles: ["superuser", "baskan", "admin", "cozum_masasi"],
  },
  {
    id: "zabita-denetim",
    to: "/zabita-denetim",
    label: "İşyeri Denetimi",
    iconName: "ClipboardCheck",
    defaultRoles: ["superuser", "mudur", "sef", "zabita_memuru", "zabita"],
    module: "zabita",
  },
  {
    id: "zabita-isyerleri",
    to: "/zabita-isyerleri",
    label: "İşyeri Listesi",
    iconName: "Building2",
    defaultRoles: ["superuser", "baskan_yardimcisi", "mudur", "sef", "zabita_memuru", "zabita"],
    module: "zabita",
  },
  {
    id: "zabita-harita",
    to: "/zabita-harita",
    label: "Saha Haritası",
    iconName: "MapPin",
    defaultRoles: [
      "superuser",
      "baskan",
      "baskan_yardimcisi",
      "mudur",
      "sef",
      "zabita_memuru",
      "zabita",
    ],
    module: "zabita",
  },
  {
    id: "zabita-karekod",
    to: "/zabita-karekod",
    label: "Karekod Yönetimi",
    iconName: "QrCode",
    defaultRoles: ["superuser", "mudur", "sef", "zabita_memuru", "zabita"],
    module: "zabita",
  },
  {
    id: "tutanak-arsivi",
    to: "/tutanak-arsivi",
    label: "Tutanak Arşivi",
    iconName: "Archive",
    defaultRoles: ["superuser", "baskan_yardimcisi", "mudur", "sef", "zabita_memuru", "zabita"],
    module: "zabita",
  },
  {
    id: "memnuniyet",
    to: "/memnuniyet",
    label: "Memnuniyet Analizi",
    iconName: "Smile",
    defaultRoles: ["superuser", "baskan", "admin", "cozum_masasi"],
  },
  {
    id: "baskan-ai-bot",
    to: "/baskan-ai-bot",
    label: "Başkan AI Bot",
    iconName: "Bot",
    defaultRoles: ["superuser", "baskan"],
  },
  {
    id: "gunluk-mesajlar",
    to: "/gunluk-mesajlar",
    label: "Günlük Mesajlar",
    iconName: "Send",
    defaultRoles: [
      "superuser",
      "baskan",
      "admin",
      "mudur",
      "sef",
      "mudurluk",
      "zabita_memuru",
      "zabita",
    ],
  },
  {
    id: "arac-bakim",
    to: "/arac-bakim",
    label: "Araç Bakım",
    iconName: "Truck",
    defaultRoles: ["superuser", "baskan_yardimcisi", "mudur", "sef", "admin", "mudurluk"],
  },
  {
    id: "personel-analizi",
    to: "/personel-analizi",
    label: "Personel Analizi",
    iconName: "UserCheck",
    defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "sef", "admin"],
  },
  {
    id: "duyurular",
    to: "/duyurular",
    label: "Duyurular & Reklamlar",
    iconName: "Megaphone",
    defaultRoles: [
      "superuser",
      "baskan",
      "baskan_yardimcisi",
      "mudur",
      "sef",
      "admin",
      "cozum_masasi",
    ],
  },
  {
    id: "anketler",
    to: "/anketler",
    label: "Anketler",
    iconName: "PieChart",
    defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "sef", "admin"],
  },
  {
    id: "vatandaslar",
    to: "/vatandaslar",
    label: "Vatandaşlar & Segmentasyon",
    iconName: "Users",
    defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "admin", "cozum_masasi"],
  },
  {
    id: "ayarlar",
    to: "/ayarlar",
    label: "Ayarlar & RBAC Matrisi",
    iconName: "Settings",
    defaultRoles: ["superuser", "baskan", "admin"],
  },
];

// Eski sürümde matris tarayıcıda tutuluyordu; artık veritabanında.
const LEGACY_LOCAL_STORAGE_KEY = "belediye_role_menu_permissions_v1";

export const ALL_ROLES: AppRole[] = [
  "superuser",
  "baskan",
  "baskan_yardimcisi",
  "mudur",
  "sef",
  "personel",
  "zabita_memuru",
  "vatandas",
  "cozum_masasi",
  "mudurluk",
  "admin",
  "zabita",
];

export type RoleMenuMatrix = Record<AppRole, Record<string, boolean>>;

export function getDefaultRoleMenuMatrix(): RoleMenuMatrix {
  const roles: AppRole[] = ALL_ROLES;
  const matrix: Partial<RoleMenuMatrix> = {};

  roles.forEach((r) => {
    matrix[r] = {};
    MENU_ITEMS_CONFIG.forEach((m) => {
      // Superuser has all enabled by default
      if (r === "superuser") {
        matrix[r]![m.id] = true;
      } else {
        matrix[r]![m.id] = m.defaultRoles.includes(r);
      }
    });
  });

  return matrix as RoleMenuMatrix;
}

/**
 * Veritabanından okunan matrisin bellek önbelleği.
 * Senkron çağrılar (isMenuItemAllowedForRole) bunu kullanır; henüz yüklenmediyse
 * varsayılanlara düşer. Önbellek useMenuPermissions hook'u tarafından doldurulur.
 */
let cachedMatrix: RoleMenuMatrix | null = null;

export function getCachedRoleMenuMatrix(): RoleMenuMatrix {
  return cachedMatrix ?? getDefaultRoleMenuMatrix();
}

/** Eski localStorage kaydını temizler (bir kereye mahsus geçiş). */
export function clearLegacyLocalMatrix(): void {
  if (typeof window !== "undefined") localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
}

/** Matrisi veritabanından çeker. Tablo/veri yoksa varsayılanlara düşer. */
export async function fetchRoleMenuMatrix(): Promise<RoleMenuMatrix> {
  const { supabase } = await import("@/integrations/supabase/client");
  const defaults = getDefaultRoleMenuMatrix();

  const { data, error } = await supabase
    .from("role_menu_permissions")
    .select("role, menu_id, allowed");

  if (error || !data || data.length === 0) {
    // Tablo henüz oluşturulmadıysa veya boşsa sistemin çalışmaya devam etmesi için varsayılanlar
    if (error) console.warn("Yetki matrisi okunamadı, varsayılanlar kullanılıyor:", error.message);
    cachedMatrix = defaults;
    return defaults;
  }

  const merged: RoleMenuMatrix = defaults;
  (data as { role: AppRole; menu_id: string; allowed: boolean }[]).forEach((row) => {
    if (!merged[row.role]) merged[row.role] = {};
    merged[row.role][row.menu_id] = row.allowed;
  });

  cachedMatrix = merged;
  return merged;
}

/** Matrisi veritabanına yazar (yalnızca üst yönetim; RLS zorunlu kılar). */
export async function saveRoleMenuMatrix(matrix: RoleMenuMatrix): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: auth } = await supabase.auth.getUser();

  const rows: {
    role: AppRole;
    menu_id: string;
    allowed: boolean;
    updated_by: string | null;
    updated_at: string;
  }[] = [];
  (Object.keys(matrix) as AppRole[]).forEach((role) => {
    MENU_ITEMS_CONFIG.forEach((m) => {
      rows.push({
        role,
        menu_id: m.id,
        allowed: role === "superuser" ? true : !!matrix[role]?.[m.id],
        updated_by: auth?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      });
    });
  });

  const { error } = await supabase
    .from("role_menu_permissions")
    .upsert(rows, { onConflict: "role,menu_id" });

  if (error) throw new Error(error.message);

  cachedMatrix = matrix;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("role_permissions_updated"));
  }
}

/** Matrisi kod içindeki varsayılanlara döndürür (DB'ye yazar). */
export async function resetRoleMenuMatrix(): Promise<RoleMenuMatrix> {
  const defaults = getDefaultRoleMenuMatrix();
  await saveRoleMenuMatrix(defaults);
  clearLegacyLocalMatrix();
  return defaults;
}

export function isMenuItemAllowedForRole(role: AppRole, menuId: string): boolean {
  if (role === "superuser") return true;
  const matrix = getCachedRoleMenuMatrix();
  if (matrix[role] && typeof matrix[role][menuId] === "boolean") {
    return matrix[role][menuId];
  }
  const item = MENU_ITEMS_CONFIG.find((m) => m.id === menuId);
  return item ? item.defaultRoles.includes(role) : false;
}
