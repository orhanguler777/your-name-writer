import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Printer, Download, Loader2 } from "lucide-react";
import { qrWithLogoDataUrl, workplaceQrUrl } from "@/lib/qr";
import { ALANYA_LOGO_DATA_URL } from "@/lib/alanya-logo";
import { toast } from "sonner";

/**
 * İşyerine yapıştırılacak karekod etiketi.
 * Karekod, vatandaşın okutunca işyerinin güncel denetim durumunu gördüğü
 * halka açık /isyeri/<ad> sayfasına gider.
 */
export function WorkplaceQrDialog({
  open,
  onOpenChange,
  workplaceName,
  address,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workplaceName: string;
  address?: string | null;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const targetUrl = workplaceQrUrl(workplaceName);

  useEffect(() => {
    let alive = true;
    if (!open) {
      setQr(null);
      return;
    }
    qrWithLogoDataUrl(targetUrl, { size: 640 })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [open, targetUrl]);

  const stickerHtml = () => `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>${escapeHtml(workplaceName)} — Denetim Karekodu</title>
<style>
  @page { size: A6; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0;
         display: flex; align-items: center; justify-content: center; }
  .etiket { width: 90mm; border: 2px solid #1e2f5a; border-radius: 6mm; padding: 6mm;
            text-align: center; color: #1e2f5a; }
  .ust { display: flex; align-items: center; justify-content: center; gap: 3mm; margin-bottom: 3mm; }
  .ust img { height: 12mm; }
  .kurum { text-align: left; line-height: 1.15; }
  .kurum b { display: block; font-size: 3.6mm; }
  .kurum span { font-size: 2.6mm; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
  .isyeri { font-size: 4.6mm; font-weight: 700; margin: 2mm 0 3mm; word-break: break-word; }
  .qr img { width: 46mm; height: 46mm; }
  .aciklama { font-size: 2.9mm; line-height: 1.35; margin-top: 3mm; opacity: .85; }
  .adres { font-size: 2.6mm; margin-top: 1.5mm; opacity: .6; word-break: break-word; }
</style></head>
<body onload="window.print()">
  <div class="etiket">
    <div class="ust">
      <img src="${ALANYA_LOGO_DATA_URL}" alt="" />
      <div class="kurum"><b>Alanya Belediyesi</b><span>Zabıta Müdürlüğü</span></div>
    </div>
    <div class="isyeri">${escapeHtml(workplaceName)}</div>
    <div class="qr">${qr ? `<img src="${qr}" alt="karekod" />` : ""}</div>
    <div class="aciklama">Bu işyeri Alanya Belediyesi Zabıta Müdürlüğü tarafından denetlenmektedir.
      Karekodu okutarak güncel denetim durumunu görebilirsiniz.</div>
    ${address ? `<div class="adres">${escapeHtml(address)}</div>` : ""}
  </div>
</body></html>`;

  const handlePrint = () => {
    if (!qr) return;
    const win = window.open("", "_blank", "width=700,height=800");
    if (!win) {
      toast.error("Yazdırma penceresi açılamadı. Açılır pencere engelini kaldırın.");
      return;
    }
    win.document.open();
    win.document.write(stickerHtml());
    win.document.close();
  };

  const handleDownload = () => {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `karekod-${workplaceName
      .replace(/[^\wğüşıöçĞÜŞİÖÇ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")}.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            İşyeri Karekodu
          </DialogTitle>
          <DialogDescription>
            <strong className="break-words">{workplaceName}</strong> için işyerine asılacak etiket.
            Vatandaş okuttuğunda güncel denetim durumunu görür.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {qr ? (
            <img
              src={qr}
              alt="İşyeri karekodu"
              className="w-56 h-56 rounded-lg border bg-white p-2"
            />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-lg border bg-muted/30">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <code className="w-full break-all rounded bg-muted/50 px-2 py-1 text-center text-[10px] text-muted-foreground">
            {targetUrl}
          </code>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDownload} disabled={!qr} className="gap-2">
            <Download className="h-4 w-4" /> PNG İndir
          </Button>
          <Button onClick={handlePrint} disabled={!qr} className="gap-2">
            <Printer className="h-4 w-4" /> Etiketi Yazdır
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
