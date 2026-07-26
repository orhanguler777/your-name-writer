import { qrWithLogoDataUrl, workplaceQrUrl } from "./qr";
import { ALANYA_LOGO_DATA_URL } from "./alanya-logo";

export interface LabelWorkplace {
  name: string;
  address?: string | null;
  licenseNumber?: string | null;
}

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Seçili işyerleri için A4 sayfada 3×4 = 12 etiketlik yazdırma sayfası üretir.
 * Kesim çizgileri kesikli çerçeve ile verilir; 12'yi aşan seçim otomatik sayfalanır.
 */
export async function buildLabelSheetHtml(
  workplaces: LabelWorkplace[],
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  const cells: string[] = [];

  for (let i = 0; i < workplaces.length; i++) {
    const w = workplaces[i];
    let qr = "";
    try {
      qr = await qrWithLogoDataUrl(workplaceQrUrl(w.name), { size: 420 });
    } catch {
      qr = "";
    }
    cells.push(`
      <div class="etiket">
        <div class="ust">
          <img class="amblem" src="${ALANYA_LOGO_DATA_URL}" alt="" />
          <div class="kurum"><b>Alanya Belediyesi</b><span>Zabıta Müdürlüğü</span></div>
        </div>
        <div class="isyeri">${esc(w.name)}</div>
        ${qr ? `<img class="qr" src="${qr}" alt="karekod" />` : `<div class="qr-yok">Karekod üretilemedi</div>`}
        <div class="aciklama">Denetim durumunu görmek için karekodu okutun.</div>
        ${w.licenseNumber ? `<div class="ruhsat">Ruhsat: ${esc(w.licenseNumber)}</div>` : ""}
      </div>`);
    onProgress?.(i + 1, workplaces.length);
  }

  // 12'lik sayfalara böl
  const pages: string[] = [];
  for (let i = 0; i < cells.length; i += 12) {
    const pageCells = cells.slice(i, i + 12);
    // Son sayfada grid bozulmasın diye boş hücreler eklenir
    while (pageCells.length < 12) pageCells.push('<div class="etiket bos"></div>');
    pages.push(`<div class="sayfa">${pageCells.join("")}</div>`);
  }

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>İşyeri Karekod Etiketleri (${workplaces.length} adet)</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1e2f5a; }
  .sayfa {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(4, 1fr);
    width: 194mm; height: 281mm;
    page-break-after: always;
  }
  .sayfa:last-child { page-break-after: auto; }
  .etiket {
    border: 1px dashed #b8c0d4;
    padding: 3mm;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    text-align: center; overflow: hidden;
  }
  .etiket.bos { border-color: #eef0f5; }
  .ust { display: flex; align-items: center; gap: 1.6mm; margin-bottom: 1.4mm; }
  .amblem { height: 7mm; }
  .kurum { text-align: left; line-height: 1.1; }
  .kurum b { display: block; font-size: 2.5mm; }
  .kurum span { font-size: 1.9mm; letter-spacing: .06em; text-transform: uppercase; opacity: .7; }
  .isyeri {
    font-size: 3.1mm; font-weight: 700; line-height: 1.15;
    margin-bottom: 1.4mm; word-break: break-word;
    /* Uzun ünvanlar grid'i bozmasın: iki satırda üç nokta ile kesilir */
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; max-height: 7.5mm;
  }
  .qr { width: 34mm; height: 34mm; }
  .qr-yok { width: 34mm; height: 34mm; display: flex; align-items: center; justify-content: center;
            font-size: 2.2mm; border: 1px solid #ddd; color: #999; }
  .aciklama { font-size: 2.1mm; line-height: 1.25; margin-top: 1.4mm; opacity: .8; }
  .ruhsat { font-size: 1.9mm; margin-top: .8mm; opacity: .6; }
  @media screen {
    body { background: #eef0f5; padding: 10mm 0; }
    .sayfa { background: #fff; margin: 0 auto 8mm; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
  }
</style></head>
<body>
  ${pages.join("")}
  <script>window.addEventListener("load", function () { setTimeout(function(){ window.print(); }, 300); });</script>
</body></html>`;
}

/** Etiket sayfasını yeni sekmede açıp yazdırma diyalogunu tetikler. */
export function openLabelSheet(html: string) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) throw new Error("Yazdırma penceresi açılamadı. Açılır pencere engelini kaldırın.");
  win.document.open();
  win.document.write(html);
  win.document.close();
}
