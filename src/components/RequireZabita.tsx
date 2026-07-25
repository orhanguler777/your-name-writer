import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isMenuItemAllowedForRole, MENU_ITEMS_CONFIG } from "@/lib/menuPermissions";

/**
 * Zabıta ve Saha modüllerini sarmalayan dinamik yetki kontrolü.
 * SuperUser matrisinde izin verilmişse (işaretlenmişse) her rol (Başkan dâhil) sayfaya erişebilir.
 */
export function RequireZabita({ children }: { children: React.ReactNode }) {
  const { primaryRole, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Bulunan rota için menuId eşleştirmesi
  const menuItem = MENU_ITEMS_CONFIG.find((m) => m.to === pathname);
  const isAllowed = menuItem ? isMenuItemAllowedForRole(primaryRole, menuItem.id) : true;

  useEffect(() => {
    if (!loading && !isAllowed) {
      navigate({ to: "/panel", replace: true });
    }
  }, [loading, isAllowed, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAllowed) return null;

  return <>{children}</>;
}
