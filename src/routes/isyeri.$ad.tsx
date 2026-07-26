import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicWorkplace } from "@/lib/publicInspection.functions";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import {
  ShieldCheck,
  AlertTriangle,
  CalendarClock,
  MapPin,
  Building2,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/isyeri/$ad")({
  ssr: false,
  component: PublicWorkplacePage,
  head: () => ({ meta: [{ title: "İşyeri Denetim Durumu — Alanya Belediyesi" }] }),
});

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

function PublicWorkplacePage() {
  const { ad } = Route.useParams();
  const fetchWorkplace = useServerFn(getPublicWorkplace);

  const { data, isLoading } = useQuery({
    queryKey: ["public-workplace", ad],
    queryFn: () => fetchWorkplace({ data: { name: decodeURIComponent(ad) } }),
  });

  const typeTitle = (id?: string | null) =>
    ZABITA_CHECKLISTS.find((c) => c.id === id)?.title || id || "—";

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center justify-center gap-2 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="text-left leading-tight">
            <div className="font-display font-bold">Alanya Belediyesi</div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Zabıta Müdürlüğü
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border bg-card p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Sorgulanıyor...
          </div>
        ) : !data?.found ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <h1 className="font-semibold">Kayıt bulunamadı</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <strong className="break-words">{decodeURIComponent(ad)}</strong> adına kayıtlı bir
              zabıta denetimi bulunamadı. Karekod güncel olmayabilir.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border bg-card">
              <div
                className={`flex items-center gap-3 p-5 ${
                  data.workplace.compliant
                    ? "bg-emerald-500/10 border-b border-emerald-500/20"
                    : "bg-amber-500/10 border-b border-amber-500/20"
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white ${
                    data.workplace.compliant ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                >
                  {data.workplace.compliant ? (
                    <ShieldCheck className="h-6 w-6" />
                  ) : (
                    <AlertTriangle className="h-6 w-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-sm font-bold ${
                      data.workplace.compliant
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    {data.workplace.compliant
                      ? "Son denetimde uygun bulundu"
                      : "Son denetimde eksik tespit edildi"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(data.workplace.lastInspectionAt)} tarihli denetim
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-5">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    İşyeri
                  </div>
                  <div className="font-semibold break-words">{data.workplace.name}</div>
                </div>

                {data.workplace.address && (
                  <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="break-words">{data.workplace.address}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Denetim Türü
                    </div>
                    <div className="font-medium">
                      {typeTitle(data.workplace.lastInspectionType)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Toplam Denetim
                    </div>
                    <div className="font-medium">{data.workplace.totalInspections}</div>
                  </div>
                </div>

                {data.workplace.followupPending && data.workplace.followupDate && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                    <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Tespit edilen eksikler için{" "}
                      <strong>{fmtDate(data.workplace.followupDate)}</strong> tarihine kadar süre
                      verilmiştir.
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="px-2 text-center text-[11px] leading-relaxed text-muted-foreground">
              Bu sayfa Alanya Belediyesi Zabıta Müdürlüğü denetim kayıtlarından otomatik
              üretilmiştir. Şikayet ve bildirimleriniz için belediyemizin WhatsApp hattını
              kullanabilirsiniz.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
