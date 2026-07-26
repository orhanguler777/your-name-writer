import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, CheckCircle2, XCircle, FileText, Download, MessageCircle, ClipboardCheck,
  Loader2, AlertTriangle, CalendarClock, MapPin, Phone,
} from "lucide-react";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import { openInspectionReport, downloadFromUrl, tutanakBelgeNo } from "@/lib/tutanak";
import { loadSignatures } from "@/lib/signatures";
import { sendTutanakWhatsapp, isSendablePhone } from "@/lib/whatsappTutanak";
import { normalizeWorkplaceName } from "@/lib/qr";
import { toast } from "sonner";

const fmtDateTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString("tr-TR")} ${new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

/**
 * Karekod okutulduğunda açılan ZABITA görünümü.
 * Vatandaşa açık sayfadan farklı: tüm künye, son tutanağın madde madde dökümü
 * ve doğrudan aksiyonlar (PDF, WhatsApp, yeniden denetle) burada.
 */
export function ScannedWorkplacePanel({ workplaceName }: { workplaceName: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "wa" | null>(null);

  // Üretilmiş Supabase tipleri tutanak_url/license_number kolonlarını henüz içermiyor;
  // sayfanın geri kalanı gibi satırlar gevşek tiple kullanılıyor.
  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["scanned-workplace", workplaceName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("*")
        .ilike("workplace_name", normalizeWorkplaceName(workplaceName))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Benzer isimli kayıtlar: tam eşleşme yoksa "bunu mu aradınız?"
  const { data: similar = [] } = useQuery({
    queryKey: ["scanned-workplace-similar", workplaceName],
    enabled: !isLoading && rows.length === 0,
    queryFn: async () => {
      const first = normalizeWorkplaceName(workplaceName).split(" ")[0];
      const { data } = await supabase
        .from("workplace_inspections")
        .select("workplace_name")
        .ilike("workplace_name", `%${first}%`)
        .limit(30);
      return Array.from(new Set((data ?? []).map((r: any) => r.workplace_name))).slice(0, 8);
    },
  });

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Kayıtlar getiriliyor...
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
        <h3 className="font-semibold break-words">{workplaceName}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Bu işyeri adına kayıtlı denetim bulunamadı.
        </p>
        {similar.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted-foreground">Bunu mu aradınız?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {similar.map((s) => (
                <Link
                  key={s}
                  to="/isyeri/$ad"
                  params={{ ad: s }}
                  className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>
        )}
        <Button asChild className="mt-4 gap-2">
          <Link to="/zabita-denetim" search={{ isyeri: workplaceName }}>
            <ClipboardCheck className="h-4 w-4" /> Bu işyerini ilk kez denetle
          </Link>
        </Button>
      </Card>
    );
  }

  const active = rows.find((r: any) => r.id === selectedId) ?? rows[0];
  const checklist = ZABITA_CHECKLISTS.find((c) => c.id === active.inspection_type);
  const checklistData: Record<string, boolean> = (active.checklist as any) || {};
  const missing = checklist ? checklist.items.filter((i) => checklistData[i.id] !== true) : [];
  const penalty = active.penalty_points ?? 0;

  const handlePdf = async () => {
    setBusy("pdf");
    try {
      if (active.tutanak_url) {
        await downloadFromUrl(active.tutanak_url, `Tutanak-${tutanakBelgeNo({ id: active.id } as any)}.pdf`);
        return;
      }
      const sig = await loadSignatures(active.id);
      await openInspectionReport({
        id: active.id,
        workplace_name: active.workplace_name,
        owner_name: active.owner_name,
        address: active.address,
        tax_office: active.tax_office,
        tax_number: active.tax_number,
        phone: active.phone,
        license_number: (active as any).license_number,
        pos_device_number: (active as any).pos_device_number,
        inspection_type: active.inspection_type,
        checklist: checklistData,
        notes: active.notes,
        images: active.images,
        latitude: active.latitude,
        longitude: active.longitude,
        penalty_points: active.penalty_points,
        recommended_action: active.recommended_action,
        created_at: active.created_at,
        inspectorSignatureUrl: sig.inspectorUrl,
        merchantSignatureUrl: sig.merchantUrl,
        merchantSignedName: sig.merchantName,
        declined: sig.declined,
        signedAt: sig.signedAt,
      });
    } catch (e: any) {
      toast.error(e?.message || "Tutanak açılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const handleWhatsapp = async () => {
    setBusy("wa");
    try {
      const res = await sendTutanakWhatsapp(active.id, { phone: active.phone, pdfUrl: active.tutanak_url });
      if (res.ok) toast.success(`Tutanak WhatsApp'tan gönderildi (${res.to ?? active.phone}).`);
      else toast.error("Gönderilemedi: " + res.reason);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Künye */}
      <div className="flex items-start gap-3 border-b bg-primary/5 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold break-words">{active.workplace_name}</h3>
          <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
            {active.owner_name && <div className="break-words">{active.owner_name}</div>}
            {active.address && (
              <div className="flex items-start gap-1">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="break-words">{active.address}</span>
              </div>
            )}
            {active.phone && (
              <div className="flex items-center gap-1">
                <Phone className="h-3 w-3 shrink-0" /> {active.phone}
              </div>
            )}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {rows.length} denetim
        </Badge>
      </div>

      {/* Geçmiş seçici */}
      {rows.length > 1 && (
        <div className="space-y-1.5 border-b bg-muted/20 p-3">
          <Label className="text-[11px] text-muted-foreground">Görüntülenen denetim</Label>
          <Select value={active.id} onValueChange={setSelectedId}>
            <SelectTrigger className="h-8 bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rows.map((r: any) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {fmtDateTime(r.created_at)} — {(r.penalty_points ?? 0) > 0 ? `${r.penalty_points} Puan` : "Temiz"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Sonuç */}
      <div
        className={`flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between ${
          penalty > 0 ? "bg-red-500/5" : "bg-emerald-500/5"
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${
              penalty > 0 ? "bg-red-500" : "bg-emerald-500"
            }`}
          >
            {penalty > 0 ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">
              {penalty > 0 ? `${penalty} ceza puanı — ${active.recommended_action ?? "—"}` : "Uygun — eksik yok"}
            </div>
            <div className="text-xs text-muted-foreground">
              {ZABITA_CHECKLISTS.find((c) => c.id === active.inspection_type)?.title ?? active.inspection_type} ·{" "}
              {fmtDateTime(active.created_at)}
            </div>
          </div>
        </div>
        {active.followup_date && active.followup_status === "pending" && (
          <Badge variant="outline" className="shrink-0 gap-1 border-amber-400 text-[10px] text-amber-700 dark:text-amber-400">
            <CalendarClock className="h-3 w-3" />
            Süre: {new Date(active.followup_date).toLocaleDateString("tr-TR")}
          </Badge>
        )}
      </div>

      {/* Eksik maddeler */}
      {checklist && (
        <div className="border-b">
          <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground">
            <span>
              Denetim maddeleri — {checklist.items.length - missing.length} uygun / {missing.length} eksik
            </span>
          </div>
          <div className="max-h-64 divide-y overflow-y-auto">
            {checklist.items.map((item, i) => {
              const ok = checklistData[item.id] === true;
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-2 px-4 py-2 text-xs ${ok ? "" : "bg-red-50 dark:bg-red-950/20"}`}
                >
                  <span className="w-4 shrink-0 font-mono text-[10px] text-muted-foreground">{i + 1}.</span>
                  {ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  )}
                  <span className={ok ? "text-muted-foreground" : "font-medium text-red-700 dark:text-red-400"}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {active.notes && (
        <div className="border-b bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          <strong>Not:</strong> {active.notes}
        </div>
      )}

      {/* Aksiyonlar */}
      <div className="flex flex-col gap-2 p-4 sm:flex-row">
        <Button asChild className="gap-2 flex-1">
          <Link to="/zabita-denetim" search={{ isyeri: active.workplace_name }}>
            <ClipboardCheck className="h-4 w-4" /> Yeniden Denetle
          </Link>
        </Button>
        <Button variant="outline" className="gap-2 flex-1" onClick={handlePdf} disabled={busy === "pdf"}>
          {active.tutanak_url ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          {active.tutanak_url ? "İmzalı Tutanak" : "Tutanak Oluştur"}
        </Button>
        {isSendablePhone(active.phone) && active.tutanak_url && (
          <Button
            variant="outline"
            className="gap-2 flex-1 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
            onClick={handleWhatsapp}
            disabled={busy === "wa"}
          >
            <MessageCircle className="h-4 w-4" />
            {busy === "wa" ? "Gönderiliyor..." : "WhatsApp'tan Gönder"}
          </Button>
        )}
      </div>
    </Card>
  );
}
