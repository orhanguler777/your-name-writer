import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, Printer, Search, Loader2, ScanLine, CameraOff, RefreshCw } from "lucide-react";
import { RequireZabita } from "@/components/RequireZabita";
import { WorkplaceQrDialog } from "@/components/WorkplaceQrDialog";
import { ScannedWorkplacePanel } from "@/components/ScannedWorkplacePanel";
import { normalizeWorkplaceName, parseQrTarget } from "@/lib/qr";
import { buildLabelSheetHtml, openLabelSheet } from "@/lib/qrLabels";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/zabita-karekod")({
  ssr: false,
  component: () => (
    <RequireZabita>
      <ZabitaKarekodPage />
    </RequireZabita>
  ),
  head: () => ({ meta: [{ title: "Karekod Yönetimi — Zabıta" }] }),
});

interface WorkplaceRow {
  name: string;
  owner: string | null;
  address: string | null;
  phone: string | null;
  licenseNumber: string | null;
  lastAt: string;
  lastType: string;
  penaltyPoints: number;
  followupPending: boolean;
  inspectionCount: number;
}

const typeTitle = (id?: string | null) => ZABITA_CHECKLISTS.find((c) => c.id === id)?.title || id || "—";

function ZabitaKarekodPage() {
  const [tab, setTab] = useState("arsiv");
  const [scannedName, setScannedName] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Karekod Yönetimi"
        description="İşyeri karekod etiketlerini listele, yazdır ve sahada okut."
        icon={QrCode}
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="arsiv">Etiket Arşivi</TabsTrigger>
          <TabsTrigger value="oku">Karekod Oku</TabsTrigger>
        </TabsList>

        <TabsContent value="arsiv">
          <LabelArchiveTab />
        </TabsContent>

        <TabsContent value="oku">
          <ScanTab
            scannedName={scannedName}
            onScanned={setScannedName}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── Sekme 1: Etiket Arşivi ─── */
function LabelArchiveTab() {
  const [search, setSearch] = useState("");
  const [uyum, setUyum] = useState("all"); // all | uygun | eksik
  const [type, setType] = useState("all");
  const [onlyFollowup, setOnlyFollowup] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qrTarget, setQrTarget] = useState<WorkplaceRow | null>(null);
  const [printing, setPrinting] = useState<{ done: number; total: number } | null>(null);

  const { data: workplaces = [], isLoading } = useQuery({
    queryKey: ["karekod-workplaces"],
    queryFn: async (): Promise<WorkplaceRow[]> => {
      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // İşyeri kimliği isim bazlı: normalize edilmiş ada göre teklenir, en yeni kayıt esas alınır
      const map = new Map<string, WorkplaceRow>();
      for (const row of data ?? []) {
        if (!row.workplace_name) continue;
        const name = normalizeWorkplaceName(row.workplace_name);
        const key = name.toLocaleLowerCase("tr");
        const existing = map.get(key);
        if (existing) {
          existing.inspectionCount += 1;
          continue;
        }
        map.set(key, {
          name,
          owner: row.owner_name,
          address: row.address,
          phone: row.phone,
          licenseNumber: (row as any).license_number ?? null,
          lastAt: row.created_at,
          lastType: row.inspection_type,
          penaltyPoints: row.penalty_points ?? 0,
          followupPending: row.followup_status === "pending",
          inspectionCount: 1,
        });
      }
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLocaleLowerCase("tr");
    return workplaces.filter((w) => {
      if (q) {
        const hay = [w.name, w.owner, w.address, w.licenseNumber, w.phone]
          .map((x) => (x ?? "").toLocaleLowerCase("tr"))
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      if (uyum === "uygun" && w.penaltyPoints > 0) return false;
      if (uyum === "eksik" && w.penaltyPoints === 0) return false;
      if (type !== "all" && w.lastType !== type) return false;
      if (onlyFollowup && !w.followupPending) return false;
      return true;
    });
  }, [workplaces, search, uyum, type, onlyFollowup]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((w) => selected.has(w.name));

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((w) => next.delete(w.name));
      else filtered.forEach((w) => next.add(w.name));
      return next;
    });
  };

  const handleBulkPrint = async () => {
    const list = workplaces.filter((w) => selected.has(w.name));
    if (list.length === 0) return;
    setPrinting({ done: 0, total: list.length });
    try {
      const html = await buildLabelSheetHtml(
        list.map((w) => ({ name: w.name, address: w.address, licenseNumber: w.licenseNumber })),
        (done, total) => setPrinting({ done, total })
      );
      openLabelSheet(html);
      toast.success(
        `${list.length} etiket hazırlandı (${Math.ceil(list.length / 12)} sayfa A4).`
      );
    } catch (e: any) {
      toast.error(e?.message || "Etiketler hazırlanamadı.");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Ara</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="İşyeri, sahip, adres, ruhsat no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Uyum Durumu</Label>
            <Select value={uyum} onValueChange={setUyum}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                <SelectItem value="uygun">Uygun</SelectItem>
                <SelectItem value="eksik">Eksik tespit edilen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Son Denetim Türü</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tümü</SelectItem>
                {ZABITA_CHECKLISTS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={onlyFollowup} onCheckedChange={(v) => setOnlyFollowup(!!v)} />
              Sadece re-denetim bekleyenler
            </label>
          </div>
        </div>
      </Card>

      {/* Seçim / baskı barı */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFiltered} />
            Listedekilerin tümünü seç ({filtered.length})
          </label>
          {selected.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selected.size} işyeri seçili · {Math.ceil(selected.size / 12)} sayfa
            </Badge>
          )}
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
              Seçimi temizle
            </Button>
          )}
        </div>
        <Button
          onClick={handleBulkPrint}
          disabled={selected.size === 0 || !!printing}
          className="gap-2 w-full sm:w-auto"
        >
          {printing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Hazırlanıyor ({printing.done}/{printing.total})</>
          ) : (
            <><Printer className="h-4 w-4" /> Seçili Etiketleri Yazdır</>
          )}
        </Button>
      </Card>

      {/* Liste */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Filtrelere uygun işyeri bulunamadı.
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((w) => (
              <li key={w.name} className="flex items-start gap-3 p-3 sm:p-4 hover:bg-muted/30">
                <Checkbox
                  className="mt-1 shrink-0"
                  checked={selected.has(w.name)}
                  onCheckedChange={() => toggle(w.name)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium break-words">{w.name}</span>
                    {w.penaltyPoints > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">{w.penaltyPoints} Puan</Badge>
                    ) : (
                      <Badge className="bg-emerald-500 text-[10px] text-white hover:bg-emerald-500">Temiz</Badge>
                    )}
                    {w.followupPending && (
                      <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700 dark:text-amber-400">
                        Re-denetim bekliyor
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground break-words">
                    {[w.owner, w.address].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {typeTitle(w.lastType)} · Son denetim {new Date(w.lastAt).toLocaleDateString("tr-TR")} ·{" "}
                    {w.inspectionCount} kayıt
                    {w.licenseNumber ? ` · Ruhsat ${w.licenseNumber}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={() => setQrTarget(w)}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Etiket</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <WorkplaceQrDialog
        open={!!qrTarget}
        onOpenChange={(v) => !v && setQrTarget(null)}
        workplaceName={qrTarget?.name ?? ""}
        address={qrTarget?.address}
      />
    </div>
  );
}

/* ─── Sekme 2: Karekod Oku ─── */
function ScanTab({
  scannedName,
  onScanned,
}: {
  scannedName: string | null;
  onScanned: (name: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => stop, []);

  const handleDecoded = (raw: string) => {
    const target = parseQrTarget(raw);
    if (!target) {
      setError("Okunan karekod belediyeye ait bir işyeri etiketi değil.");
      return;
    }
    stop();
    if (target.kind === "workplace") {
      onScanned(target.name);
    } else {
      // Tutanak karekodu: kaydı bulup işyerine götür
      supabase
        .from("workplace_inspections")
        .select("workplace_name")
        .eq("id", target.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.workplace_name) onScanned(normalizeWorkplaceName(data.workplace_name));
          else setError("Karekoddaki tutanak kaydı bulunamadı.");
        });
    }
  };

  const start = async () => {
    setError(null);
    onScanned(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Tarayıcı kamera erişimini desteklemiyor. Aşağıdan elle arayabilirsiniz.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      // Android/Chromium: tarayıcının yerleşik okuyucusu. iOS Safari'de yok → jsQR
      const detector =
        "BarcodeDetector" in window ? new (window as any).BarcodeDetector({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (!streamRef.current || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(() => void tick());
          return;
        }
        try {
          if (detector) {
            const found = await detector.detect(video);
            if (found.length > 0) return handleDecoded(found[0].rawValue);
          } else if (jsQR && ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const res = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (res?.data) return handleDecoded(res.data);
          }
        } catch {
          /* kare atlandı, devam */
        }
        rafRef.current = requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch (e: any) {
      setScanning(false);
      setError(
        e?.name === "NotAllowedError"
          ? "Kamera izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin."
          : "Kamera açılamadı: " + (e?.message || "bilinmeyen hata") +
            " (kamera için HTTPS gerekir, localhost hariç)"
      );
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-full max-w-sm overflow-hidden rounded-lg border bg-black/90 aspect-square">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${scanning ? "" : "opacity-0"}`}
            />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
                <ScanLine className="h-10 w-10" />
                <span className="text-xs">Kamera kapalı</span>
              </div>
            )}
            {scanning && (
              <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
            )}
          </div>

          <div className="flex w-full max-w-sm gap-2">
            {scanning ? (
              <Button variant="outline" className="flex-1 gap-2" onClick={stop}>
                <CameraOff className="h-4 w-4" /> Kamerayı Kapat
              </Button>
            ) : (
              <Button className="flex-1 gap-2" onClick={start}>
                <ScanLine className="h-4 w-4" /> Karekodu Okut
              </Button>
            )}
            {scannedName && (
              <Button variant="outline" className="gap-2" onClick={() => { onScanned(null); void start(); }}>
                <RefreshCw className="h-4 w-4" /> Yeni
              </Button>
            )}
          </div>

          {error && (
            <p className="max-w-sm rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-center text-xs text-amber-800 dark:text-amber-300">
              {error}
            </p>
          )}

          {/* Kamera yoksa / etiket okunmuyorsa elle giriş */}
          <div className="w-full max-w-sm space-y-1.5 border-t pt-3">
            <Label className="text-xs text-muted-foreground">Karekod okunmuyorsa işyeri adını yazın</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Örn. VAHA MARKET"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && manual.trim().length >= 2) {
                    stop();
                    onScanned(normalizeWorkplaceName(manual));
                  }
                }}
              />
              <Button
                variant="outline"
                disabled={manual.trim().length < 2}
                onClick={() => { stop(); onScanned(normalizeWorkplaceName(manual)); }}
              >
                Bul
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {scannedName && <ScannedWorkplacePanel workplaceName={scannedName} />}
    </div>
  );
}
