import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/menuPermissions";

export type { AppRole };

export interface AuthProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department_id: string | null;
  /** modules: birime tanımlı özel modüller (ör. ['zabita']) */
  departments?: { name: string; modules?: string[] | null } | null;
}

// Eski "rol simülasyonu" özelliğinden kalan iz (varsa) temizlenir.
// Yetki testleri artık gerçek hesaplarla yapılır; istemci tarafı rol taklidi
// veritabanı (RLS) tarafından tanınmadığı için yanıltıcı sonuç veriyordu.
const LEGACY_SIMULATED_ROLE_KEY = "belediye_simulated_role";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(LEGACY_SIMULATED_ROLE_KEY);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async (sess: Session | null) => {
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess?.user) {
        setRoles([]);
        setProfile(null);
        setLoading(false);
        return;
      }
      const PROFILE_COLS = "id, full_name, email, phone, department_id";
      const [{ data: r }, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", sess.user.id),
        // departments.modules henüz eklenmemiş olabilir; hata olursa modülsüz tekrar denenir
        supabase
          .from("profiles")
          .select(`${PROFILE_COLS}, departments(name, modules)`)
          .eq("id", sess.user.id)
          .maybeSingle(),
      ]);

      let p = profileRes.data;
      if (profileRes.error) {
        const fallback = await supabase
          .from("profiles")
          .select(`${PROFILE_COLS}, departments(name)`)
          .eq("id", sess.user.id)
          .maybeSingle();
        p = fallback.data;
      }

      if (!mounted) return;
      setRoles(((r ?? []) as { role: AppRole }[]).map((x) => x.role));
      setProfile(p as AuthProfile | null);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => load(s), 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (...rs: AppRole[]) => rs.some((r) => roles.includes(r));

  // Yetki hiyerarşisi (en üstten aşağıya). Hem yeni hem eski rol adları tanınır.
  const primaryRole: AppRole = roles.includes("superuser") || roles.includes("admin")
    ? "superuser"
    : roles.includes("baskan")
    ? "baskan"
    : roles.includes("baskan_yardimcisi")
    ? "baskan_yardimcisi"
    : roles.includes("cozum_masasi")
    ? "cozum_masasi"
    : roles.includes("mudur")
    ? "mudur"
    : roles.includes("mudurluk")
    ? "mudurluk"
    : roles.includes("sef")
    ? "sef"
    : roles.includes("personel")
    ? "personel"
    : roles.includes("zabita_memuru") || roles.includes("zabita")
    ? "zabita_memuru"
    : "vatandas";

  /** 4. seviye: birim/saha görevlisi (genel 'personel' veya eski 'zabita_memuru') */
  const isFieldStaff = primaryRole === "personel" || primaryRole === "zabita_memuru";

  /** Kullanıcının müdürlüğüne tanımlı özel modüller (ör. ['zabita']) */
  const modules: string[] = profile?.departments?.modules ?? [];

  const hasModule = (m: string) => {
    // Üst yönetim tüm modülleri görür
    if (primaryRole === "superuser" || primaryRole === "baskan") return true;
    if (modules.includes(m)) return true;
    // Modül kolonu henüz yoksa isimden çıkarım (geriye dönük uyum)
    if (m === "zabita") {
      return (
        primaryRole === "zabita_memuru" ||
        (profile?.departments?.name?.toLowerCase().includes("zabıta") ?? false)
      );
    }
    return false;
  };

  const isZabita = hasModule("zabita");

  return {
    session,
    user,
    roles,
    primaryRole,
    realPrimaryRole: primaryRole,
    profile,
    loading,
    hasRole,
    hasAnyRole,
    isZabita,
    isFieldStaff,
    modules,
    hasModule,
  };
}
