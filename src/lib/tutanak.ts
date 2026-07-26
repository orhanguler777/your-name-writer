import QRCode from "qrcode";
import { ZABITA_CHECKLISTS, calculatePenalty } from "./ZabitaChecklists";
import { ALANYA_LOGO_DATA_URL } from "./alanya-logo";

export interface TutanakData {
  id?: string | null;
  workplace_name: string;
  owner_name?: string | null;
  address?: string | null;
  tax_office?: string | null;
  tax_number?: string | null;
  phone?: string | null;
  license_number?: string | null;
  pos_device_number?: string | null;
  inspection_type: string;
  checklist: Record<string, boolean>;
  notes?: string | null;
  images?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  penalty_points?: number | null;
  recommended_action?: string | null;
  created_at?: string | null;
  inspectorName?: string | null;
  /** Başlıkta görünecek belediye adı (varsayılan: ALANYA BELEDİYE BAŞKANLIĞI) */
  municipalityName?: string;
  // İmzalar — data URL veya storage public URL olabilir
  inspectorSignatureUrl?: string | null;
  merchantSignatureUrl?: string | null;
  merchantSignedName?: string | null;
  /** İşyeri yetkilisi imzadan imtina ettiyse true */
  declined?: boolean;
  /** İmza tarihi (ISO) */
  signedAt?: string | null;
}

/** Basit HTML kaçışı — kullanıcı metinlerinin şablonu bozmasını engeller. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateTime(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function tutanakBelgeNo(data: TutanakData): string {
  return (data.id ? data.id.substring(0, 8) : Date.now().toString(36)).toUpperCase();
}

/** URL'i (fetch edilebiliyorsa) data URL'e çevirir; zaten data: ise aynen döner. PDF'te CORS taintini önler. */
async function toDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return url; // en kötü ihtimalle orijinal URL
  }
}

/** Tutanağın tam HTML belgesini üretir. embedImages: görselleri data URL'e gömer (PDF için). */
export async function buildInspectionReportHtml(
  data: TutanakData,
  opts: { embedImages?: boolean; autoPrint?: boolean } = {}
): Promise<string> {
  const category = ZABITA_CHECKLISTS.find((c) => c.id === data.inspection_type);
  const items = category?.items ?? [];

  const computed = calculatePenalty(data.inspection_type, data.checklist || {});
  const penaltyPoints = data.penalty_points ?? computed.penaltyPoints;
  const recommendedAction = data.recommended_action ?? computed.recommendedAction;

  const compliant = items.filter((it) => data.checklist?.[it.id] === true).length;
  const missing = items.length - compliant;

  const belgeNo = tutanakBelgeNo(data);
  const municipality = data.municipalityName || "ALANYA BELEDİYE BAŞKANLIĞI";
  const dateStr = fmtDateTime(data.created_at);

  const qrPayload =
    `T.C. ${municipality} - ZABITA MÜDÜRLÜĞÜ\n` +
    `İŞYERİ DENETİM TUTANAĞI\n` +
    `Belge No: ${belgeNo}\n` +
    `İşyeri: ${data.workplace_name}\n` +
    `Denetim Türü: ${category?.title ?? data.inspection_type}\n` +
    `Tarih: ${dateStr}\n` +
    `Ceza Puanı: ${penaltyPoints}\n` +
    `Yaptırım: ${recommendedAction}`;

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  } catch {
    qrDataUrl = "";
  }

  const hasGps = data.latitude != null && data.longitude != null;
  const mapsUrl = hasGps ? `https://www.google.com/maps?q=${data.latitude},${data.longitude}` : "";

  // Görselleri hazırla (PDF için data URL'e göm)
  let photos = (data.images ?? []).filter(Boolean) as string[];
  let inspectorSig = data.inspectorSignatureUrl ?? null;
  let merchantSig = data.merchantSignatureUrl ?? null;
  if (opts.embedImages) {
    photos = (await Promise.all(photos.map((u) => toDataUrl(u)))).filter(Boolean) as string[];
    inspectorSig = await toDataUrl(inspectorSig);
    merchantSig = await toDataUrl(merchantSig);
  }

  const infoRow = (label: string, value: unknown) =>
    `<tr><td class="k">${esc(label)}</td><td class="v">${esc(value) || "—"}</td></tr>`;

  const checklistRows = items
    .map((it, i) => {
      const ok = data.checklist?.[it.id] === true;
      return `<tr class="${ok ? "" : "miss"}">
        <td class="no">${i + 1}</td>
        <td class="lbl">${esc(it.label)}</td>
        <td class="mark ${ok ? "yes" : "no"}">${ok ? "VAR" : "YOK"}</td>
      </tr>`;
    })
    .join("");

  const photosHtml = photos.length
    ? `<div class="section"><div class="sec-title">Denetim Fotoğrafları (${photos.length})</div>
        <div class="photos">${photos.map((u) => `<img src="${esc(u)}" alt="denetim foto" />`).join("")}</div></div>`
    : "";

  const severe = penaltyPoints > 50;
  const warn = penaltyPoints > 0;
  const penaltyClass = severe ? "sev" : warn ? "warn" : "clean";

  const printScript = opts.autoPrint
    ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},400);});</script>`
    : "";

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8" />
<title>Denetim Tutanağı ${esc(belgeNo)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 10mm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; font-size: 11px; line-height: 1.4; background:#fff; }
  .doc { width: 190mm; margin: 0 auto; padding: 0; background:#fff; }
  .head { display: flex; align-items: center; gap: 14px; border-bottom: 3px double #1e3a5f; padding-bottom: 10px; }
  .crest { width: 58px; height: 58px; display: flex; align-items: center; justify-content: center; }
  .crest img { width: 100%; height: 100%; object-fit: contain; }
  .head .t { flex: 1; text-align: center; }
  .head .t .tc { font-size: 11px; letter-spacing: 2px; color: #555; }
  .head .t .m { font-size: 15px; font-weight: 800; color: #1e3a5f; }
  .head .t .d { font-size: 12px; font-weight: 700; margin-top: 2px; }
  .head .qr { width: 72px; text-align: center; }
  .head .qr img { width: 72px; height: 72px; }
  .head .qr span { font-size: 7px; color: #666; display: block; }
  .belge { display: flex; justify-content: space-between; font-size: 10px; margin: 8px 0 5px; color: #333; }
  .belge b { color: #1e3a5f; }
  table { width: 100%; border-collapse: collapse; }
  .info td { padding: 4px 7px; border: 1px solid #cbd5e1; vertical-align: top; }
  .info td.k { background: #f1f5f9; font-weight: 700; width: 26%; white-space: nowrap; }
  .info td.v { width: 24%; }
  .section { margin-top: 12px; page-break-inside: auto; }
  .sec-title { background: #1e3a5f; color: #fff; font-weight: 700; font-size: 11px; padding: 5px 8px; border-radius: 3px 3px 0 0; }
  .cl { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .cl td { border: 1px solid #d7dee7; padding: 4px 7px; vertical-align: middle; }
  .cl td.no { width: 28px; text-align: center; color: #64748b; }
  .cl td.lbl { word-wrap: break-word; }
  .cl td.mark { width: 52px; text-align: center; font-weight: 800; font-size: 10px; }
  .cl td.mark.yes { color: #15803d; }
  .cl td.mark.no { color: #b91c1c; }
  .cl tr.miss td.lbl { color: #b91c1c; font-weight: 600; }
  .cl tr.miss { background: #fef2f2; }
  .cl tr { page-break-inside: avoid; }
  .grid2 { display: flex; gap: 10px; margin-top: 12px; }
  .penalty { flex: 1; border: 1.5px solid; border-radius: 5px; padding: 9px 11px; }
  .penalty.sev { border-color: #b91c1c; background: #fef2f2; }
  .penalty.warn { border-color: #d97706; background: #fffbeb; }
  .penalty.clean { border-color: #15803d; background: #f0fdf4; }
  .penalty .h { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
  .penalty .big { font-size: 20px; font-weight: 800; }
  .penalty .act { font-weight: 700; margin-top: 3px; }
  .penalty.sev .big, .penalty.sev .act { color: #b91c1c; }
  .penalty.warn .big, .penalty.warn .act { color: #b45309; }
  .penalty.clean .big, .penalty.clean .act { color: #15803d; }
  .meta { flex: 1; border: 1px solid #cbd5e1; border-radius: 5px; padding: 9px 11px; font-size: 10px; }
  .meta div { margin-bottom: 4px; }
  .notes { margin-top: 10px; border: 1px dashed #94a3b8; border-radius: 5px; padding: 7px 11px; font-size: 10px; background: #f8fafc; }
  .photos { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border: 1px solid #d7dee7; border-top: none; }
  .photos img { width: 84px; height: 84px; object-fit: cover; border: 1px solid #cbd5e1; border-radius: 3px; }
  .signs { display: flex; gap: 40px; margin-top: 20px; }
  .signs .s { flex: 1; text-align: center; }
  .signs .sig-img { height: 46px; margin-bottom: 2px; }
  .signs .sig-img img { max-height: 46px; max-width: 90%; }
  .signs .declined { height: 46px; display: flex; align-items: center; justify-content: center; color: #b91c1c; font-weight: 700; font-size: 11px; border: 1px dashed #b91c1c; border-radius: 4px; margin-bottom: 2px; }
  .signs .blank { height: 46px; }
  .signs .line { border-top: 1px solid #333; padding-top: 4px; font-size: 10px; }
  .signs .who { font-size: 9px; color: #444; }
  .foot { margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 8px; color: #777; text-align: center; }
  a { color: #1e3a5f; }
</style></head>
<body>
  <div class="doc">
    <div class="head">
      <div class="crest"><img src="${ALANYA_LOGO_DATA_URL}" alt="Alanya Belediyesi" /></div>
      <div class="t">
        <div class="tc">T.C.</div>
        <div class="m">${esc(municipality)}</div>
        <div class="d">ZABITA MÜDÜRLÜĞÜ — İŞYERİ DENETİM TUTANAĞI</div>
      </div>
      <div class="qr">
        ${qrDataUrl ? `<img src="${qrDataUrl}" alt="doğrulama karekodu" /><span>Doğrulama</span>` : ""}
      </div>
    </div>

    <div class="belge">
      <span>Belge No: <b>${esc(belgeNo)}</b></span>
      ${data.signedAt ? `<span>İmza Tarihi: <b>${esc(fmtDateTime(data.signedAt))}</b></span>` : ""}
      <span>Denetim Tarihi: <b>${esc(dateStr)}</b></span>
    </div>

    <table class="info">
      <tr>${infoRow("İşyeri Ünvanı", data.workplace_name)}${infoRow("Denetim Türü", category?.title ?? data.inspection_type)}</tr>
      <tr>${infoRow("Sahibi / Sorumlusu", data.owner_name)}${infoRow("Telefon", data.phone)}</tr>
      <tr>${infoRow("Vergi Dairesi", data.tax_office)}${infoRow("Vergi No", data.tax_number)}</tr>
      <tr>${infoRow("Ruhsat No", data.license_number)}${infoRow("POS Cihaz No", data.pos_device_number)}</tr>
      <tr><td class="k">Adres</td><td class="v" colspan="3">${esc(data.address) || "—"}</td></tr>
    </table>

    <div class="section">
      <div class="sec-title">Denetim Maddeleri — ${esc(compliant)} Uygun / ${esc(missing)} Eksik (Toplam ${esc(items.length)})</div>
      <table class="cl">${checklistRows}</table>
    </div>

    <div class="grid2">
      <div class="penalty ${penaltyClass}">
        <div class="h">Otomatik Ceza Puanı</div>
        <div class="big">${esc(penaltyPoints)} Puan</div>
        <div class="act">Tavsiye Edilen Yaptırım: ${esc(recommendedAction)}</div>
      </div>
      <div class="meta">
        <div><b>Denetleyen:</b> ${esc(data.inspectorName) || "Zabıta Görevlisi"}</div>
        <div><b>GPS Konumu:</b> ${hasGps ? `${esc(data.latitude)}, ${esc(data.longitude)}` : "Alınmadı"}</div>
        ${hasGps ? `<div><b>Harita:</b> <a href="${esc(mapsUrl)}">${esc(mapsUrl)}</a></div>` : ""}
        <div><b>Eksik Madde Sayısı:</b> ${esc(missing)}</div>
      </div>
    </div>

    ${data.notes ? `<div class="notes"><b>Ek Notlar / Gözlemler:</b> ${esc(data.notes)}</div>` : ""}

    ${photosHtml}

    <div class="signs">
      <div class="s">
        ${inspectorSig
          ? `<div class="sig-img"><img src="${esc(inspectorSig)}" alt="imza" /></div>`
          : `<div class="blank"></div>`}
        <div class="line">Denetleyen Zabıta Görevlisi<br/><span class="who">${esc(data.inspectorName) || "(Ad Soyad / İmza)"}</span></div>
      </div>
      <div class="s">
        ${data.declined
          ? `<div class="declined">İMZADAN İMTİNA EDİLDİ</div>`
          : merchantSig
          ? `<div class="sig-img"><img src="${esc(merchantSig)}" alt="imza" /></div>`
          : `<div class="blank"></div>`}
        <div class="line">İşyeri Sahibi / Yetkilisi<br/><span class="who">${esc(data.merchantSignedName) || "(Ad Soyad / İmza)"}</span></div>
      </div>
    </div>

    <div class="foot">
      Bu tutanak Alanya Belediyesi Yapay Zeka Destekli Zabıta Denetim Sistemi tarafından elektronik olarak üretilmiştir.
      Karekod ile belge bilgileri doğrulanabilir. İşbu tutanak 5326 sayılı Kabahatler Kanunu ve ilgili belediye zabıtası yönetmeliği kapsamında düzenlenmiştir.
    </div>
  </div>
  ${printScript}
</body></html>`;
}

/**
 * Tutanağı yeni pencerede açar ve yazdırma (PDF kaydet) diyaloğunu tetikler.
 */
export async function openInspectionReport(data: TutanakData): Promise<void> {
  const html = await buildInspectionReportHtml(data, { embedImages: false, autoPrint: true });
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    throw new Error("Yazdırma penceresi açılamadı. Tarayıcı açılır pencere (popup) engelini kaldırın.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/**
 * Tutanağı gerçek bir PDF dosyası (Blob) olarak üretir — arşivleme ve indirme için.
 * html2canvas ile birebir HTML görünümünü rasterize edip jsPDF ile A4 (çok sayfalı) PDF'e döker.
 */
export async function generateInspectionPdfBlob(data: TutanakData): Promise<{ blob: Blob; belgeNo: string }> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const belgeNo = tutanakBelgeNo(data);
  const html = await buildInspectionReportHtml(data, { embedImages: true, autoPrint: false });

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "800px";
  iframe.style.height = "1200px";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();

    // Belge + görsellerin yüklenmesini bekle
    await new Promise<void>((resolve) => {
      if (doc.readyState === "complete") resolve();
      else iframe.onload = () => resolve();
    });
    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); })
      )
    );
    await new Promise((r) => setTimeout(r, 120));

    const target = (doc.querySelector(".doc") as HTMLElement) || doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 800,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    // Her kenardan 1 cm boşluk; içerik tek A4 sayfaya sığacak şekilde oranı korunarak ölçeklenir
    const margin = 10;
    const availW = 210 - margin * 2; // 190mm
    const availH = 297 - margin * 2; // 277mm
    const ratio = canvas.width / canvas.height;

    let w = availW;
    let h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    const x = margin + (availW - w) / 2;
    const y = margin;

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    pdf.addImage(imgData, "JPEG", x, y, w, h);

    return { blob: pdf.output("blob") as Blob, belgeNo };
  } finally {
    document.body.removeChild(iframe);
  }
}

/** Bir Blob'u indirir. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Uzak bir URL'deki (arşivlenmiş) PDF'i indirir. */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const blob = await res.blob();
    downloadBlob(blob, filename);
  } catch {
    window.open(url, "_blank");
  }
}
