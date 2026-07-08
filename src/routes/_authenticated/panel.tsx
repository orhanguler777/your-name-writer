import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KpiCard, PageHeader } from "@/components/panel-primitives";
import { MessageSquare, CheckCircle2, Clock, Users, TrendingUp, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/turkish";

export const Route = createFileRoute("/_authenticated/panel")({
  ssr: false,
  component: Panel,
  head: () => ({ meta: [{ title: "Ana Panel — Belediye AI" }] }),
});

function Panel() {
  const { profile, primaryRole } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["panel-stats"],
    queryFn: async () => {
      const [total, open, resolved, depts] = await Promise.all([
        supabase.from("complaints").select("*", { count: "exact", head: true }),
        supabase.from("complaints").select("*", { count: "exact", head: true }).not("status", "in", "(cozuldu,reddedildi)"),
        supabase.from("complaints").select("*", { count: "exact", head: true }).eq("status", "cozuldu"),
        supabase.from("departments").select("*", { count: "exact", head: true }),
      ]);
      return {
        total: total.count ?? 0,
        open: open.count ?? 0,
        resolved: resolved.count ?? 0,
        depts: depts.count ?? 0,
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-complaints"],
    queryFn: async () => {
      const { data } = await supabase
        .from("complaints")
        .select("id, complaint_text, category, priority, status, created_at, citizen_name")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        title={`Hoş geldiniz, ${profile?.full_name || "Kullanıcı"}`}
        description={`Rolünüz: ${ROLE_LABELS[primaryRole]} — Belediye AI Modülü üzerinden hızlı erişim.`}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Toplam Şikayet" value={stats?.total ?? "—"} icon={MessageSquare} accent="primary" />
        <KpiCard label="Açık Şikayet" value={stats?.open ?? "—"} icon={Clock} accent="warn" />
        <KpiCard label="Çözülen" value={stats?.resolved ?? "—"} icon={CheckCircle2} accent="accent" />
        <KpiCard label="Aktif Müdürlük" value={stats?.depts ?? "—"} icon={Building2} accent="primary" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Son Şikayetler</h2>
            <Link to="/sikayetler" className="text-sm text-accent hover:underline">Tümünü Gör →</Link>
          </div>
          <div className="divide-y">
            {recent?.map((c) => (
              <Link
                key={c.id}
                to="/sikayetler/$id"
                params={{ id: c.id }}
                className="flex items-start justify-between gap-3 py-3 hover:bg-muted/50 -mx-2 px-2 rounded"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-accent">{c.category}</span>
                    <span className="text-xs text-muted-foreground">· {c.citizen_name}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm">{c.complaint_text}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(c.created_at).toLocaleDateString("tr-TR")}
                </span>
              </Link>
            ))}
            {(!recent || recent.length === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">Kayıt yok.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Hızlı Erişim</h2>
          <div className="space-y-2">
            {[
              { to: "/sikayet-olustur", label: "Yeni Şikayet Oluştur", icon: MessageSquare },
              { to: "/whatsapp", label: "WhatsApp Belge Hattı", icon: TrendingUp },
              { to: "/baskan", label: "Başkan Paneli", icon: Users },
            ].map((q) => (
              <Link key={q.to} to={q.to} className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted">
                <q.icon className="h-4 w-4 text-accent" />
                {q.label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
