import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/panel-primitives";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, Search, Building2, AlertTriangle, CheckCircle2, Navigation } from "lucide-react";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import { RequireZabita } from "@/components/RequireZabita";

export const Route = createFileRoute("/_authenticated/zabita-harita")({
  ssr: false,
  component: () => (
    <RequireZabita>
      <ZabitaHaritaPage />
    </RequireZabita>
  ),
  head: () => ({ meta: [{ title: "Saha Haritası — Zabıta" }] }),
});

function ZabitaHaritaPage() {
  const [search, setSearch] = useState("");
  const [selectedInspection, setSelectedInspection] = useState<any | null>(null);
  const [ClientMap, setClientMap] = useState<any | null>(null);

  // Dynamically import Leaflet map component only on client side
  useEffect(() => {
    import("@/components/ZabitaHaritaClientComponent").then((mod) => {
      setClientMap(() => mod.ZabitaHaritaClientComponent);
    });
  }, []);

  // Fetch all inspections
  const { data: inspections, isLoading } = useQuery({
    queryKey: ["map-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Deduplicate: keep latest per workplace_name
      const seen = new Map<string, (typeof data)[0]>();
      for (const row of data) {
        const key = row.workplace_name.toLowerCase().trim();
        if (!seen.has(key)) seen.set(key, row);
      }

      return Array.from(seen.values());
    },
  });

  const filtered = (inspections ?? []).filter((row) => {
    const q = search.toLowerCase();
    return (
      row.workplace_name.toLowerCase().includes(q) ||
      (row.owner_name ?? "").toLowerCase().includes(q) ||
      (row.address ?? "").toLowerCase().includes(q)
    );
  });

  const totalCount = inspections?.length ?? 0;
  const cleanCount = inspections?.filter((i) => (i.penalty_points ?? 0) === 0).length ?? 0;
  const penaltyCount = inspections?.filter((i) => (i.penalty_points ?? 0) > 0).length ?? 0;
  const locateCount = inspections?.filter((i) => i.latitude && i.longitude).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zabıta Saha Haritası & Canlı Rota Takibi"
        description="Denetlenen işyerlerinin gerçek Alanya haritası üzerindeki canlı konumları, durumları (Uygun / Cezalı) ve rota takibi."
        icon={MapPin}
      />

      {/* İstatistik Özet Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{totalCount}</div>
            <div className="text-xs text-muted-foreground">Toplam Denetlenen</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{cleanCount}</div>
            <div className="text-xs text-muted-foreground">Sorunsuz (Yeşil)</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{penaltyCount}</div>
            <div className="text-xs text-muted-foreground">Eksikli / Cezalı (Kırmızı)</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold">{locateCount}</div>
            <div className="text-xs text-muted-foreground">GPS Konumu Doğrulanmış</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Kolon: İşyeri Harita Pin Listesi */}
        <Card className="lg:col-span-1 flex flex-col h-[650px]">
          <CardHeader className="pb-3 border-b space-y-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Denetim Noktaları</span>
              <Badge variant="secondary" className="text-xs">
                {filtered.length} İşyeri
              </Badge>
            </CardTitle>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Haritada ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                İşyeri bulunamadı.
              </div>
            ) : (
              filtered.map((item) => {
                const hasPenalty = (item.penalty_points ?? 0) > 0;
                const isSelected = selectedInspection?.id === item.id;
                const hasGPS = item.latitude && item.longitude;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedInspection(item)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-3 h-3 rounded-full shrink-0 ${hasPenalty ? "bg-red-500 animate-pulse" : "bg-emerald-500"}`}
                        />
                        <h4 className="font-semibold text-sm truncate">{item.workplace_name}</h4>
                      </div>
                      <Badge
                        variant={hasPenalty ? "destructive" : "default"}
                        className="text-[10px] px-1.5 py-0 shrink-0"
                      >
                        {hasPenalty ? `${item.penalty_points} Puan` : "Temiz"}
                      </Badge>
                    </div>

                    <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5 pl-5">
                      {item.owner_name && <div>Sahibi: {item.owner_name}</div>}
                      {item.address && <div className="truncate">{item.address}</div>}
                    </div>

                    <div className="mt-2 pl-5 flex items-center justify-between text-[11px] text-muted-foreground border-t pt-1.5">
                      <span>{new Date(item.created_at).toLocaleDateString("tr-TR")}</span>
                      {hasGPS ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Doğrulanmış GPS
                        </span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400">Haritada Göster</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Sağ Kolon: Client-side Lazy Rendered Harita */}
        {ClientMap ? (
          <ClientMap
            filtered={filtered}
            selectedInspection={selectedInspection}
            setSelectedInspection={setSelectedInspection}
          />
        ) : (
          <Card className="lg:col-span-2 flex items-center justify-center h-[650px] bg-muted/20">
            <div className="text-center text-xs text-muted-foreground space-y-2">
              <MapPin className="w-8 h-8 mx-auto text-primary animate-bounce" />
              <p>Alanya Canlı Haritası Yükleniyor...</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
