import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/SignaturePad";
import { PenLine, MessageCircle } from "lucide-react";
import type { SignatureCapture } from "@/lib/signatures";
import { isSendablePhone } from "@/lib/whatsappTutanak";

export function InspectionSignDialog({
  open,
  onOpenChange,
  workplaceName,
  inspectorName,
  defaultMerchantName,
  merchantPhone,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workplaceName: string;
  inspectorName?: string | null;
  defaultMerchantName?: string | null;
  /** İşyeri telefonu — doluysa tutanak WhatsApp'tan gönderilebilir */
  merchantPhone?: string | null;
  saving?: boolean;
  onConfirm: (capture: SignatureCapture, opts: { sendWhatsapp: boolean }) => void;
}) {
  const [inspectorSig, setInspectorSig] = useState<string | null>(null);
  const [merchantSig, setMerchantSig] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [declined, setDeclined] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(true);

  const canSendWhatsapp = isSendablePhone(merchantPhone);

  // Dialog her açıldığında alanları sıfırla
  useEffect(() => {
    if (open) {
      setInspectorSig(null);
      setMerchantSig(null);
      setMerchantName(defaultMerchantName || "");
      setDeclined(false);
      setSendWhatsapp(true);
    }
  }, [open, defaultMerchantName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Telefonda içerik ekrana sığmayabilir: dialog kaydırılabilir olmalı,
          yoksa "İmzala ve Kaydet" butonu ekran dışında kalıyor. */}
      <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-4 h-4 text-primary" />
            Denetimi İmzala & Tamamla
          </DialogTitle>
          <DialogDescription>
            <strong>{workplaceName || "İşyeri"}</strong> denetimi için imzaları alın. İmzalar tutanağa işlenir ve kalıcı olarak saklanır.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <SignaturePad
            label={`Denetleyen Zabıta Görevlisi${inspectorName ? " — " + inspectorName : ""}`}
            onChange={setInspectorSig}
          />

          <div className="space-y-2 rounded-md border p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">İşyeri Sahibi / Yetkilisi Adı</Label>
              <Input
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="Ad Soyad"
                className="h-8 text-sm"
              />
            </div>

            <SignaturePad label="İşyeri Sahibi / Yetkilisi İmzası" disabled={declined} onChange={setMerchantSig} />

            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
              <Checkbox checked={declined} onCheckedChange={(v) => setDeclined(!!v)} />
              İşyeri yetkilisi imzadan imtina etti (tutanağa işlenecek)
            </label>
          </div>

          {/* Tutanağın esnafa WhatsApp'tan iletilmesi */}
          {canSendWhatsapp ? (
            <label className="flex items-start gap-2 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-3 cursor-pointer">
              <Checkbox
                checked={sendWhatsapp}
                onCheckedChange={(v) => setSendWhatsapp(!!v)}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="font-medium flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                  <MessageCircle className="w-3.5 h-3.5" />
                  İmzalı tutanağı WhatsApp'tan gönder
                </span>
                <span className="text-muted-foreground block mt-0.5">
                  {merchantPhone} numarasına PDF olarak iletilir.
                </span>
              </span>
            </label>
          ) : (
            <p className="text-[11px] text-muted-foreground rounded-md border border-dashed p-2.5">
              İşyeri telefonu girilmediği için tutanak WhatsApp'tan gönderilemez.
              Numarayı forma ekleyip tekrar deneyebilirsiniz.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button
            onClick={() =>
              onConfirm(
                {
                  inspectorDataUrl: inspectorSig,
                  merchantDataUrl: merchantSig,
                  merchantName: merchantName || null,
                  declined,
                },
                { sendWhatsapp: canSendWhatsapp && sendWhatsapp }
              )
            }
            disabled={saving}
            className="gap-2"
          >
            {saving ? "Kaydediliyor..." : "İmzala ve Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
