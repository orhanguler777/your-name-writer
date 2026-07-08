import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatusBadge, PriorityBadge, KpiCard, EmptyState } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2, Clock, CheckCircle2, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mudurluk")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Müdürlük Paneli — Belediye AI" }] }),
});

function Page() {
  const { profile, primaryRole } = useAuth();
  const deptId = profile?.department_id;
  const isMudurluk = primaryRole === "mudurluk";

  const { data: dept } = useQuery({
    queryKey: ["dept", deptId],
    enabled: !!deptId,
    queryFn: async () => (await supabase.from("departments").select("*").eq("id", deptId!).maybeSingle()).data,
  });

  const { data: rows } = useQuery({
    queryKey: ["mudurluk-complaints", deptId, primaryRole],
    queryFn: async () => {
      let q = supabase
        .from("complaints")
        .select("id, citizen_name, complaint_text, category, priority, status, created_at, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (isMudurluk && deptId) q = q.eq("assigned_department_id", deptId);
      return (await q).data ?? [];
    },
  });

  const stats = {
    total: rows?.length ?? 0,
    open: rows?.filter((r) => !["cozuldu", "reddedildi"].includes(r.status)).length ?? 0,
    resolved: rows?.filter((r) => r.status === "cozuldu").length ?? 0,
  };

  return (
    <div>
      <PageHeader
        title="Müdürlük Paneli"
        description={dept ? `${dept.name} — atanan şikayetleriniz` : isMudurluk ? "Henüz bir müdürlüğe atanmamışsınız." : "Tüm müdürlüklere gelen şikayetler."}
      />
      {isMudurluk && !deptId ? (
        <EmptyState title="Müdürlük Ataması Yok" description="Yönetici size bir müdürlük atadıktan sonra bu panelden şikayetleri görebilirsiniz." icon={Building2} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <KpiCard label="Atanan Toplam" value={stats.total} icon={MessageSquare} />
            <KpiCard label="Açık" value={stats.open} icon={Clock} accent="warn" />
            <KpiCard label="Çözülen" value={stats.resolved} icon={CheckCircle2} accent="accent" />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vatandaş</TableHead><TableHead>Şikayet</TableHead>
                  <TableHead>Kategori</TableHead><TableHead>Öncelik</TableHead><TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows?.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell><Link to="/sikayetler/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.citizen_name}</Link>
                      <div className="text-xs text-muted-foreground">{c.neighborhoods?.name}</div>
                    </TableCell>
                    <TableCell className="max-w-xs"><p className="line-clamp-2 text-sm">{c.complaint_text}</p></TableCell>
                    <TableCell>{c.category}</TableCell>
                    <TableCell><PriorityBadge priority={c.priority} /></TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
