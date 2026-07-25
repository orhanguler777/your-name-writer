export type AppRole = 
  | "superuser"
  | "baskan"
  | "baskan_yardimcisi"
  | "mudur"
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
  description?: string;
}

export const MENU_ITEMS_CONFIG: MenuItemConfig[] = [
  { id: "panel", to: "/panel", label: "Ana Panel", iconName: "LayoutDashboard", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "admin", "cozum_masasi", "mudurluk"] },
  { id: "sikayetler", to: "/sikayetler", label: "Şikayetler", iconName: "MessageSquare", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "admin", "cozum_masasi", "mudurluk"] },
  { id: "bilgi-talepleri", to: "/bilgi-talepleri", label: "Bilgi Talepleri", iconName: "HelpCircle", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "admin", "cozum_masasi", "mudurluk"] },
  { id: "cozum-masasi", to: "/cozum-masasi", label: "Çözüm Masası", iconName: "HeadphonesIcon", defaultRoles: ["superuser", "baskan", "admin", "cozum_masasi"] },
  { id: "zabita-denetim", to: "/zabita-denetim", label: "İşyeri Denetimi", iconName: "ClipboardCheck", defaultRoles: ["superuser", "mudur", "zabita_memuru", "zabita"] },
  { id: "zabita-isyerleri", to: "/zabita-isyerleri", label: "İşyeri Listesi", iconName: "Building2", defaultRoles: ["superuser", "baskan_yardimcisi", "mudur", "zabita_memuru", "zabita"] },
  { id: "zabita-harita", to: "/zabita-harita", label: "Saha Haritası", iconName: "MapPin", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "zabita_memuru", "zabita"] },
  { id: "tutanak-arsivi", to: "/tutanak-arsivi", label: "Tutanak Arşivi", iconName: "Archive", defaultRoles: ["superuser", "baskan_yardimcisi", "mudur", "zabita_memuru", "zabita"] },
  { id: "memnuniyet", to: "/memnuniyet", label: "Memnuniyet Analizi", iconName: "Smile", defaultRoles: ["superuser", "baskan", "admin", "cozum_masasi"] },
  { id: "baskan-ai-bot", to: "/baskan-ai-bot", label: "Başkan AI Bot", iconName: "Bot", defaultRoles: ["superuser", "baskan"] },
  { id: "gunluk-mesajlar", to: "/gunluk-mesajlar", label: "Günlük Mesajlar", iconName: "Send", defaultRoles: ["superuser", "baskan", "admin", "mudur", "mudurluk", "zabita_memuru", "zabita"] },
  { id: "arac-bakim", to: "/arac-bakim", label: "Araç Bakım", iconName: "Truck", defaultRoles: ["superuser", "baskan_yardimcisi", "mudur", "admin", "mudurluk"] },
  { id: "personel-analizi", to: "/personel-analizi", label: "Personel Analizi", iconName: "UserCheck", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "admin"] },
  { id: "duyurular", to: "/duyurular", label: "Duyurular & Reklamlar", iconName: "Megaphone", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "admin", "cozum_masasi"] },
  { id: "anketler", to: "/anketler", label: "Anketler", iconName: "PieChart", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "mudur", "admin"] },
  { id: "vatandaslar", to: "/vatandaslar", label: "Vatandaşlar & Segmentasyon", iconName: "Users", defaultRoles: ["superuser", "baskan", "baskan_yardimcisi", "admin", "cozum_masasi"] },
  { id: "ayarlar", to: "/ayarlar", label: "Ayarlar & RBAC Matrisi", iconName: "Settings", defaultRoles: ["superuser", "baskan", "admin"] },
];

const LOCAL_STORAGE_PERMISSIONS_KEY = "belediye_role_menu_permissions_v1";

export type RoleMenuMatrix = Record<AppRole, Record<string, boolean>>;

export function getDefaultRoleMenuMatrix(): RoleMenuMatrix {
  const roles: AppRole[] = ["superuser", "baskan", "baskan_yardimcisi", "mudur", "zabita_memuru", "vatandas", "cozum_masasi", "mudurluk", "admin", "zabita"];
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

export function getRoleMenuMatrix(): RoleMenuMatrix {
  if (typeof window === "undefined") return getDefaultRoleMenuMatrix();
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PERMISSIONS_KEY);
    if (!raw) return getDefaultRoleMenuMatrix();
    const parsed = JSON.parse(raw);
    const defaults = getDefaultRoleMenuMatrix();
    // Merge defaults with stored values so new menus/roles don't break
    const merged: Partial<RoleMenuMatrix> = {};
    (Object.keys(defaults) as AppRole[]).forEach((r) => {
      merged[r] = { ...defaults[r], ...(parsed[r] || {}) };
    });
    return merged as RoleMenuMatrix;
  } catch (e) {
    console.error("Failed to parse role menu matrix", e);
    return getDefaultRoleMenuMatrix();
  }
}

export function saveRoleMenuMatrix(matrix: RoleMenuMatrix): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_PERMISSIONS_KEY, JSON.stringify(matrix));
    window.dispatchEvent(new Event("role_permissions_updated"));
  } catch (e) {
    console.error("Failed to save role menu matrix", e);
  }
}

export function isMenuItemAllowedForRole(role: AppRole, menuId: string): boolean {
  if (role === "superuser") return true;
  const matrix = getRoleMenuMatrix();
  if (matrix[role] && typeof matrix[role][menuId] === "boolean") {
    return matrix[role][menuId];
  }
  const item = MENU_ITEMS_CONFIG.find((m) => m.id === menuId);
  return item ? item.defaultRoles.includes(role) : false;
}
