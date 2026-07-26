import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { updateUserRoleServer } from "@/lib/adminUserRole.functions";
import type { AppRole } from "@/lib/menuPermissions";
import { ROLE_LABELS } from "@/lib/turkish";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, ShieldAlert, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Birimi OLAN kullanıcılar için birim içi kademeler */
const UNIT_ROLES: { role: AppRole; label: string }[] = [
  { role: "mudur", label: "Birim Müdürü" },
  { role: "sef", label: "Şef" },
  { role: "personel", label: "Müdürlük Görevlisi" },
];

/** Yalnızca ilgili modüle sahip birimlerde çıkan özel roller */
const MODULE_ROLES: { role: AppRole; label: string; module: string }[] = [
  { role: "zabita_memuru", label: "Zabıta Memuru (Saha)", module: "zabita" },
];

/** Birimi OLMAYAN kullanıcılar için kurum geneli roller */
const TOP_ROLES: { role: AppRole; label: string }[] = [
  { role: "superuser", label: "Sistem Yöneticisi (SuperUser)" },
  { role: "baskan", label: "Belediye Başkanı" },
  { role: "baskan_yardimcisi", label: "Başkan Yardımcısı" },
  { role: "cozum_masasi", label: "Çözüm Masası" },
];

/**
 * Kullanıcıya atanabilecek rolleri bağlama göre belirler:
 * birimi varsa birim içi kademeler (+ birimin modülüne özel roller),
 * birimi yoksa kurum geneli roller. Mevcut rol listede yoksa eklenir ki
 * açılır menü boş görünmesin.
 */
export function assignableRolesFor(
  departmentModules: string[] | null | undefined,
  hasDepartment: boolean,
  currentRole: AppRole,
): { role: AppRole; label: string }[] {
  const list = hasDepartment
    ? [
        ...UNIT_ROLES,
        ...MODULE_ROLES.filter((m) => (departmentModules ?? []).includes(m.module)).map(
          ({ role, label }) => ({ role, label }),
        ),
      ]
    : [...TOP_ROLES];

  list.push({ role: "vatandas", label: "Vatandaş (yetkisiz)" });

  if (!list.some((r) => r.role === currentRole)) {
    list.unshift({
      role: currentRole,
      label: `${ROLE_LABELS[currentRole] || currentRole} (mevcut)`,
    });
  }
  return list;
}

/** Kullanıcının rollerinden kademesini belirler (en üstten aşağıya). */
function resolvePrimaryRole(roles: AppRole[]): AppRole {
  if (roles.includes("superuser") || roles.includes("admin")) return "superuser";
  if (roles.includes("baskan")) return "baskan";
  if (roles.includes("baskan_yardimcisi")) return "baskan_yardimcisi";
  if (roles.includes("cozum_masasi")) return "cozum_masasi";
  if (roles.includes("mudur")) return "mudur";
  if (roles.includes("mudurluk")) return "mudurluk";
  if (roles.includes("personel")) return "personel";
  if (roles.includes("zabita_memuru") || roles.includes("zabita")) return "zabita_memuru";
  return "vatandas";
}

export function UserRoleAssignerManager() {
  const qc = useQueryClient();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const updateRoleFn = useServerFn(updateUserRoleServer);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["admin-all-users-with-roles"],
    queryFn: async () => {
      const [{ data: profiles }, { data: userRoles }, { data: departments }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, phone, department_id, created_at"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("departments").select("id, name, modules"),
      ]);

      const deptMap = new Map((departments ?? []).map((d) => [d.id, d.name]));
      const moduleMap = new Map((departments ?? []).map((d: any) => [d.id, d.modules ?? []]));

      const users = (profiles ?? []).map((u) => {
        const uRoles = (userRoles ?? [])
          .filter((r) => r.user_id === u.id)
          .map((r) => r.role as AppRole);
        return {
          ...u,
          roles: uRoles,
          // Hiyerarşiye göre belirlenir; dizideki ilk eleman yanıltıcı olabiliyordu
          primaryRole: resolvePrimaryRole(uRoles),
          departmentName: u.department_id ? deptMap.get(u.department_id) || "—" : "—",
          departmentModules: (u.department_id ? moduleMap.get(u.department_id) : []) as string[],
        };
      });

      return { users, departments: departments ?? [] };
    },
  });

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setUpdatingUserId(userId);
    try {
      const res = await updateRoleFn({ data: { userId, role: newRole } });
      if (!res.success) {
        // Yedek yol: sunucu anahtarı yoksa istemciden dene.
        // Rol adı olduğu gibi yazılır — eskiden burada mudur→mudurluk gibi
        // sessiz düşürme yapılıyordu ve seçilen yetki kaydedilmiyordu.
        await supabase.from("user_roles").delete().eq("user_id", userId);
        const { error } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: newRole as any,
        });
        if (error) throw new Error(res.error || error.message);
      }

      toast.success("Kullanıcı rolü güncellendi.");
      qc.invalidateQueries({ queryKey: ["admin-all-users-with-roles"] });
    } catch (e: any) {
      toast.error("Rol güncellenirken hata oluştu: " + (e.message || e));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDepartmentChange = async (
    userId: string,
    currentRole: AppRole,
    departmentId: string,
  ) => {
    setUpdatingUserId(userId);
    try {
      const res = await updateRoleFn({
        data: {
          userId,
          role: currentRole,
          departmentId: departmentId === "none" ? null : departmentId,
        },
      });
      if (!res.success) throw new Error(res.error || "Birim güncellenemedi");
      toast.success("Kullanıcının birimi güncellendi.");
      qc.invalidateQueries({ queryKey: ["admin-all-users-with-roles"] });
    } catch (e: any) {
      toast.error("Birim güncellenirken hata oluştu: " + (e.message || e));
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <Card className="shadow-md border-primary/20">
      <CardHeader className="bg-muted/30 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Kullanıcı Rol & Birim Atama Yönetimi (SuperUser)
            </CardTitle>
            <CardDescription className="text-xs">
              Sistemdeki tüm kayıtlı kullanıcıların rollerini (Zabıta Memuru, Müdür, Başkan vb.) tek
              tıkla değiştirebilirsiniz.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {usersData?.users.length || 0} Kayıtlı Kullanıcı
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {isLoading ? (
          <div className="p-8 flex justify-center items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Kullanıcılar yükleniyor...
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/60 text-muted-foreground">
                <th className="p-3 font-semibold">Ad Soyad / E-posta</th>
                <th className="p-3 font-semibold">Mevcut Rol</th>
                <th className="p-3 font-semibold">Birim (Müdürlük)</th>
                <th className="p-3 font-semibold text-right">Rol Atama & Değiştir</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usersData?.users.map((u) => {
                const isBusy = updatingUserId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-foreground">
                        {u.full_name || "— (İsimsiz)"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-[10px]">
                        {ROLE_LABELS[u.primaryRole] || u.primaryRole}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Select
                        disabled={isBusy}
                        value={u.department_id ?? "none"}
                        onValueChange={(val) => handleDepartmentChange(u.id, u.primaryRole, val)}
                      >
                        <SelectTrigger className="w-[210px] h-8 text-xs">
                          <SelectValue placeholder="Birim seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">
                            — Birim yok —
                          </SelectItem>
                          {usersData.departments.map((d: any) => (
                            <SelectItem key={d.id} value={d.id} className="text-xs">
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end items-center gap-2">
                        {isBusy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        <Select
                          disabled={isBusy}
                          value={u.primaryRole}
                          onValueChange={(val) => handleRoleChange(u.id, val as AppRole)}
                        >
                          <SelectTrigger className="w-[200px] h-8 text-xs">
                            <SelectValue placeholder="Rol Seçin" />
                          </SelectTrigger>
                          <SelectContent align="end">
                            {assignableRolesFor(
                              u.departmentModules,
                              !!u.department_id,
                              u.primaryRole,
                            ).map((r) => (
                              <SelectItem key={r.role} value={r.role} className="text-xs">
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
