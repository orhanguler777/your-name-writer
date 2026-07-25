import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchRoleMenuMatrix,
  getCachedRoleMenuMatrix,
  clearLegacyLocalMatrix,
  MENU_ITEMS_CONFIG,
  type AppRole,
  type RoleMenuMatrix,
} from "@/lib/menuPermissions";

export const MENU_PERMISSIONS_QUERY_KEY = ["role-menu-permissions"];

/**
 * Rol & menü yetki matrisini veritabanından yükler ve uygulama genelinde önbellekler.
 * Matris değiştiğinde ("role_permissions_updated") otomatik yenilenir.
 */
export function useMenuPermissions() {
  const queryClient = useQueryClient();

  const { data: matrix, isLoading } = useQuery<RoleMenuMatrix>({
    queryKey: MENU_PERMISSIONS_QUERY_KEY,
    queryFn: fetchRoleMenuMatrix,
    staleTime: 60_000,
  });

  // Eski tarayıcı kaydını temizle (bir kereye mahsus geçiş)
  useEffect(() => {
    clearLegacyLocalMatrix();
  }, []);

  // Matris kaydedildiğinde tüm ekranlar tazelenir
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: MENU_PERMISSIONS_QUERY_KEY });
    window.addEventListener("role_permissions_updated", handler);
    return () => window.removeEventListener("role_permissions_updated", handler);
  }, [queryClient]);

  const effective = matrix ?? getCachedRoleMenuMatrix();

  const isAllowed = (role: AppRole, menuId: string): boolean => {
    if (role === "superuser") return true;
    if (effective[role] && typeof effective[role][menuId] === "boolean") {
      return effective[role][menuId];
    }
    const item = MENU_ITEMS_CONFIG.find((m) => m.id === menuId);
    return item ? item.defaultRoles.includes(role) : false;
  };

  return { matrix: effective, isLoading, isAllowed };
}
