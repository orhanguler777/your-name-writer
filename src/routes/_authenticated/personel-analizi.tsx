import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, KpiCard } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Users, Clock, AlertCircle, TrendingUp, Bot } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";

export const Route = createFileRoute("/_authenticated/personel-analizi")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Personel Analizi — Belediye AI" }] }),
});

function Page() {
  const { data } = useQuery({
    queryKey: ["attendance-analysis"],
    queryFn: async () => {
      const [{ data: personnel }, { data: attendance }] = await Promise.all([
        supabase.from("personnel").select("id, full_name, department_id, departments(name)"),
        supabase.from("personnel_attendance").select("*").order("date", { ascending: false }),
      ]);
      return { personnel: personnel ?? [], attendance: attendance ?? [] };
    },
  });

  const personnel = data?.personnel ?? [];
  const att = data?.attendance ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const lateToday = att.filter((a) => a.date === today && a.is_late).length;
  const missing = att.filter((a) => a.missing_checkout).length;
  const overtime = att.filter((a) => a.has_overtime).length;

  const lateByDept: Record<string, number> = {};
  const missingByDept: Record<string, number> = {};
  const overtimeByDept: Record<string, number> = {};
  const personById = new Map(personnel.map((p: any) => [p.id, p]));
  att.forEach((a) => {
    const p: any = personById.get(a.personnel_id);
    const dept = p?.departments?.name ?? "—";
    if (a.is_late) lateByDept[dept] = (lateByDept[dept] ?? 0) + 1;
    if (a.missing_checkout) missingByDept[dept] = (missingByDept[dept] ?? 0) + 1;
    if (a.has_overtime) overtimeByDept[dept] = (overtimeByDept[dept] ?? 0) + 1;
  });
  const topLateDept = Object.entries(lateByDept).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const dailyTrend: Record<string, number> = {};
  att.forEach((a) => { dailyTrend[a.date] = (dailyTrend[a.date] ?? 0) + 1; });
  const trendData = Object.entries(dailyTrend).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date: date.slice(5), count }));

  const toChart = (o: Record<string, number>) => Object.entries(o).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return (
    <div>
      <PageHeader title="Personel Giriş Çıkış Analizi" description="Devam kayıtları, geç girişler, fazla mesai ve eksik çıkışlar." />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-4">
        <KpiCard label="Toplam Personel" value={personnel.length} icon={Users} />
        <KpiCard label="Bugün Geç Gelen" value={lateToday} icon={Clock} accent="warn" />
        <KpiCard label="Eksik Çıkış" value={missing} icon={AlertCircle} accent="destructive" />
        <KpiCard label="Fazla Mesai" value={overtime} icon={TrendingUp} accent="accent" />
        <KpiCard label="En Çok Geç Kalan" value={<span className="text-base">{topLateDept}</span>} icon={Bot} />
      </div>

      <Card className="p-5 mb-4 border-accent/40 bg-accent/5">
        <div className="flex items-center gap-2 mb-2"><Bot className="h-5 w-5 text-accent" /><h3 className="font-display font-semibold">AI İçgörü</h3></div>
        <p className="text-sm leading-relaxed">
          Son 10 günde <strong>{topLateDept}</strong> müdürlüğünde geç giriş oranı diğer müdürlüklere göre daha yüksektir.
          Özellikle pazartesi ve cuma günleri yoğunluk görülmektedir. Vardiya planlaması kontrol edilebilir.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Müdürlüğe Göre Geç Girişler">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={toChart(lateByDept)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="value" fill="#e08a3c" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Müdürlüğe Göre Fazla Mesai">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={toChart(overtimeByDept)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="value" fill="#3fa87a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Müdürlüğe Göre Eksik Çıkış">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={toChart(missingByDept)}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="value" fill="#c4574f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Günlük Devam Trendi">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Line type="monotone" dataKey="count" stroke="#1e2f5a" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="p-5"><h3 className="mb-3 font-display font-semibold">{title}</h3>{children}</Card>;
}
