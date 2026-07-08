import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "vatandas" | "cozum_masasi" | "mudurluk" | "baskan" | "admin";

export interface AuthProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department_id: string | null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", sess.user.id),
        supabase.from("profiles").select("id, full_name, email, phone, department_id").eq("id", sess.user.id).maybeSingle(),
      ]);
      if (!mounted) return;
      setRoles(((r ?? []) as { role: AppRole }[]).map((x) => x.role));
      setProfile(p as AuthProfile | null);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Use setTimeout to avoid deadlocks per Supabase guidance
      setTimeout(() => load(s), 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (...rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const primaryRole: AppRole = roles.includes("admin")
    ? "admin"
    : roles.includes("baskan")
    ? "baskan"
    : roles.includes("cozum_masasi")
    ? "cozum_masasi"
    : roles.includes("mudurluk")
    ? "mudurluk"
    : "vatandas";

  return { session, user, roles, primaryRole, profile, loading, hasRole, hasAnyRole };
}
