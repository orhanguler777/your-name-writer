import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, EmptyState } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HelpCircle, Search, Phone, Clock, MessageSquare, Building2 } from "lucide-react";
import { fetchBilgiTalepleri } from "@/lib/ai.functions";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/bilgi-talepleri")({
  ssr: false,
  component: BilgiTalepleriPage,
  head: () => ({ meta: [{ title: "Bilgi Talepleri — Belediye AI" }] }),
});

function BilgiTalepleriPage() {
  const [search, setSearch] = useState("");
  const fetchLogs = useServerFn(fetchBilgiTalepleri);
  const { profile, primaryRole } = useAuth();

  const isMudurluk = primaryRole === "mudurluk";
  const departmentId = profile?.department_id;

  const { data: logs, isLoading } = useQuery({
    queryKey: ["bilgi-talepleri", search, departmentId, isMudurluk],
    queryFn: () => fetchLogs({ data: { search, departmentId, isMudurluk } }),
    refetchInterval: 5000, // 5 saniyede bir güncelle
  });

  // İstatistikler
  const totalToday =
    logs?.filter((l: any) => {
      const d = new Date(l.created_at);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length ?? 0;

  const totalAll = logs?.length ?? 0;

  return (
    <div>
      <PageHeader
        title="Bilgi Talepleri"
        description="WhatsApp üzerinden gelen bilgi sorguları ve bot yanıtları. Bunlar şikayet olarak kaydedilmez."
      />

      {/* İstatistik Kartları */}
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{totalAll}</div>
            <div className="text-xs text-muted-foreground">Toplam Bilgi Talebi</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{totalToday}</div>
            <div className="text-xs text-muted-foreground">Bugünkü Talepler</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">
              {logs?.filter((l: any) => l.related_filters?.department).length ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">Müdürlüğe Yönlendirilen</div>
          </div>
        </Card>
      </div>

      {/* Arama */}
      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Soru içeriğinde ara..."
            className="pl-9"
          />
        </div>
      </Card>

      {/* Tablo */}
      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : !logs || logs.length === 0 ? (
          <EmptyState
            title="Bilgi talebi bulunamadı"
            description="Henüz WhatsApp üzerinden bilgi sorgusu gelmemiş veya filtreniz sonuç döndürmüyor."
            icon={HelpCircle}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tarih / Saat</TableHead>
                <TableHead>Vatandaş</TableHead>
                <TableHead>Soru</TableHead>
                <TableHead>Bot Yanıtı</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Yönlendirme</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => {
                const filters = log.related_filters || {};
                const date = new Date(log.created_at);
                return (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <div>{date.toLocaleDateString("tr-TR")}</div>
                      <div className="font-semibold text-foreground/80">
                        {date.toLocaleTimeString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{filters.citizen_name || "—"}</div>
                      {filters.citizen_phone && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Phone className="h-3 w-3" />
                          {filters.citizen_phone}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="line-clamp-2 text-sm">{log.question}</p>
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      <p className="line-clamp-3 text-sm text-muted-foreground">{log.answer}</p>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {filters.category || "Bilgi"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {filters.department ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span>{filters.department}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
