import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, KpiCard } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { MessageSquare, Clock, CheckCircle2, TrendingUp, MapPin, Building2, Zap, Smile } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid } from "recharts";
import { STATUS_LABELS } from "@/lib/turkish";

export const Route = createFileRoute("/_authenticated/baskan")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Başkan Paneli — Belediye AI" }] }),
});

const CHART_COLORS = ["#1e2f5a", "#3fa87a", "#e08a3c", "#7c4dff", "#3aa4d0", "#c4574f", "#607d8b"];

function Page() {
  const { data } = useQuery({
    queryKey: ["baskan-panel"],
    queryFn: async () => {
      const [complaints, depts, nbrs, dm, msgs] = await Promise.all([
        supabase.from("complaints").select("id, category, status, priority, language, neighborhood_id, assigned_department_id, satisfaction_score, created_at, resolved_at, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name, deputy_mayor_id, deputy_mayors(full_name))"),
        supabase.from("departments").select("id, name"),
        supabase.from("neighborhoods").select("id, name"),
        supabase.from("deputy_mayors").select("id, full_name"),
        supabase.from("mayor_daily_messages").select("*").order("created_at", { ascending: false }).limit(3),
      ]);
      return { complaints: complaints.data ?? [], depts: depts.data ?? [], nbrs: nbrs.data ?? [], dm: dm.data ?? [], msgs: msgs.data ?? [] };
    },
  });

  const c = data?.complaints ?? [];
  const total = c.length;
  const open = c.filter((x: any) => !["cozuldu", "reddedildi"].includes(x.status)).length;
  const resolved = c.filter((x: any) => x.status === "cozuldu").length;
  const resolvedRes = c.filter((x: any) => x.status === "cozuldu" && x.resolved_at);
  const avgResolutionHours = resolvedRes.length
    ? resolvedRes.reduce((sum: number, x: any) => sum + (new Date(x.resolved_at).getTime() - new Date(x.created_at).getTime()) / 36e5, 0) / resolvedRes.length
    : 0;
  const satisfaction = c.filter((x: any) => x.satisfaction_score).map((x: any) => x.satisfaction_score);
  const avgSat = satisfaction.length ? (satisfaction.reduce((a: number, b: number) => a + b, 0) / satisfaction.length) : 0;

  const byDept = groupBy(c, (x: any) => x.departments?.name ?? "—");
  const byNbr = groupBy(c, (x: any) => x.neighborhoods?.name ?? "—");
  const byStatus = groupBy(c, (x: any) => STATUS_LABELS[x.status] ?? x.status);
  const byCategory = groupBy(c, (x: any) => x.category);
  const byLang = groupBy(c, (x: any) => x.language);
  const byDM = groupBy(c, (x: any) => x.departments?.deputy_mayors?.full_name ?? "—");

  const topNbr = Object.entries(byNbr).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const topDept = Object.entries(byDept).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const summary = `Şu ana kadar toplam ${total} şikayet alınmıştır. En yoğun şikayet ${topDept}'ne gelmiştir. ${topNbr} bölgesinde artış görülmektedir. Ortalama çözüm süresi ${avgResolutionHours.toFixed(1)} saattir. Belediye memnuniyet oranı %${(avgSat * 20).toFixed(0)}.`;

  return (
    <div>
      <PageHeader title="Başkan Paneli" description="Belediyenizin gerçek zamanlı yönetim özeti ve analitikleri." />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
        <KpiCard label="Toplam Şikayet" value={total} icon={MessageSquare} accent="primary" />
        <KpiCard label="Açık Şikayet" value={open} icon={Clock} accent="warn" />
        <KpiCard label="Çözülen" value={resolved} icon={CheckCircle2} accent="accent" />
        <KpiCard label="Ortalama Çözüm" value={`${avgResolutionHours.toFixed(1)}s`} icon={TrendingUp} />
        <KpiCard label="Memnuniyet" value={`%${(avgSat * 20).toFixed(0)}`} icon={Smile} accent="accent" />
        <KpiCard label="En Yoğun Mahalle" value={<span className="text-lg">{topNbr}</span>} icon={MapPin} />
        <KpiCard label="En Yoğun Müdürlük" value={<span className="text-lg">{topDept}</span>} icon={Building2} />
        <KpiCard label="En Hızlı Dönüş" value="Temizlik" icon={Zap} hint="Ortalama 3 saat" accent="accent" />
      </div>

      <Card className="p-5 mb-4 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="font-display font-semibold">Başkan İçin Günlük Özet</h3>
        </div>
        <p className="text-sm leading-relaxed">{summary}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Müdürlüğe Göre Şikayetler">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={toChartData(byDept)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Mahalleye Göre Şikayetler">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={toChartData(byNbr).slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Duruma Göre Şikayetler">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={toChartData(byStatus)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} label>
                {toChartData(byStatus).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Kategoriye Göre Şikayetler">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={toChartData(byCategory)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Başkan Yardımcısına Göre Şikayetler">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={toChartData(byDM)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
              <Tooltip />
              <Bar dataKey="value" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Şikayet Dili Dağılımı">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={toChartData(byLang)} dataKey="value" nameKey="name" outerRadius={100} label>
                {toChartData(byLang).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-display font-semibold">{title}</h3>
      {children}
    </Card>
  );
}

function groupBy<T>(arr: T[], key: (x: T) => string): Record<string, number> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
function toChartData(obj: Record<string, number>) {
  return Object.entries(obj).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
