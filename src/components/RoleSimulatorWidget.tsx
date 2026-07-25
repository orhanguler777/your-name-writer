import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/lib/menuPermissions";
import { ROLE_LABELS } from "@/lib/turkish";
import { Shield, Check, RotateCcw, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SIMULATE_OPTIONS: { role: AppRole; label: string; badge: string; desc: string }[] = [
  { role: "superuser", label: "Sistem Yöneticisi (SuperUser)", badge: "SUPER", desc: "Tüm yetkiler & İzin Matrisi Yönetimi" },
  { role: "baskan", label: "Belediye Başkanı", badge: "BAŞKAN", desc: "Makro Genel İstatistikler & Şehir Takibi" },
  { role: "baskan_yardimcisi", label: "Başkan Yardımcısı", badge: "BŞK.YRD", desc: "Çoklu Müdürlük Analitik & Raporlar" },
  { role: "mudur", label: "Zabıta Müdürü", badge: "MÜDÜR", desc: "Birim İçi İstatistikler & Personel Takibi" },
  { role: "zabita_memuru", label: "Zabıta Memuru (Saha)", badge: "SAHA", desc: "Harita + Denetim + Tutanak (Grafiksiz)" },
];

export function RoleSimulatorWidget() {
  const { primaryRole, simulatedRole, setSimulatedRole } = useAuth();
  const [open, setOpen] = useState(false);

  const activeOption = SIMULATE_OPTIONS.find((o) => o.role === primaryRole) || {
    role: primaryRole,
    label: ROLE_LABELS[primaryRole] || primaryRole,
    badge: "ROL",
    desc: "Mevcut Giriş Rolü",
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={simulatedRole ? "default" : "outline"}
          size="sm"
          className={`h-8 gap-1.5 text-xs font-semibold shadow-sm transition-all ${
            simulatedRole
              ? "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
              : "border-primary/30 hover:bg-accent"
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Rol Test:</span>
          <span className="rounded bg-background/20 px-1.5 py-0.5 font-bold uppercase tracking-wider text-[10px]">
            {activeOption.badge}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between text-xs">
          <span>Hiyerarşi & Rol Simülatörü</span>
          {simulatedRole && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSimulatedRole(null)}
              className="h-6 px-1.5 text-[11px] text-destructive hover:text-destructive"
              title="Gerçek Role Dön"
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Sıfırla
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="p-1 space-y-1">
          {SIMULATE_OPTIONS.map((opt) => {
            const isSelected = primaryRole === opt.role;
            return (
              <DropdownMenuItem
                key={opt.role}
                onClick={() => setSimulatedRole(opt.role)}
                className={`flex flex-col items-start gap-0.5 p-2 rounded cursor-pointer ${
                  isSelected ? "bg-accent text-accent-foreground font-medium" : ""
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <span>{opt.label}</span>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
              </DropdownMenuItem>
            );
          })}
        </div>
        <DropdownMenuSeparator />
        <div className="p-2 text-[10px] text-muted-foreground bg-muted/50 rounded-b flex items-start gap-1">
          <Lock className="h-3 w-3 shrink-0 mt-0.5" />
          <span>SuperUser modunda Ayarlar sayfasından hangi rolün hangi menüyü göreceğini kutucuklarla tek tek belirleyebilirsiniz.</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
