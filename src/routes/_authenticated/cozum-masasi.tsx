import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, PriorityBadge, KpiCard } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HeadphonesIcon, MessageSquare, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cozum-masasi")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Çözüm Masası — Belediye AI" }] }),
});

function Page() {
  const { data } = useQuery({
    queryKey: ["cozum-masasi"],
    queryFn: async () => {
      const { data } = await supabase
        .from("complaints")
        .select(
          "id, citizen_name, complaint_text, category, priority, status, created_at, wants_human_representative, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      const stats = {
        total: data?.length ?? 0,
        open: data?.filter((d) => !["cozuldu", "reddedildi"].includes(d.status)).length ?? 0,
        human: data?.filter((d) => d.wants_human_representative).length ?? 0,
        resolved: data?.filter((d) => d.status === "cozuldu").length ?? 0,
      };
      return { rows: data ?? [], stats };
    },
  });

  return (
    <div>
      <PageHeader
        title="Çözüm Masası"
        description="Gelen tüm şikayetleri yönetin, atama yapın ve vatandaşa dönüş sağlayın."
      />
      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <KpiCard label="Toplam" value={data?.stats.total ?? "—"} icon={MessageSquare} />
        <KpiCard label="Açık" value={data?.stats.open ?? "—"} icon={Clock} accent="warn" />
        <KpiCard
          label="Temsilci Talebi"
          value={data?.stats.human ?? "—"}
          icon={HeadphonesIcon}
          accent="destructive"
        />
        <KpiCard
          label="Çözülen"
          value={data?.stats.resolved ?? "—"}
          icon={CheckCircle2}
          accent="accent"
        />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vatandaş</TableHead>
              <TableHead>Şikayet</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Müdürlük</TableHead>
              <TableHead>Öncelik</TableHead>
              <TableHead>Durum</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.rows.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    to="/sikayetler/$id"
                    params={{ id: c.id }}
                    className="font-medium hover:underline"
                  >
                    {c.citizen_name}
                  </Link>
                  {c.wants_human_representative && (
                    <div className="text-[10px] uppercase text-destructive">Temsilci istiyor</div>
                  )}
                </TableCell>
                <TableCell className="max-w-xs">
                  <p className="line-clamp-2 text-sm">{c.complaint_text}</p>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{c.category}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{c.departments?.name}</span>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={c.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
