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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, ShieldAlert, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ASSIGNABLE_ROLES: { role: AppRole; label: string }[] = [
  { role: "superuser", label: "Sistem Yöneticisi (SuperUser)" },
  { role: "baskan", label: "Belediye Başkanı" },
  { role: "baskan_yardimcisi", label: "Başkan Yardımcısı" },
  { role: "mudur", label: "Birim Müdürü" },
  { role: "personel", label: "Birim Görevlisi" },
  { role: "zabita_memuru", label: "Zabıta Memuru (eski)" },
  { role: "cozum_masasi", label: "Çözüm Masası" },
  { role: "mudurluk", label: "Müdürlük Kullanıcısı" },
  { role: "vatandas", label: "Vatandaş" },
];

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
        supabase.from("departments").select("id, name"),
      ]);

      const deptMap = new Map((departments ?? []).map((d) => [d.id, d.name]));

      return (profiles ?? []).map((u) => {
        const uRoles = (userRoles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as AppRole);
        return {
          ...u,
          roles: uRoles,
          primaryRole: uRoles[0] || "vatandas",
          departmentName: u.department_id ? deptMap.get(u.department_id) || "—" : "—",
        };
      });
    },
  });

  const handleRoleChange = async (userId: string, newRole: AppRole) => {
    setUpdatingUserId(userId);
    try {
      const res = await updateRoleFn({ data: { userId, role: newRole } });
      if (!res.success) {
        // Fallback: Try client-side update if server function key missing
        await supabase.from("user_roles").delete().eq("user_id", userId);
        const dbRole = newRole === "superuser" ? "admin" : newRole === "zabita_memuru" ? "zabita" : newRole === "mudur" ? "mudurluk" : newRole;
        const { error } = await supabase.from("user_roles").insert({
          user_id: userId,
          role: dbRole as any,
        });
        if (error) throw new Error(res.error || error.message);
      }

      toast.success("Kullanıcı rolü başarıyla güncellendi!");
      qc.invalidateQueries({ queryKey: ["admin-all-users-with-roles"] });
    } catch (e: any) {
      toast.error("Rol güncellenirken hata oluştu: " + (e.message || e));
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
              Sistemdeki tüm kayıtlı kullanıcıların rollerini (Zabıta Memuru, Müdür, Başkan vb.) tek tıkla değiştirebilirsiniz.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">
            {usersData?.length || 0} Kayıtlı Kullanıcı
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
                <th className="p-3 font-semibold">Mevcut Birim</th>
                <th className="p-3 font-semibold">Mevcut Rol</th>
                <th className="p-3 font-semibold text-right">Rol Atama & Değiştir</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usersData?.map((u) => {
                const isBusy = updatingUserId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-foreground">{u.full_name || "— (İsimsiz)"}</div>
                      <div className="text-[11px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="p-3">
                      <span className="bg-muted px-2 py-0.5 rounded text-[11px] font-medium">{u.departmentName}</span>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-[10px]">
                        {ROLE_LABELS[u.primaryRole] || u.primaryRole}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end items-center gap-2">
                        {isBusy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        <Select
                          disabled={isBusy}
                          defaultValue={u.primaryRole}
                          onValueChange={(val) => handleRoleChange(u.id, val as AppRole)}
                        >
                          <SelectTrigger className="w-[200px] h-8 text-xs">
                            <SelectValue placeholder="Rol Seçin" />
                          </SelectTrigger>
                          <SelectContent align="end">
                            {ASSIGNABLE_ROLES.map((r) => (
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
