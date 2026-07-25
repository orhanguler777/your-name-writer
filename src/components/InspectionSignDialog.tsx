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
import { PenLine } from "lucide-react";
import type { SignatureCapture } from "@/lib/signatures";

export function InspectionSignDialog({
  open,
  onOpenChange,
  workplaceName,
  inspectorName,
  defaultMerchantName,
  saving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workplaceName: string;
  inspectorName?: string | null;
  defaultMerchantName?: string | null;
  saving?: boolean;
  onConfirm: (capture: SignatureCapture) => void;
}) {
  const [inspectorSig, setInspectorSig] = useState<string | null>(null);
  const [merchantSig, setMerchantSig] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [declined, setDeclined] = useState(false);

  // Dialog her açıldığında alanları sıfırla
  useEffect(() => {
    if (open) {
      setInspectorSig(null);
      setMerchantSig(null);
      setMerchantName(defaultMerchantName || "");
      setDeclined(false);
    }
  }, [open, defaultMerchantName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Vazgeç
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                inspectorDataUrl: inspectorSig,
                merchantDataUrl: merchantSig,
                merchantName: merchantName || null,
                declined,
              })
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
