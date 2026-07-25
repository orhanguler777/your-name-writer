import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, KpiCard } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Search, FileCheck2, AlertTriangle, Archive, PenLine } from "lucide-react";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import { openInspectionReport, downloadFromUrl, tutanakBelgeNo } from "@/lib/tutanak";
import { loadSignatures } from "@/lib/signatures";
import { RequireZabita } from "@/components/RequireZabita";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tutanak-arsivi")({
  ssr: false,
  component: () => (
    <RequireZabita>
      <TutanakArsiviPage />
    </RequireZabita>
  ),
  head: () => ({ meta: [{ title: "Tutanak Arşivi — Zabıta" }] }),
});

const typeTitle = (id: string) => ZABITA_CHECKLISTS.find((c) => c.id === id)?.title || id;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}

function TutanakArsiviPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [durum, setDurum] = useState("all"); // all | cezali | temiz
  const [imza, setImza] = useState("all"); // all | imzali | imzasiz
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["tutanak-arsivi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r: any) => {
      const belgeNo = tutanakBelgeNo({ id: r.id } as any).toLowerCase();
      if (q) {
        const hay = [r.workplace_name, r.owner_name, r.tax_number, belgeNo]
          .map((x) => String(x ?? "").toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      if (type !== "all" && r.inspection_type !== type) return false;
      const pts = r.penalty_points ?? 0;
      if (durum === "cezali" && !(pts > 0)) return false;
      if (durum === "temiz" && pts > 0) return false;
      const signed = !!(r.tutanak_url || r.signed_at);
      if (imza === "imzali" && !signed) return false;
      if (imza === "imzasiz" && signed) return false;
      if (from && new Date(r.created_at) < new Date(from + "T00:00:00")) return false;
      if (to && new Date(r.created_at) > new Date(to + "T23:59:59")) return false;
      return true;
    });
  }, [rows, search, type, durum, imza, from, to]);

  const stats = useMemo(() => {
    const total = rows.length;
    const signed = rows.filter((r: any) => r.tutanak_url || r.signed_at).length;
    const penalized = rows.filter((r: any) => (r.penalty_points ?? 0) > 0).length;
    const sealed = rows.filter((r: any) => (r.penalty_points ?? 0) > 85).length;
    return { total, signed, penalized, sealed };
  }, [rows]);

  const handleGet = async (r: any) => {
    try {
      setBusyId(r.id);
      const filename = `Tutanak-${tutanakBelgeNo({ id: r.id } as any)}.pdf`;
      if (r.tutanak_url) {
        await downloadFromUrl(r.tutanak_url, filename);
        return;
      }
      // Arşivlenmiş PDF yoksa (eski kayıt) tutanağı yeniden üretip yazdırma/PDF diyaloğu aç
      const sig = await loadSignatures(r.id);
      await openInspectionReport({
        id: r.id,
        workplace_name: r.workplace_name,
        owner_name: r.owner_name,
        address: r.address,
        tax_office: r.tax_office,
        tax_number: r.tax_number,
        phone: r.phone,
        inspection_type: r.inspection_type,
        checklist: (r.checklist || {}) as Record<string, boolean>,
        notes: r.notes,
        images: r.images,
        latitude: r.latitude,
        longitude: r.longitude,
        penalty_points: r.penalty_points,
        recommended_action: r.recommended_action,
        created_at: r.created_at,
        inspectorSignatureUrl: sig.inspectorUrl,
        merchantSignatureUrl: sig.merchantUrl,
        merchantSignedName: sig.merchantName,
        declined: sig.declined,
        signedAt: sig.signedAt,
      });
    } catch (e: any) {
      toast.error(e?.message || "Belge açılamadı.");
    } finally {
      setBusyId(null);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setType("all");
    setDurum("all");
    setImza("all");
    setFrom("");
    setTo("");
  };

  return (
    <div>
      <PageHeader
        title="Tutanak Arşivi"
        description="İmzalı denetim tutanaklarının merkezi arşivi. Belgeler bulutta saklanır; buradan aratıp indirebilirsiniz."
      />

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <KpiCard label="Toplam Belge" value={stats.total} icon={Archive} accent="primary" />
        <KpiCard label="İmzalı" value={stats.signed} icon={FileCheck2} accent="accent" />
        <KpiCard label="Cezalı" value={stats.penalized} icon={AlertTriangle} accent="warn" />
        <KpiCard label="Mühürleme" value={stats.sealed} icon={PenLine} accent="destructive" />
      </div>

      {/* Filtreler */}
      <Card className="p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label className="text-xs">Ara</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="İşyeri, sahip, vergi no veya belge no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Denetim Türü</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {ZABITA_CHECKLISTS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Durum</Label>
            <Select value={durum} onValueChange={setDurum}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="cezali">Cezalı</SelectItem>
                <SelectItem value="temiz">Temiz</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">İmza</Label>
            <Select value={imza} onValueChange={setImza}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="imzali">İmzalı / Arşivli</SelectItem>
                <SelectItem value="imzasiz">İmzasız</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Başlangıç</Label>
            <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Bitiş</Label>
            <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={resetFilters}>
              Filtreleri Temizle
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/40 text-xs text-muted-foreground">
          {isLoading ? "Yükleniyor..." : `${filtered.length} belge listeleniyor`}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Belge No</TableHead>
                <TableHead>İşyeri</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>Ceza / Yaptırım</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => {
                const pts = r.penalty_points ?? 0;
                const signed = !!(r.tutanak_url || r.signed_at);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{tutanakBelgeNo({ id: r.id } as any)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{r.workplace_name}</div>
                      {r.owner_name && <div className="text-[11px] text-muted-foreground">{r.owner_name}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{typeTitle(r.inspection_type)}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                    <TableCell>
                      {pts > 0 ? (
                        <div>
                          <div className="text-xs font-semibold text-destructive">{pts} Puan</div>
                          <div className="text-[10px] text-muted-foreground">{r.recommended_action}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600 font-medium">Temiz</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {signed ? (
                        <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 border-emerald-300">
                          <FileCheck2 className="w-3 h-3" /> {r.tutanak_url ? "Arşivli" : "İmzalı"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">İmzasız</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.tutanak_url ? "default" : "outline"}
                        className="h-7 text-xs gap-1.5"
                        disabled={busyId === r.id}
                        onClick={() => handleGet(r)}
                      >
                        {r.tutanak_url ? <Download className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                        {r.tutanak_url ? "İndir" : "Oluştur"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-sm text-muted-foreground">
                    Filtrelere uygun belge bulunamadı.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
