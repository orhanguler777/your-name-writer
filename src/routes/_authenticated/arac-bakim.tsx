import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, KpiCard } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Truck, Wrench, XCircle, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/arac-bakim")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Araç Bakım — Belediye AI" }] }),
});

const STATUS_LABELS: Record<string, string> = {
  sahada: "Sahada",
  aktif: "Aktif",
  bakimda: "Bakımda",
  servis_disi: "Servis Dışı",
};
const STATUS_STYLE: Record<string, string> = {
  sahada: "bg-status-cozuldu/15 text-status-cozuldu",
  aktif: "bg-status-yeni/15 text-status-yeni",
  bakimda: "bg-priority-medium/15 text-priority-medium",
  servis_disi: "bg-destructive/15 text-destructive",
};

function daysBetween(a: string) {
  return Math.floor((Date.now() - new Date(a).getTime()) / 864e5);
}

function Page() {
  const { data } = useQuery({
    queryKey: ["vehicles-all"],
    queryFn: async () =>
      (await supabase.from("vehicles").select("*, departments(name)").order("plate_number")).data ??
      [],
  });

  const total = data?.length ?? 0;
  const sahada = data?.filter((v) => v.status === "sahada").length ?? 0;
  const bakimda = data?.filter((v) => v.status === "bakimda").length ?? 0;
  const disi = data?.filter((v) => v.status === "servis_disi").length ?? 0;
  const uzun =
    data?.filter(
      (v) =>
        v.status === "bakimda" &&
        v.maintenance_start_date &&
        daysBetween(v.maintenance_start_date) > 7,
    ).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Araç Bakım ve Saha Durumu"
        description="Belediye araçlarının anlık durumu ve bakım süreleri."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-4">
        <KpiCard label="Toplam Araç" value={total} icon={Truck} />
        <KpiCard label="Sahada" value={sahada} icon={Truck} accent="accent" />
        <KpiCard label="Bakımda" value={bakimda} icon={Wrench} accent="warn" />
        <KpiCard label="Servis Dışı" value={disi} icon={XCircle} accent="destructive" />
        <KpiCard label="7 Günü Aşan Bakım" value={uzun} icon={AlertTriangle} accent="destructive" />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plaka</TableHead>
              <TableHead>Tip</TableHead>
              <TableHead>Müdürlük</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Bakım Başlangıç</TableHead>
              <TableHead>Süre</TableHead>
              <TableHead>Sebep / Not</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((v: any) => {
              const days = v.maintenance_start_date ? daysBetween(v.maintenance_start_date) : null;
              const alert =
                days !== null && v.status === "bakimda"
                  ? days > 15
                    ? "kritik"
                    : days > 7
                      ? "uyari"
                      : null
                  : null;
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.plate_number}</TableCell>
                  <TableCell>{v.vehicle_type}</TableCell>
                  <TableCell>{v.departments?.name}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[v.status]}>{STATUS_LABELS[v.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{v.maintenance_start_date ?? "—"}</TableCell>
                  <TableCell>
                    {days !== null && v.status !== "aktif" && v.status !== "sahada" && (
                      <Badge
                        variant={alert === "kritik" ? "destructive" : "secondary"}
                        className={
                          alert === "uyari" ? "bg-priority-medium/15 text-priority-medium" : ""
                        }
                      >
                        {days} gün
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-xs">
                    {v.maintenance_reason || v.notes || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
