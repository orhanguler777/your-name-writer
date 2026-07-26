import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicInspection } from "@/lib/publicInspection.functions";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import { BadgeCheck, XCircle, Building2, Loader2, PenLine } from "lucide-react";

export const Route = createFileRoute("/dogrula/$id")({
  ssr: false,
  component: TutanakVerifyPage,
  head: () => ({ meta: [{ title: "Tutanak Doğrulama — Alanya Belediyesi" }] }),
});

const fmtDateTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString("tr-TR")} ${new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

function TutanakVerifyPage() {
  const { id } = Route.useParams();
  const fetchInspection = useServerFn(getPublicInspection);

  const { data, isLoading } = useQuery({
    queryKey: ["public-inspection", id],
    queryFn: () => fetchInspection({ data: { id } }),
    retry: false,
  });

  const typeTitle = (t?: string | null) => ZABITA_CHECKLISTS.find((c) => c.id === t)?.title || t || "—";

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="text-left leading-tight">
            <div className="font-display font-bold">Alanya Belediyesi</div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Tutanak Doğrulama
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border bg-card p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Belge sorgulanıyor...
          </div>
        ) : !data?.found ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <XCircle className="mx-auto mb-3 h-8 w-8 text-destructive/70" />
            <h1 className="font-semibold">Belge doğrulanamadı</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Bu karekoda ait bir denetim tutanağı sistemde bulunamadı.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/10 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <BadgeCheck className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                  Belge doğrulandı
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {data.inspection.belgeNo}
                </div>
              </div>
            </div>

            <dl className="divide-y text-sm">
              <Row label="İşyeri" value={data.inspection.workplaceName} />
              <Row label="Denetim Türü" value={typeTitle(data.inspection.inspectionType)} />
              <Row label="Denetim Tarihi" value={fmtDateTime(data.inspection.createdAt)} />
              {data.inspection.address && <Row label="Adres" value={data.inspection.address} />}
              <Row
                label="Sonuç"
                value={
                  data.inspection.penaltyPoints > 0
                    ? `${data.inspection.penaltyPoints} ceza puanı — ${data.inspection.recommendedAction ?? "—"}`
                    : "Uygun — eksik tespit edilmedi"
                }
                highlight={data.inspection.penaltyPoints > 0}
              />
            </dl>

            {data.inspection.signedAt && (
              <div className="flex items-center gap-1.5 border-t bg-muted/30 px-5 py-3 text-[11px] text-muted-foreground">
                <PenLine className="h-3 w-3 shrink-0" />
                {fmtDateTime(data.inspection.signedAt)} tarihinde imzalanarak arşivlenmiştir.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex gap-3 px-5 py-3">
      <dt className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-words ${highlight ? "font-semibold text-destructive" : "font-medium"}`}>
        {value}
      </dd>
    </div>
  );
}
