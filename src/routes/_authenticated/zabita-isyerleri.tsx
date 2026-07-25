import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Search, Phone, ChevronDown, ChevronUp, CheckCircle2, XCircle, Camera, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import { openInspectionReport, downloadFromUrl, tutanakBelgeNo } from "@/lib/tutanak";
import { loadSignatures } from "@/lib/signatures";
import { RequireZabita } from "@/components/RequireZabita";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/zabita-isyerleri")({
  ssr: false,
  component: () => (
    <RequireZabita>
      <ZabitaIsyerleriPage />
    </RequireZabita>
  ),
  head: () => ({ meta: [{ title: "İşyeri Listesi — Zabıta" }] }),
});

function InspectionExpandRow({ row, allWorkplaceInspections }: { row: any; allWorkplaceInspections: any[] }) {
  const workplaceHistory = (allWorkplaceInspections || []).filter(
    (ins) => ins.workplace_name?.toLowerCase().trim() === row.workplace_name?.toLowerCase().trim()
  );

  const [selectedId, setSelectedId] = useState<string>(row.id);
  const activeRow = workplaceHistory.find((ins) => ins.id === selectedId) || row;

  const checklist = ZABITA_CHECKLISTS.find((c) => c.id === activeRow.inspection_type);
  const checklistData: Record<string, boolean> = activeRow.checklist || {};
  const images: string[] = activeRow.images || [];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <TableRow>
      <TableCell colSpan={9} className="p-0 bg-muted/30">
        <div className="p-4 space-y-4">
          {/* Çoklu Tarih Seçim Barı */}
          {workplaceHistory.length > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-card border rounded-lg shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <Label className="text-xs font-semibold text-foreground">İşyeri Denetim Geçmişi ({workplaceHistory.length} Kayıt)</Label>
                  <p className="text-[11px] text-muted-foreground">İncelemek istediğiniz tarihi açılır menüden seçebilirsiniz:</p>
                </div>
              </div>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="w-full sm:w-72 h-8 text-xs font-medium bg-background">
                  <SelectValue placeholder="Tarih seçiniz..." />
                </SelectTrigger>
                <SelectContent>
                  {workplaceHistory.map((ins) => {
                    const title = ZABITA_CHECKLISTS.find((c) => c.id === ins.inspection_type)?.title || ins.inspection_type;
                    const pts = ins.penalty_points ?? 0;
                    return (
                      <SelectItem key={ins.id} value={ins.id} className="text-xs">
                        {formatDate(ins.created_at)} — {pts > 0 ? `${pts} Puan (${ins.recommended_action})` : "Temiz"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Checklist Özeti */}
          {checklist && (
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h4 className="text-sm font-semibold">Denetim Maddeleri ({formatDate(activeRow.created_at)})</h4>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={async () => {
                      try {
                        const sig = await loadSignatures(activeRow.id);
                        openInspectionReport({
                          id: activeRow.id,
                          workplace_name: activeRow.workplace_name,
                          owner_name: activeRow.owner_name,
                          address: activeRow.address,
                          tax_office: activeRow.tax_office,
                          tax_number: activeRow.tax_number,
                          phone: activeRow.phone,
                          inspection_type: activeRow.inspection_type,
                          checklist: (activeRow.checklist || {}) as Record<string, boolean>,
                          notes: activeRow.notes,
                          images: activeRow.images,
                          latitude: activeRow.latitude,
                          longitude: activeRow.longitude,
                          penalty_points: activeRow.penalty_points,
                          recommended_action: activeRow.recommended_action,
                          created_at: activeRow.created_at,
                          inspectorSignatureUrl: sig.inspectorUrl,
                          merchantSignatureUrl: sig.merchantUrl,
                          merchantSignedName: sig.merchantName,
                          declined: sig.declined,
                          signedAt: sig.signedAt,
                        });
                      } catch (e: any) {
                        toast.error(e?.message || "Tutanak oluşturulamadı.");
                      }
                    }}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Tutanak (PDF)
                  </Button>
                  {activeRow.tutanak_url && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() =>
                        downloadFromUrl(
                          activeRow.tutanak_url,
                          `Tutanak-${tutanakBelgeNo({ id: activeRow.id } as any)}.pdf`
                        )
                      }
                    >
                      <Download className="w-3.5 h-3.5" />
                      İmzalı Belgeyi İndir
                    </Button>
                  )}
                  <Badge variant={activeRow.penalty_points > 0 ? "destructive" : "default"} className="text-xs">
                    {activeRow.penalty_points > 0 ? `${activeRow.penalty_points} Puan - ${activeRow.recommended_action}` : "Temiz / Uygun"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {checklist.items.map((item, i) => {
                  const checked = checklistData[item.id] === true;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                        !checked ? "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400" : "text-muted-foreground"
                      }`}
                    >
                      {checked
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      }
                      <span className={!checked ? "font-medium" : ""}>{i + 1}. {item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notlar */}
          {activeRow.notes && (
            <div className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
              <strong>Not:</strong> {activeRow.notes}
            </div>
          )}

          {/* Fotoğraflar */}
          {images.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-muted-foreground" />
                Denetim Fotoğrafları ({images.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {images.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-24 h-24 rounded-lg border overflow-hidden hover:opacity-80 hover:shadow-md transition-all"
                  >
                    <img src={url} alt={`Fotoğraf ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {images.length === 0 && !activeRow.notes && !checklist && (
            <p className="text-xs text-muted-foreground">Bu denetim için ek bilgi bulunmuyor.</p>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ZabitaIsyerleriPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Get all inspections and deduplicated unique workplaces
  const { data: inspectionData, isLoading } = useQuery({
    queryKey: ["all-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const all = data ?? [];
      const seen = new Map<string, any>();
      for (const row of all) {
        if (row?.workplace_name) {
          const key = row.workplace_name.toLowerCase().trim();
          if (!seen.has(key)) seen.set(key, row);
        }
      }

      return {
        all,
        deduplicated: Array.from(seen.values()),
      };
    },
  });

  const inspections = inspectionData?.deduplicated ?? [];
  const allInspections = inspectionData?.all ?? [];

  const filtered = (inspections ?? []).filter((row) => {
    const q = search.toLowerCase();
    return (
      row.workplace_name.toLowerCase().includes(q) ||
      (row.owner_name ?? "").toLowerCase().includes(q) ||
      (row.address ?? "").toLowerCase().includes(q) ||
      (row.tax_number ?? "").includes(q)
    );
  });

  const getChecklistLabel = (id: string) =>
    ZABITA_CHECKLISTS.find((c) => c.id === id)?.title ?? id;

  const getCheckedCount = (checklist: any) => {
    const data: Record<string, boolean> = checklist ?? {};
    return Object.values(data).filter(Boolean).length;
  };

  const getTotalCount = (inspection_type: string) =>
    ZABITA_CHECKLISTS.find((c) => c.id === inspection_type)?.items.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="İşyeri Listesi"
        description="Daha önce denetim yapılan tüm işyerlerinin listesi ve kayıt bilgileri. Satıra tıklayarak detayları ve fotoğrafları görüntüleyebilirsiniz."
        icon={Building2}
      />

      <div className="flex items-center gap-3 max-w-lg">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="İşyeri adı, sahibi, adres veya vergi no ile arayın..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
      </div>

      <Card>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">
            <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Henüz kayıtlı işyeri bulunamadı.</p>
            <p className="text-sm mt-1">Denetim formu dolduruldukça buraya eklenecek.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold w-8"></TableHead>
                  <TableHead className="font-semibold">İşyeri Adı</TableHead>
                  <TableHead className="font-semibold">Sahibi / Sorumlusu</TableHead>
                  <TableHead className="font-semibold">Telefon</TableHead>
                  <TableHead className="font-semibold">Vergi Bilgileri</TableHead>
                  <TableHead className="font-semibold">Son Denetim Türü</TableHead>
                  <TableHead className="font-semibold text-center">Uyum Durumu</TableHead>
                  <TableHead className="font-semibold text-center">Ceza / Yaptırım</TableHead>
                  <TableHead className="font-semibold text-right">Son Denetim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const checked = getCheckedCount(row.checklist);
                  const total = getTotalCount(row.inspection_type);
                  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
                  const isGood = pct >= 80;
                  const isExpanded = expandedId === row.id;
                  const hasImages = row.images && row.images.length > 0;

                  return (
                    <>
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      >
                        <TableCell className="text-muted-foreground">
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4" />
                            : <ChevronDown className="w-4 h-4" />
                          }
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {row.workplace_name}
                            {hasImages && (
                              <Camera className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {row.owner_name || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {row.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                              {row.phone}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {row.tax_office || row.tax_number ? (
                            <div className="flex flex-col">
                              {row.tax_office && <span>{row.tax_office} V.D.</span>}
                              {row.tax_number && <span className="font-mono text-[10px] text-muted-foreground/85">No: {row.tax_number}</span>}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {getChecklistLabel(row.inspection_type)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant={isGood ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                              {pct}% Uyumlu
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              ({checked}/{total})
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {(row.penalty_points ?? 0) > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs font-bold text-red-600 dark:text-red-400">{row.penalty_points} Puan</span>
                              <span className="text-[10px] text-muted-foreground">{row.recommended_action || "Uyarı"}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Temiz</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString("tr-TR")}
                        </TableCell>
                      </TableRow>
                      {isExpanded && <InspectionExpandRow key={`${row.id}-expand`} row={row} allWorkplaceInspections={allInspections} />}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
