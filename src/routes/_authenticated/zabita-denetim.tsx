import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/panel-primitives";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Search, AlertTriangle, Save, ChevronDown, ChevronUp, XCircle, CheckCircle2, Camera, Trash2, UploadCloud, Image, MapPin, Navigation, Clock, FileText } from "lucide-react";
import { ZABITA_CHECKLISTS, calculatePenalty } from "@/lib/ZabitaChecklists";
import { openInspectionReport, generateInspectionPdfBlob } from "@/lib/tutanak";
import { InspectionSignDialog } from "@/components/InspectionSignDialog";
import { uploadSignatures, uploadTutanakPdf, type SignatureCapture } from "@/lib/signatures";
import { useAuth } from "@/hooks/useAuth";
import { RequireZabita } from "@/components/RequireZabita";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getBotSettings } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/zabita-denetim")({
  ssr: false,
  component: () => (
    <RequireZabita>
      <ZabitaDenetimPage />
    </RequireZabita>
  ),
  head: () => ({ meta: [{ title: "İşyeri Denetimi — Zabıta" }] }),
});

function PreviousInspectionsDropdownDetail({
  inspections,
  onLoadIntoForm,
}: {
  inspections: any[];
  onLoadIntoForm?: (inspection: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(inspections[0]?.id || "");

  useEffect(() => {
    if (inspections.length > 0 && (!selectedId || !inspections.some((i) => i.id === selectedId))) {
      setSelectedId(inspections[0].id);
    }
  }, [inspections]);

  const currentInspection = inspections.find((i) => i.id === selectedId) || inspections[0];
  if (!currentInspection) return null;

  const checklist = ZABITA_CHECKLISTS.find((c) => c.id === currentInspection.inspection_type);
  const checklistData: Record<string, boolean> = currentInspection.checklist || {};

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="mt-2 border rounded-lg overflow-hidden shadow-sm bg-background text-left">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 text-xs font-semibold transition-colors border-b"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5 truncate">
          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Geçmiş Denetim Kayıtları ({inspections.length})</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
      </button>

      {open && (
        <div className="p-3 space-y-3 bg-card">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">İncelemek İstediğiniz Tarihi Seçin:</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="h-8 text-xs font-medium bg-background">
                <SelectValue placeholder="Tarih seçiniz..." />
              </SelectTrigger>
              <SelectContent>
                {inspections.map((ins) => {
                  const title = ZABITA_CHECKLISTS.find((c) => c.id === ins.inspection_type)?.title || ins.inspection_type;
                  const pts = ins.penalty_points ?? 0;
                  return (
                    <SelectItem key={ins.id} value={ins.id} className="text-xs">
                      {formatDate(ins.created_at)} — {title} ({pts > 0 ? `${pts} Puan` : "Temiz"})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="p-2.5 rounded border bg-muted/20 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">{formatDate(currentInspection.created_at)} Raporu</span>
              <Badge variant={currentInspection.penalty_points > 0 ? "destructive" : "default"} className="text-[10px] px-1.5 py-0">
                {currentInspection.penalty_points > 0 ? `${currentInspection.penalty_points} Puan - ${currentInspection.recommended_action}` : "Temiz"}
              </Badge>
            </div>

            {onLoadIntoForm && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-7 text-[11px] gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => onLoadIntoForm(currentInspection)}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                Bu Denetimdeki Verileri Forma Aktar
              </Button>
            )}

            {checklist && (
              <div className="divide-y max-h-48 overflow-y-auto border rounded bg-background">
                {checklist.items.map((item, i) => {
                  const checked = checklistData[item.id] === true;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-2 px-2 py-1.5 text-xs ${!checked ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                    >
                      <span className="text-muted-foreground font-mono w-4 shrink-0 text-[10px]">{i + 1}.</span>
                      {checked
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                      }
                      <span className={!checked ? "text-red-700 dark:text-red-400 font-medium" : "text-muted-foreground"}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {currentInspection.notes && (
              <div className="p-2 text-xs text-muted-foreground bg-muted/40 rounded">
                <strong>Not:</strong> {currentInspection.notes}
              </div>
            )}

            {currentInspection.images && currentInspection.images.length > 0 && (
              <div className="space-y-1">
                <strong className="text-[11px] text-muted-foreground block">Fotoğraflar:</strong>
                <div className="flex flex-wrap gap-1.5">
                  {currentInspection.images.map((url: string, index: number) => (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block w-12 h-12 rounded border overflow-hidden hover:opacity-80 transition-opacity shrink-0"
                    >
                      <img src={url} alt={`Fotoğraf ${index + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ZabitaDenetimPage() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const getSettings = useServerFn(getBotSettings);
  const [searchName, setSearchName] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [form, setForm] = useState({
    workplace_name: "",
    owner_name: "",
    address: "",
    tax_office: "",
    tax_number: "",
    phone: "",
    license_number: "",
    pos_device_number: "",
    inspection_type: "",
    notes: "",
  });

  const [checklistData, setChecklistData] = useState<Record<string, boolean>>({});
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  // Memur adresi elle düzenlediyse GPS artık üzerine yazmaz
  const addressTouched = useRef(false);

  /** GPS koordinatından açık adres (mahalle / sokak / no) çözümler — OpenStreetMap Nominatim */
  const reverseGeocode = async (lat: number, lng: number, { force = false } = {}) => {
    setIsGeocoding(true);
    try {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1` +
        `&accept-language=tr&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Adres servisi yanıt vermedi (${res.status})`);
      const json = await res.json();
      const a = json?.address ?? {};

      const mahalle = a.neighbourhood || a.quarter || a.suburb || a.village || a.hamlet;
      const yol = a.road || a.pedestrian || a.footway;
      const kapiNo = a.house_number;
      const ilce = a.town || a.city_district || a.county || a.municipality;
      const il = a.province || a.city || a.state;

      const parts = [
        mahalle ? (/mah/i.test(mahalle) ? mahalle : `${mahalle} Mah.`) : null,
        yol ? (/(cad|sok|blv|bulvar|sk\.|cd\.)/i.test(yol) ? yol : `${yol} Sk.`) : null,
        kapiNo ? `No: ${kapiNo}` : null,
        [ilce, il].filter(Boolean).join("/") || null,
      ].filter(Boolean);

      const formatted = parts.length > 0 ? parts.join(" ") : (json?.display_name ?? null);
      setGeoAddress(formatted);

      // Adres boşsa veya kullanıcı hiç dokunmadıysa otomatik doldur (alan yine düzenlenebilir)
      if (formatted && (force || !addressTouched.current)) {
        setForm((f) => (force || !f.address ? { ...f, address: formatted } : f));
      }
      return formatted;
    } catch (e: any) {
      setGeoAddress(null);
      if (force) toast.error("Adres çözümlenemedi: " + (e?.message || "bilinmeyen hata"));
      return null;
    } finally {
      setIsGeocoding(false);
    }
  };

  // Automatically fetch GPS position on mount / demand
  const fetchLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Tarayıcınız GPS konum servislerini desteklemiyor.");
      return;
    }
    setIsLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCoords({ lat, lng });
        setIsLocating(false);
        void reverseGeocode(lat, lng);
      },
      (err) => {
        setIsLocating(false);
        setLocationError("Konum alınamadı: " + err.message + ". GPS servisinizin açık olduğundan emin olun.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split(".").pop();
        const filePath = `${user?.id || "anonymous"}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from("attachments")
          .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from("attachments")
          .getPublicUrl(filePath);

        urls.push(publicUrl);
      }
      setUploadedImages((prev) => [...prev, ...urls]);
      toast.success(`${files.length} fotoğraf başarıyla yüklendi.`);
    } catch (error: any) {
      toast.error("Fotoğraf yüklenirken hata oluştu: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (urlToRemove: string) => {
    setUploadedImages((prev) => prev.filter((url) => url !== urlToRemove));
  };


  // Sorgu kutusu yalnızca geçmiş denetimleri arar; forma kopyalama yapmaz.
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchName), 500);
    return () => clearTimeout(handler);
  }, [searchName]);

  // Check recent inspections (collision detection)
  const { data: recentInspections, isLoading: isChecking } = useQuery({
    queryKey: ["recent-inspections", debouncedSearch],
    queryFn: async () => {
      const settings = await getSettings();
      const thresholdDays = settings.zabitaInspectionThresholdDays ?? 30;

      if (!debouncedSearch || debouncedSearch.length < 3) return { data: [], thresholdDays };

      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);

      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("*")
        .ilike("workplace_name", `%${debouncedSearch}%`)
        .gte("created_at", thresholdDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { data, thresholdDays };
    },
    enabled: debouncedSearch.length >= 3,
  });

  // Auto-fill form and set checklist when a recent inspection is found
  const lastFilledWorkplace = useRef<string | null>(null);

  /** Formu boşaltır; adres varsa GPS önerisiyle yeniden doldurulur. */
  const clearForm = () => {
    setForm({
      workplace_name: "",
      owner_name: "",
      address: geoAddress ?? "",
      tax_office: "",
      tax_number: "",
      phone: "",
      license_number: "",
      pos_device_number: "",
      inspection_type: "",
      notes: "",
    });
    setChecklistData({});
    addressTouched.current = false;
  };

  useEffect(() => {
    if (recentInspections?.data && recentInspections.data.length > 0) {
      const latest = recentInspections.data[0];
      // Only auto-fill if we haven't auto-filled this exact workplace name yet to avoid overwriting user edits
      if (lastFilledWorkplace.current !== latest.workplace_name) {
        lastFilledWorkplace.current = latest.workplace_name;
        setForm({
          workplace_name: latest.workplace_name || "",
          owner_name: latest.owner_name || "",
          address: latest.address || "",
          phone: latest.phone || "",
          tax_office: latest.tax_office || "",
          tax_number: latest.tax_number || "",
          license_number: (latest as any).license_number || "",
          pos_device_number: (latest as any).pos_device_number || "",
          inspection_type: latest.inspection_type || "",
          notes: "",
        });
        // geçmiş kayıttan adres geldiyse GPS bunun üzerine yazmasın
        if (latest.address) addressTouched.current = true;
        if (latest.checklist) {
          setChecklistData(latest.checklist as Record<string, boolean>);
        }
      }
    } else if (lastFilledWorkplace.current !== null) {
      // Sorgu değiştirildi/silindi ve artık eşleşen kayıt yok:
      // önceki işyerinden otomatik gelen bilgiler formda kalmasın.
      lastFilledWorkplace.current = null;
      clearForm();
    }
  }, [recentInspections?.data]);

  const saveMutation = useMutation({
    mutationFn: async (capture?: SignatureCapture) => {
      if (!user) throw new Error("Oturum bulunamadı");

      const penalty = calculatePenalty(form.inspection_type, checklistData);

      const { data, error } = await supabase.from("workplace_inspections").insert({
        workplace_name: form.workplace_name,
        owner_name: form.owner_name || null,
        address: form.address || null,
        tax_office: form.tax_office || null,
        tax_number: form.tax_number || null,
        phone: form.phone || null,
        inspection_type: form.inspection_type,
        checklist: checklistData,
        notes: form.notes || null,
        inspector_id: user.id,
        images: uploadedImages,
        penalty_points: penalty.penaltyPoints,
        recommended_action: penalty.recommendedAction,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        // Otomatik Re-Denetim Takip Sistemi: Eksikli denetimlere 15 gün sonra takip tarihi atar
        followup_date: penalty.penaltyPoints > 0
          ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
          : null,
        followup_status: penalty.penaltyPoints > 0 ? "pending" : "none",
      }).select("id").single();

      if (error) throw error;

      // Ruhsat / POS bilgileri ayrı yazılır: ilgili migration henüz uygulanmadıysa
      // ana kayıt kaybolmasın diye insert'e dahil edilmez.
      if (data?.id && (form.license_number || form.pos_device_number)) {
        const { error: extraErr } = await supabase
          .from("workplace_inspections")
          .update({
            license_number: form.license_number || null,
            pos_device_number: form.pos_device_number || null,
          } as any)
          .eq("id", data.id);
        if (extraErr) {
          console.warn("Ruhsat/POS bilgisi kaydedilemedi (migration gerekli olabilir):", extraErr.message);
          toast.warning("Ruhsat / POS numarası kaydedilemedi — veritabanı güncellemesi bekliyor.");
        }
      }

      // İmzalar + arşivlenmiş imzalı tutanak PDF'i storage'a yüklenir, DB'ye işlenir
      if (data?.id) {
        const signedAt = new Date().toISOString();
        try {
          if (capture && (capture.inspectorDataUrl || capture.merchantDataUrl || capture.declined)) {
            await uploadSignatures(data.id, capture);
          }

          // İmzalı tutanağı gerçek PDF olarak üret ve arşivle
          const { blob } = await generateInspectionPdfBlob({
            id: data.id,
            workplace_name: form.workplace_name,
            owner_name: form.owner_name,
            address: form.address,
            tax_office: form.tax_office,
            tax_number: form.tax_number,
            phone: form.phone,
            license_number: form.license_number,
            pos_device_number: form.pos_device_number,
            inspection_type: form.inspection_type,
            checklist: checklistData,
            notes: form.notes,
            images: uploadedImages,
            latitude: coords?.lat ?? null,
            longitude: coords?.lng ?? null,
            penalty_points: penalty.penaltyPoints,
            recommended_action: penalty.recommendedAction,
            created_at: signedAt,
            inspectorName: profile?.full_name || profile?.email,
            inspectorSignatureUrl: capture?.inspectorDataUrl ?? null,
            merchantSignatureUrl: capture?.declined ? null : (capture?.merchantDataUrl ?? null),
            merchantSignedName: capture?.merchantName ?? form.owner_name ?? null,
            declined: capture?.declined,
            signedAt,
          });
          const tutanakUrl = await uploadTutanakPdf(data.id, blob);

          // DB'ye arşiv meta bilgisini yaz (migration uygulanmadıysa sessizce geç)
          const { error: updErr } = await supabase
            .from("workplace_inspections")
            .update({
              tutanak_url: tutanakUrl,
              signed_at: signedAt,
              signed_by: profile?.full_name || profile?.email || null,
            })
            .eq("id", data.id);
          if (updErr) {
            console.warn("Tutanak meta güncellenemedi (migration gerekli olabilir):", updErr.message);
          }
        } catch (e: any) {
          toast.warning("Denetim kaydedildi ancak imza/tutanak arşivlenemedi: " + (e?.message || ""));
        }
      }
    },
    onSuccess: () => {
      setSignOpen(false);
      toast.success("Denetim başarıyla kaydedildi.");
      setForm({
        workplace_name: "",
        owner_name: "",
        address: "",
        tax_office: "",
        tax_number: "",
        phone: "",
        license_number: "",
        pos_device_number: "",
        inspection_type: "",
        notes: "",
      });
      setChecklistData({});
      setUploadedImages([]);
      setSearchName("");
      addressTouched.current = false;
      lastFilledWorkplace.current = null;
      queryClient.invalidateQueries({ queryKey: ["recent-inspections"] });
      queryClient.invalidateQueries({ queryKey: ["all-inspections"] });
    },
    onError: (err) => {
      toast.error("Hata oluştu: " + err.message);
    },
  });

  const handleCheckboxChange = (itemId: string, checked: boolean) => {
    setChecklistData((prev) => ({ ...prev, [itemId]: checked }));
  };

  const selectedChecklist = ZABITA_CHECKLISTS.find((c) => c.id === form.inspection_type);
  const hasRecentInspection = recentInspections?.data && recentInspections.data.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="İşyeri Denetimi"
        description="Zabıta ekipleri için dijital işyeri denetim formu."
        icon={ClipboardCheck}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol Kolon */}
        <div className="lg:col-span-1 space-y-6">
          {/* Çakışma Önleme */}
          <Card>
            <CardHeader className="bg-primary/5 pb-4 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                İşyeri Sorgula
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <Label>İşyeri Adı ile Sorgula</Label>
                <Input
                  placeholder="Denetlenecek işyeri adını yazın..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">En az 3 harf girildiğinde geçmiş denetimler sorgulanır.</p>
              </div>

              {isChecking && <div className="text-sm text-muted-foreground animate-pulse">Sorgulanıyor...</div>}

              {hasRecentInspection && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Uyarı!</AlertTitle>
                  <AlertDescription className="text-sm mt-1">
                    Bu işyeri son <strong>{recentInspections.thresholdDays} gün</strong> içinde denetlenmiş.
                    Bilgiler otomatik yüklendi, geçmiş eksikler sağda vurgulanmıştır.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Yeni İşyeri Denetimi Ekle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Yeni İşyeri Denetimi Ekle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>İşyeri Adı <span className="text-red-500">*</span></Label>
                <Input value={form.workplace_name} onChange={(e) => setForm((f) => ({ ...f, workplace_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Sahibi / Sorumlusu</Label>
                <Input value={form.owner_name} onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0XXX XXX XX XX" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Vergi Dairesi</Label>
                  <Input value={form.tax_office} onChange={(e) => setForm((f) => ({ ...f, tax_office: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vergi No</Label>
                  <Input value={form.tax_number} onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Ruhsat Numarası</Label>
                  <Input
                    value={form.license_number}
                    onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))}
                    placeholder="Örn. 2024/1234"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>POS Cihazı Numarası</Label>
                  <Input
                    value={form.pos_device_number}
                    onChange={(e) => setForm((f) => ({ ...f, pos_device_number: e.target.value }))}
                    placeholder="Terminal / POS no"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center justify-between">
                  <span>Adres</span>
                  {coords && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => reverseGeocode(coords.lat, coords.lng, { force: true })}
                      disabled={isGeocoding}
                    >
                      <MapPin className={`w-3 h-3 mr-1 ${isGeocoding ? "animate-pulse" : ""}`} />
                      {isGeocoding ? "Çözümleniyor..." : "GPS'ten Doldur"}
                    </Button>
                  )}
                </Label>
                <Input
                  value={form.address}
                  placeholder={isGeocoding ? "GPS adresi çözümleniyor..." : "Mahalle / Sokak / No"}
                  onChange={(e) => {
                    addressTouched.current = true;
                    setForm((f) => ({ ...f, address: e.target.value }));
                  }}
                />
                {geoAddress && (
                  <p className="text-[11px] text-muted-foreground">
                    {form.address === geoAddress
                      ? "GPS konumundan otomatik dolduruldu — yanlışsa düzeltebilirsiniz."
                      : `GPS önerisi: ${geoAddress}`}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Denetim Türü <span className="text-red-500">*</span></Label>
                <Select value={form.inspection_type} onValueChange={(val) => setForm((f) => ({ ...f, inspection_type: val }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Türü seçiniz..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ZABITA_CHECKLISTS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Saha Konum Doğrulama Kutusu */}
              <div className="pt-2 border-t mt-3">
                <Label className="text-xs font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-500" />
                    Saha Konumu (GPS)
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                    onClick={fetchLocation}
                    disabled={isLocating}
                  >
                    <Navigation className={`w-3 h-3 mr-1 ${isLocating ? "animate-spin" : ""}`} />
                    {isLocating ? "Alınıyor..." : "Yenile"}
                  </Button>
                </Label>
                
                {coords ? (
                  <div className="mt-1.5 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-mono text-[11px]">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                      Konum Doğrulandı
                    </Badge>
                  </div>
                ) : locationError ? (
                  <div className="mt-1.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-800 dark:text-amber-300">
                    {locationError}
                  </div>
                ) : (
                  <div className="mt-1.5 p-2 bg-muted rounded text-xs text-muted-foreground flex items-center gap-2">
                    <Navigation className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>GPS konumu tespiti yapılıyor...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sağ Kolon: Denetim Formu */}
        <div className="lg:col-span-2">
          {!selectedChecklist ? (
            <Card className="h-full flex flex-col items-center justify-center p-12 text-center text-muted-foreground border-dashed bg-muted/20">
              <ClipboardCheck className="w-12 h-12 mb-4 text-muted-foreground/50" />
              <p>Lütfen denetim türü seçiniz.</p>
              <p className="text-sm mt-2 max-w-sm">Tür seçildikten sonra ilgili işyerine ait denetim maddeleri burada listelenecektir.</p>
            </Card>
          ) : (
            <Card className="h-full flex flex-col">
              <CardHeader className="bg-primary/5 pb-4 border-b space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{selectedChecklist.title} Denetim Formu</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Aşağıdaki kriterlerin işyerinde bulunup bulunmadığını işaretleyiniz.</p>
                  </div>
                  {hasRecentInspection && recentInspections?.data && recentInspections.data.length > 0 && (
                    <div className="w-full sm:max-w-xs shrink-0">
                      <PreviousInspectionsDropdownDetail
                        inspections={recentInspections.data}
                        onLoadIntoForm={(inspection) => {
                          if (inspection.checklist) {
                            setChecklistData(inspection.checklist as Record<string, boolean>);
                          }
                          if (inspection.inspection_type) {
                            setForm((f) => ({ ...f, inspection_type: inspection.inspection_type }));
                          }
                          toast.success(`${new Date(inspection.created_at).toLocaleDateString("tr-TR")} tarihli denetim verileri forma yüklendi.`);
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Ceza ve Yaptırım Değerlendirme Kartı (Üst Kısım) */}
                {(() => {
                  const penalty = calculatePenalty(form.inspection_type, checklistData);
                  const isSevere = penalty.penaltyPoints > 50;
                  const isMedium = penalty.penaltyPoints > 25;
                  const isWarning = penalty.penaltyPoints > 0;

                  return (
                    <div className={`p-3 rounded-lg border flex items-center justify-between gap-4 transition-colors ${
                      isSevere
                        ? "bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-300"
                        : isMedium
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300"
                        : isWarning
                        ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-900 dark:text-yellow-300"
                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300"
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full ${
                          isSevere ? "bg-red-500 text-white" : isMedium ? "bg-amber-500 text-white" : isWarning ? "bg-yellow-500 text-white" : "bg-emerald-500 text-white"
                        }`}>
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold flex items-center gap-2">
                            <span>Otomatik Ceza Puanı: <strong className="text-sm font-bold">{penalty.penaltyPoints} Puan</strong></span>
                            {penalty.missingItemsCount > 0 && (
                              <span className="text-[11px] opacity-80">({penalty.missingItemsCount} eksik madde)</span>
                            )}
                          </div>
                          <div className="text-xs opacity-90 mt-0.5">
                            Tavsiye Edilen Yaptırım: <strong>{penalty.recommendedAction}</strong>
                          </div>
                        </div>
                      </div>
                      <Badge variant={isSevere ? "destructive" : "outline"} className="shrink-0 text-xs px-2.5 py-1 font-semibold">
                        {penalty.recommendedAction}
                      </Badge>
                    </div>
                  );
                })()}
              </CardHeader>
              <CardContent className="flex-1 p-0">
                {/* Hızlı İşlem Barı */}
                <div className="px-4 py-2.5 bg-muted/40 border-b flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                      onClick={() => {
                        const newMap: Record<string, boolean> = {};
                        selectedChecklist.items.forEach((item) => {
                          newMap[item.id] = true;
                        });
                        setChecklistData(newMap);
                        toast.success("Tüm maddeler 'VAR / UYGUN' olarak işaretlendi.");
                      }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Tümünü Var / Uygun İşaretle
                    </Button>

                    {hasRecentInspection && recentInspections?.data?.[0]?.checklist && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800"
                        onClick={() => {
                          if (recentInspections.data[0].checklist) {
                            setChecklistData(recentInspections.data[0].checklist as Record<string, boolean>);
                            toast.info("En son denetimdeki tüm maddeler aktarıldı.");
                          }
                        }}
                      >
                        <ClipboardCheck className="w-3.5 h-3.5 mr-1 text-blue-600" />
                        Son Denetimden Aktar
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => {
                        try {
                          openInspectionReport({
                            workplace_name: form.workplace_name || "—",
                            owner_name: form.owner_name,
                            address: form.address,
                            tax_office: form.tax_office,
                            tax_number: form.tax_number,
                            phone: form.phone,
                            license_number: form.license_number,
                            pos_device_number: form.pos_device_number,
                            inspection_type: form.inspection_type,
                            checklist: checklistData,
                            notes: form.notes,
                            images: uploadedImages,
                            latitude: coords?.lat ?? null,
                            longitude: coords?.lng ?? null,
                            inspectorName: profile?.full_name || profile?.email || null,
                            created_at: new Date().toISOString(),
                          });
                        } catch (e: any) {
                          toast.error(e?.message || "Tutanak oluşturulamadı.");
                        }
                      }}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Tutanak Önizle (PDF)
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setChecklistData({})}
                    >
                      Seçimleri Temizle
                    </Button>
                  </div>
                </div>

                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {selectedChecklist.items.map((item, index) => {
                    const sameTypeInspection = recentInspections?.data?.find(
                      (ins: any) => ins.inspection_type === form.inspection_type
                    );
                    const lastChecklist = sameTypeInspection?.checklist as Record<string, any> | undefined;
                    const wasMissingLastTime = sameTypeInspection && lastChecklist?.[item.id] !== true;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-4 p-4 transition-colors cursor-pointer border-l-2 ${
                          checklistData[item.id]
                            ? "bg-green-50/50 dark:bg-green-950/10 border-l-green-500"
                            : wasMissingLastTime
                            ? "bg-red-50/70 dark:bg-red-950/20 border-l-red-500"
                            : "hover:bg-muted/30 border-l-transparent"
                        }`}
                        onClick={() => handleCheckboxChange(item.id, !checklistData[item.id])}
                      >
                        <span className="text-muted-foreground font-mono w-6 shrink-0">{index + 1}.</span>
                        <div className="flex-1 space-y-1">
                          <span className="text-sm leading-relaxed block">{item.label}</span>
                          {wasMissingLastTime && (
                            <span className="inline-flex items-center text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">
                              Son denetimde eksikti!
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Checkbox
                            id={`item-${item.id}`}
                            checked={checklistData[item.id] || false}
                            onCheckedChange={(val) => handleCheckboxChange(item.id, !!val)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Label htmlFor={`item-${item.id}`} className="cursor-pointer text-xs uppercase text-muted-foreground">VAR</Label>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 border-t space-y-4 bg-muted/10">
                  <div className="space-y-2">
                    <Label>Ek Notlar ve Gözlemler</Label>
                    <Input
                      placeholder="Mevzuata aykırı başka bir durum var mı?"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-muted-foreground" />
                      Denetim Fotoğrafları
                    </Label>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="relative gap-2"
                          disabled={isUploading}
                        >
                          <UploadCloud className="w-4 h-4" />
                          {isUploading ? "Yükleniyor..." : "Fotoğraf Ekle"}
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            disabled={isUploading}
                          />
                        </Button>
                        <span className="text-xs text-muted-foreground">İstediğiniz kadar fotoğraf ekleyebilirsiniz.</span>
                      </div>

                      {uploadedImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-2 bg-background border rounded-lg">
                          {uploadedImages.map((url, i) => (
                            <div key={i} className="relative group w-20 h-20 rounded border overflow-hidden shrink-0">
                              <img src={url} alt={`Yüklenen Fotoğraf ${i + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeImage(url)}
                                className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-90 transition-opacity"
                                title="Fotoğrafı Kaldır"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-4 border-t bg-card flex justify-between items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {Object.values(checklistData).filter(Boolean).length} / {selectedChecklist.items.length} madde işaretlendi
                </span>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setForm({ ...form, inspection_type: "" })}>Vazgeç</Button>
                  <Button
                    onClick={() => setSignOpen(true)}
                    disabled={saveMutation.isPending || !form.workplace_name}
                    className="gap-2"
                  >
                    {saveMutation.isPending ? "Kaydediliyor..." : <><Save className="w-4 h-4" /> İmzala ve Kaydet</>}
                  </Button>
                </div>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>

      <InspectionSignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        workplaceName={form.workplace_name}
        inspectorName={profile?.full_name || profile?.email}
        defaultMerchantName={form.owner_name}
        saving={saveMutation.isPending}
        onConfirm={(capture) => saveMutation.mutate(capture)}
      />
    </div>
  );
}
