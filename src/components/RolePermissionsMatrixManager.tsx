import { useState, useEffect } from "react";
import { saveRoleMenuMatrix, resetRoleMenuMatrix, MENU_ITEMS_CONFIG } from "@/lib/menuPermissions";
import { useMenuPermissions } from "@/hooks/useMenuPermissions";
import type { AppRole, RoleMenuMatrix } from "@/lib/menuPermissions";
import { ROLE_LABELS } from "@/lib/turkish";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, RotateCcw, Save, Info } from "lucide-react";
import { toast } from "sonner";

const DISPLAY_ROLES: { role: AppRole; label: string; desc: string }[] = [
  { role: "superuser", label: "SuperUser", desc: "Sistem Kurucusu / Developer (Tam Yetki)" },
  { role: "baskan", label: "Belediye Başkanı", desc: "1. Seviye — Tüm şehir" },
  { role: "baskan_yardimcisi", label: "Başkan Yardımcısı", desc: "2. Seviye — Bağlı müdürlükler" },
  { role: "mudur", label: "Birim Müdürü", desc: "3. Seviye — Kendi müdürlüğü" },
  { role: "personel", label: "Birim Görevlisi", desc: "4. Seviye — Her birim için genel" },
  { role: "zabita_memuru", label: "Zabıta Memuru (eski)", desc: "Eski rol adı — geriye dönük uyum" },
  { role: "cozum_masasi", label: "Çözüm Masası", desc: "Vatandaş şikayet & talep yönetimi" },
  { role: "mudurluk", label: "Müdürlük (eski)", desc: "Eski rol adı — geriye dönük uyum" },
  { role: "zabita", label: "Zabıta (eski)", desc: "Eski rol adı — geriye dönük uyum" },
  { role: "admin", label: "Admin (eski)", desc: "Eski teknik üst rol" },
];

export function RolePermissionsMatrixManager() {
  const { matrix: dbMatrix, isLoading } = useMenuPermissions();
  const [matrix, setMatrix] = useState<RoleMenuMatrix>(dbMatrix);
  const [saving, setSaving] = useState(false);

  // Veritabanından gelen matris yüklendiğinde/değiştiğinde ekranı eşitle
  useEffect(() => {
    setMatrix(dbMatrix);
  }, [dbMatrix]);

  const handleToggle = (role: AppRole, menuId: string, checked: boolean) => {
    if (role === "superuser") {
      toast.info("SuperUser yetkisi kısıtlanamaz, tüm menülere tam erişimi vardır.");
      return;
    }
    const updated = {
      ...matrix,
      [role]: {
        ...(matrix[role] || {}),
        [menuId]: checked,
      },
    };
    setMatrix(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveRoleMenuMatrix(matrix);
      toast.success("Yetki matrisi kaydedildi — tüm kullanıcılar ve cihazlar için geçerli.");
    } catch (e: any) {
      toast.error("Kaydedilemedi: " + (e?.message || "yetkiniz olmayabilir"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      const defaults = await resetRoleMenuMatrix();
      setMatrix(defaults);
      toast.info("Yetki matrisi varsayılan ayarlara sıfırlandı.");
    } catch (e: any) {
      toast.error("Sıfırlanamadı: " + (e?.message || "yetkiniz olmayabilir"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="shadow-md border-primary/20">
      <CardHeader className="bg-muted/30 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Dinamik Rol & Menü Yetki Matrisi (SuperUser)
            </CardTitle>
            <CardDescription className="text-xs">
              Sistemdeki her bir rolün (Belediye Başkanı dahil) hangi menüleri göreceğini kutucukları (checkbox) işaretleyerek tek tek yönetebilirsiniz.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving || isLoading} className="h-8 gap-1 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Varsayılana Dön
            </Button>
            <Button variant="default" size="sm" onClick={handleSave} disabled={saving || isLoading} className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700">
              <Save className="h-3.5 w-3.5" /> {saving ? "Kaydediliyor..." : "Matrisi Kaydet"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b bg-muted/60 text-muted-foreground">
              <th className="p-3 font-semibold min-w-[180px]">Menü Adı</th>
              {DISPLAY_ROLES.map((r) => (
                <th key={r.role} className="p-3 text-center min-w-[120px] font-semibold border-l">
                  <div className="font-bold text-foreground">{r.label}</div>
                  <div className="text-[10px] text-muted-foreground font-normal line-clamp-1">{r.desc}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {MENU_ITEMS_CONFIG.map((menu) => (
              <tr key={menu.id} className="hover:bg-muted/20 transition-colors">
                <td className="p-3 font-medium flex items-center gap-2">
                  <span>{menu.label}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                    {menu.to}
                  </span>
                </td>
                {DISPLAY_ROLES.map((r) => {
                  const isChecked = r.role === "superuser" ? true : !!matrix[r.role]?.[menu.id];
                  const isDisabled = r.role === "superuser";
                  return (
                    <td key={r.role} className="p-3 text-center border-l bg-card">
                      <div className="flex justify-center items-center">
                        <Checkbox
                          checked={isChecked}
                          disabled={isDisabled}
                          onCheckedChange={(checked) => handleToggle(r.role, menu.id, !!checked)}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-3 bg-muted/20 border-t flex items-center gap-2 text-[11px] text-muted-foreground">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>
            Değişiklikler <strong>“Matrisi Kaydet”</strong> ile veritabanına yazılır ve tüm kullanıcıların
            cihazlarında geçerli olur. Kapatılan bir menü, adres çubuğundan da açılamaz.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
