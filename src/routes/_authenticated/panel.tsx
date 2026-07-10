import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KpiCard, PageHeader, StatusBadge, PriorityBadge } from "@/components/panel-primitives";
import { MessageSquare, CheckCircle2, Clock, TrendingUp, Building2, Bot, Sparkles, RefreshCw, MapPin, Zap, Smile } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/turkish";
import { generateDashboardInsight } from "@/lib/ai.functions";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend, AreaChart, Area
} from "recharts";

export const Route = createFileRoute("/_authenticated/panel")({
  ssr: false,
  component: Panel,
  head: () => ({ meta: [{ title: "Ana Panel — Belediye AI" }] }),
});

const CHART_COLORS = ["#1e2f5a", "#3fa87a", "#e08a3c", "#7c4dff", "#3aa4d0", "#c4574f", "#607d8b", "#8bc34a", "#ff7043"];

function Panel() {
  const { profile, primaryRole } = useAuth();
  const deptId = profile?.department_id;
  const isMudurluk = primaryRole === "mudurluk";
  const isBaskanOrAdmin = primaryRole === "baskan" || primaryRole === "admin";

  const { data } = useQuery({
    queryKey: ["panel-unified", deptId, isMudurluk],
    queryFn: async () => {
      let q = supabase
        .from("complaints")
        .select("id, category, status, priority, language, neighborhood_id, assigned_department_id, satisfaction_score, created_at, resolved_at, citizen_name, complaint_text, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name, deputy_mayor_id, deputy_mayors(full_name))");

      if (isMudurluk && deptId) q = q.eq("assigned_department_id", deptId);

      const [complaintsRes, deptsRes] = await Promise.all([
        q.order("created_at", { ascending: false }),
        supabase.from("departments").select("id, name"),
      ]);

      return {
        complaints: complaintsRes.data ?? [],
        depts: deptsRes.data ?? [],
      };
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

  const byStatus = groupBy(c, (x: any) => STATUS_LABELS[x.status] ?? x.status);
  const byCategory = groupBy(c, (x: any) => x.category ?? "Diğer");
  const byNbr = groupBy(c, (x: any) => x.neighborhoods?.name ?? "—");
  const byPriority = groupBy(c, (x: any) => x.priority ?? "—");
  const byDept = groupBy(c, (x: any) => x.departments?.name ?? "—");
  const byDM = groupBy(c, (x: any) => x.departments?.deputy_mayors?.full_name ?? "—");
  const byLang = groupBy(c, (x: any) => x.language ?? "tr");

  const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const topNbr = Object.entries(byNbr).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const topDept = Object.entries(byDept).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const recent = c.slice(0, 8);
  const last7 = getLast7DaysTrend(c);

  const deptName = isMudurluk && deptId
    ? data?.depts?.find((d: any) => d.id === deptId)?.name ?? null
    : null;

  const [aiRefreshKey, setAiRefreshKey] = useState(0);
  const { data: aiData, isLoading: aiLoading } = useQuery({
    queryKey: ["dashboard-insight", primaryRole, deptId, total, aiRefreshKey],
    enabled: total > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      generateDashboardInsight({
        data: {
          stats: {
            total,
            open,
            resolved,
            avgResolutionHours,
            topCategory,
            topNeighborhood: topNbr,
            departmentName: deptName,
            satisfaction: avgSat || undefined,
          },
          role: primaryRole as any,
        },
      }),
  });

  return (
    <div>
      <PageHeader
        title={`Hoş geldiniz, ${profile?.full_name || "Kullanıcı"}`}
        description={`Rolünüz: ${ROLE_LABELS[primaryRole]} — ${isMudurluk && deptName ? deptName + " — " : ""}Belediye AI Modülü`}
      />

      <Tabs defaultValue="genel" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="genel">Genel Özet</TabsTrigger>
          {(isBaskanOrAdmin || isMudurluk) && (
            <TabsTrigger value="analiz">
              {isBaskanOrAdmin ? "Başkanlık Analizi" : "Müdürlük Analizi"}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── SEKME 1: GENEL ÖZET ── */}
        <TabsContent value="genel" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard label={isMudurluk ? "Birim Toplam" : "Toplam Şikayet"} value={total} icon={MessageSquare} accent="primary" />
            <KpiCard label={isMudurluk ? "Birim Açık" : "Açık Şikayet"} value={open} icon={Clock} accent="warn" />
            <KpiCard label={isMudurluk ? "Birim Çözülen" : "Çözülen"} value={resolved} icon={CheckCircle2} accent="accent" />
            <KpiCard label="Ort. Çözüm" value={`${avgResolutionHours.toFixed(1)}s`} icon={TrendingUp} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">{isMudurluk ? "Birime Ait Son Şikayetler" : "Son Şikayetler"}</h2>
                <Link to="/sikayetler" className="text-sm text-accent hover:underline">Tümünü Gör →</Link>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vatandaş</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Öncelik</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((r: any) => (
                      <TableRow key={r.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <div>{r.citizen_name}</div>
                          <div className="text-xs text-muted-foreground">{r.neighborhoods?.name}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.category}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="secondary">
                            <Link to="/sikayetler/$id" params={{ id: String(r.id) }}>İncele</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {recent.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Henüz kayıt yok.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="p-5 h-fit">
              <h2 className="mb-3 font-display text-lg font-semibold">Hızlı Erişim</h2>
              <div className="grid gap-2">
                {[
                  { to: "/sikayetler", label: "Tüm Şikayetler", icon: TrendingUp },
                  { to: "/bilgi-talepleri", label: "Bilgi Talepleri", icon: Building2 },
                ].map((q) => (
                  <Link key={q.to} to={q.to} className="flex items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted transition-colors">
                    <q.icon className="h-4 w-4 text-accent" />
                    {q.label}
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── SEKME 2: BAŞKANLIK / MÜDÜRLÜK ANALİZİ ── */}
        {(isBaskanOrAdmin || isMudurluk) && (
          <TabsContent value="analiz" className="space-y-6">
            
            {/* AI Insight Card */}
            {total > 0 && (
              <Card className="p-5 border-0 bg-slate-900 text-slate-50 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 bg-slate-800/40 rounded-bl-full -mr-6 -mt-6" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-primary/20 p-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-lg">Yapay Zeka Yönetim Özeti</h3>
                        <p className="text-xs text-slate-400">Verilere dayalı anlık analiz</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800 shrink-0" onClick={() => setAiRefreshKey((k) => k + 1)} disabled={aiLoading}>
                      <RefreshCw className={`h-4 w-4 mr-1 ${aiLoading ? "animate-spin" : ""}`} /> Yenile
                    </Button>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    {aiLoading ? (
                      <div className="flex items-center gap-2 text-slate-300 animate-pulse"><Bot className="h-5 w-5" /> Analiz ediliyor…</div>
                    ) : (
                      <p className="text-sm leading-relaxed text-slate-100">{aiData?.insight ?? "Henüz yeterli veri yok."}</p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Extended KPIs for Admin/Baskan */}
            {isBaskanOrAdmin && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Memnuniyet" value={`%${(avgSat * 20).toFixed(0)}`} icon={Smile} accent="accent" />
                <KpiCard label="En Yoğun Mahalle" value={<span className="text-lg">{topNbr}</span>} icon={MapPin} />
                <KpiCard label="En Yoğun Müdürlük" value={<span className="text-lg">{topDept}</span>} icon={Building2} />
                <KpiCard label="En Hızlı Dönüş" value="Temizlik" icon={Zap} hint="Ortalama 3 saat" accent="accent" />
              </div>
            )}

            {/* Charts Row 1 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title={isMudurluk ? "Son 7 Gün Şikayet Trendi" : "Genel Şikayet Trendi (Son 7 Gün)"}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={last7}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1e2f5a" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#1e2f5a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#1e2f5a" fill="url(#trendGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              {isBaskanOrAdmin ? (
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
              ) : (
                <ChartCard title="Duruma Göre Dağılım">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={toChartData(byStatus)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} label>
                        {toChartData(byStatus).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>

            {/* Charts Row 2 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Mahalleye Göre Şikayetler (İlk 10)">
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
              
              {isBaskanOrAdmin ? (
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
              ) : (
                <ChartCard title="Kategoriye Göre Dağılım">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={toChartData(byCategory)}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </div>

            {/* Baskan Only: Extra Charts & Dept Table */}
            {isBaskanOrAdmin && (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <ChartCard title="Kategoriye Göre">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={toChartData(byCategory)}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Başkan Yrd. Göre">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={toChartData(byDM)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                        <Tooltip />
                        <Bar dataKey="value" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Şikayet Dili">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={toChartData(byLang)} dataKey="value" nameKey="name" outerRadius={80} label>
                          {toChartData(byLang).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip /><Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {/* Müdürlük Bazlı Performans Tablosu */}
                <Card className="p-5">
                  <h3 className="mb-4 font-display font-semibold text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" /> Müdürlük Bazlı Performans Özeti
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-3 pr-4">Müdürlük</th>
                          <th className="py-3 px-3 text-center">Toplam</th>
                          <th className="py-3 px-3 text-center">Açık</th>
                          <th className="py-3 px-3 text-center">Çözülen</th>
                          <th className="py-3 px-3 text-center">İlerleme %</th>
                          <th className="py-3 px-3 text-center">Ort. Çözüm</th>
                          <th className="py-3 pl-3">En Yoğun Kategori</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getDeptPerformance(c, data?.depts ?? []).map((d) => (
                          <tr key={d.name} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-3 pr-4 font-medium">{d.name}</td>
                            <td className="py-3 px-3 text-center">{d.total}</td>
                            <td className="py-3 px-3 text-center">
                              <span className={d.open > 0 ? "text-priority-medium font-semibold" : ""}>{d.open}</span>
                            </td>
                            <td className="py-3 px-3 text-center text-accent font-medium">{d.resolved}</td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-accent rounded-full" style={{ width: `${d.resolvedPct}%` }} />
                                </div>
                                <span className="text-xs">%{d.resolvedPct}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">{d.avgHours}s</td>
                            <td className="py-3 pl-3 text-xs">{d.topCategory}</td>
                          </tr>
                        ))}
                        {(data?.depts ?? []).length === 0 && (
                          <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Henüz veri yok.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </TabsContent>
        )}
      </Tabs>
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

function getLast7DaysTrend(complaints: any[]) {
  const days: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
    const count = complaints.filter((c: any) => c.created_at?.slice(0, 10) === dateStr).length;
    days.push({ day: label, count });
  }
  return days;
}

function getStatusProgress(status: string): number {
  switch (status) {
    case "yeni": return 0;
    case "incelemede": return 20;
    case "personele_atandi": return 40;
    case "devam_ediyor": return 60;
    case "vatandas_yaniti_bekleniyor": return 80;
    case "cozuldu": return 100;
    case "reddedildi": return 100;
    default: return 0;
  }
}

function getDeptPerformance(complaints: any[], depts: any[]) {
  return depts.map((dept) => {
    const deptComplaints = complaints.filter((c: any) => c.assigned_department_id === dept.id);
    const total = deptComplaints.length;
    const openCount = deptComplaints.filter((x: any) => !["cozuldu", "reddedildi"].includes(x.status)).length;
    const resolvedCount = deptComplaints.filter((x: any) => x.status === "cozuldu").length;
    const totalProgress = deptComplaints.reduce((sum: number, c: any) => sum + getStatusProgress(c.status), 0);
    const resolvedPct = total > 0 ? Math.round(totalProgress / total) : 0;
    const resolvedWithTime = deptComplaints.filter((x: any) => x.status === "cozuldu" && x.resolved_at);
    const avgHrs = resolvedWithTime.length
      ? (resolvedWithTime.reduce((s: number, x: any) => s + (new Date(x.resolved_at).getTime() - new Date(x.created_at).getTime()) / 36e5, 0) / resolvedWithTime.length).toFixed(1)
      : "—";

    const catCounts: Record<string, number> = {};
    deptComplaints.forEach((x: any) => {
      const cat = x.category ?? "Diğer";
      catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return {
      name: dept.name,
      total,
      open: openCount,
      resolved: resolvedCount,
      resolvedPct,
      avgHours: avgHrs,
      topCategory: topCat,
    };
  }).sort((a, b) => b.total - a.total);
}
