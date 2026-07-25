import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Zabıta modüllerini (İşyeri Denetimi, İşyeri Listesi, Saha Haritası) sarmalayan koruma.
 * Yalnızca zabıta kullanıcıları (zabita rolü veya "Zabıta Müdürlüğü" departmanı) erişebilir;
 * diğer roller (admin dahil) doğrudan URL ile girse bile Ana Panel'e yönlendirilir.
 */
export function RequireZabita({ children }: { children: React.ReactNode }) {
  const { isZabita, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isZabita) {
      navigate({ to: "/panel", replace: true });
    }
  }, [loading, isZabita, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isZabita) return null;

  return <>{children}</>;
}
