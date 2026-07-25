import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMenuPermissions } from "@/hooks/useMenuPermissions";
import { MENU_ITEMS_CONFIG } from "@/lib/menuPermissions";

/**
 * Sayfa düzeyinde yetki kontrolü. Yetki matrisi (veritabanı) o rol için sayfayı
 * kapatmışsa içerik gösterilmez ve kullanıcı Ana Panel'e yönlendirilir.
 */
export function RequireZabita({ children }: { children: React.ReactNode }) {
  const { primaryRole, loading, hasModule } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAllowed, isLoading: permsLoading } = useMenuPermissions();

  const menuItem = MENU_ITEMS_CONFIG.find((m) => m.to === pathname);
  // Erişim = rol kademesi (matris) VE birime tanımlı modül
  const allowed = menuItem
    ? isAllowed(primaryRole, menuItem.id) && (!menuItem.module || hasModule(menuItem.module))
    : true;
  const busy = loading || permsLoading;

  useEffect(() => {
    if (!busy && !allowed) {
      navigate({ to: "/panel", replace: true });
    }
  }, [busy, allowed, navigate]);

  if (busy) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
