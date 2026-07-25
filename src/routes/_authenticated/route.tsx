import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/turkish";
import { isMenuItemAllowedForRole, MENU_ITEMS_CONFIG } from "@/lib/menuPermissions";
import {
  LayoutDashboard, MessageSquare, HeadphonesIcon, Building2, Crown, Bot,
  MessageCircle, Send, Truck, UserCheck, Settings, LogOut, Menu, X, Loader2,
  HelpCircle, Smile, Megaphone, PieChart, Users, ClipboardCheck, MapPin, Archive, Shield,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MayorBotWidget } from "@/components/MayorBotWidget";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  MessageSquare,
  HelpCircle,
  HeadphonesIcon,
  ClipboardCheck,
  Building2,
  MapPin,
  Archive,
  Smile,
  Bot,
  Send,
  Truck,
  UserCheck,
  Megaphone,
  PieChart,
  Users,
  Settings,
};

function AuthedLayout() {
  const { profile, loading, primaryRole, realPrimaryRole } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [permVersion, setPermVersion] = useState(0);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const handleUpdate = () => setPermVersion((v) => v + 1);
    window.addEventListener("role_permissions_updated", handleUpdate);
    return () => window.removeEventListener("role_permissions_updated", handleUpdate);
  }, []);

  const visibleMenu = MENU_ITEMS_CONFIG.filter((item) => {
    return isMenuItemAllowedForRole(primaryRole, item.id);
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-sidebar text-sidebar-foreground transition-transform md:relative md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">B</div>
          <div className="flex flex-col leading-tight">
            <span className="font-display text-sm font-bold">Belediye AI</span>
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Modülü V1</span>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto p-3">
          {visibleMenu.map((item) => {
            const active = pathname === item.to || (item.to !== "/panel" && pathname.startsWith(item.to));
            const Icon = ICON_MAP[item.iconName] || LayoutDashboard;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-card px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen((v) => !v)}>
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="flex flex-col leading-tight">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Belediye AI Modülü</span>
              <span className="font-display font-semibold">Yapay Zeka Destekli Yönetim Paneli</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{profile?.full_name || profile?.email || "Kullanıcı"}</div>
              <div className="text-[11px] text-muted-foreground font-medium">
                {ROLE_LABELS[primaryRole] || primaryRole}
              </div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              {(profile?.full_name || profile?.email || "U").charAt(0).toUpperCase()}
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Çıkış Yap">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden p-4 md:p-6 relative">
          <Outlet />
        </main>
      </div>
      
      {/* Global Floating Bot driven by Dynamic SuperUser RBAC Matrix */}
      {isMenuItemAllowedForRole(primaryRole, "baskan-ai-bot") && <MayorBotWidget />}
    </div>
  );
}
