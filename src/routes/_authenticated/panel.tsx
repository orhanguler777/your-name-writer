import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { KpiCard, PageHeader, StatusBadge, PriorityBadge } from "@/components/panel-primitives";
import { MessageSquare, CheckCircle2, Clock, TrendingUp, Building2, Bot, Sparkles, RefreshCw, MapPin, Zap, Smile, AlertTriangle, CalendarClock, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@tanstack/react-start";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/turkish";
import { generateDashboardInsight, getBotSettings } from "@/lib/ai.functions";
import { AlanyaMap } from "@/components/AlanyaMap";
import { ZabitaInspectionAnalytics } from "@/components/ZabitaInspectionAnalytics";
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
  const isMudurluk = primaryRole === "mudurluk" || primaryRole === "mudur";
  const isBaskanOrAdmin = primaryRole === "baskan" || primaryRole === "baskan_yardimcisi" || primaryRole === "superuser" || primaryRole === "admin";
  const isZabitaMemuru = primaryRole === "zabita_memuru";
  const isZabitaMudur = primaryRole === "mudur" || (primaryRole === "mudurluk" && profile?.departments?.name?.toLowerCase().includes("zabıta"));
  const canSeeAnalytics = isBaskanOrAdmin || isMudurluk || isZabitaMudur;

  const getSettings = useServerFn(getBotSettings);
  const { data: botSettings } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => getSettings(),
  });

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

  // Ranked lists for AI insight
  const rankedNbrs = Object.entries(byNbr).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count, pct: total > 0 ? (count / total) * 100 : 0 }));
  const rankedCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count, pct: total > 0 ? (count / total) * 100 : 0 }));
  const rankedDepts = Object.entries(byDept).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count, pct: total > 0 ? (count / total) * 100 : 0 }));
  const awaitingCitizen = c.filter((x: any) => x.status === "vatandas_yaniti_bekleniyor").length;
  const highPriorityOpen = c.filter((x: any) => x.priority === "high" && !["cozuldu", "reddedildi"].includes(x.status)).length;
  const inReview = c.filter((x: any) => x.status === "incelemede").length;
  
  // Foreign stats
  const foreignComplaints = c.filter((x: any) => x.language && x.language !== "tr");
  const foreignTotal = foreignComplaints.length;
  const foreignResolved = foreignComplaints.filter((x: any) => x.status === "cozuldu").length;
  const foreignSatScores = foreignComplaints.filter((x: any) => x.satisfaction_score).map((x: any) => x.satisfaction_score);
  const foreignSatisfaction = foreignSatScores.length ? (foreignSatScores.reduce((a: number, b: number) => a + b, 0) / foreignSatScores.length) : undefined;

  // SLA & Crisis calculations
  const slaLimitHours = botSettings?.slaLimitHours ?? 120;
  const crisisLimitHours = botSettings?.crisisLimitHours ?? 1;
  const crisisLimitCount = botSettings?.crisisLimitCount ?? 4;

  const now = new Date().getTime();
  const escalatedComplaints = c.filter((x: any) =>
    x.priority === "yuksek" &&
    !["cozuldu", "reddedildi"].includes(x.status) &&
    (now - new Date(x.created_at).getTime()) > slaLimitHours * 3600000
  );

  const recentCrisesGroups: { [key: string]: { count: number, neighborhood: string, category: string } } = {};
  c.forEach((x: any) => {
    if ((now - new Date(x.created_at).getTime()) <= crisisLimitHours * 3600000) {
      const nbr = x.neighborhoods?.name;
      const cat = x.category;
      if (nbr && cat && !["cozuldu", "reddedildi"].includes(x.status)) {
        const key = `${nbr}-${cat}`;
        if (!recentCrisesGroups[key]) recentCrisesGroups[key] = { count: 0, neighborhood: nbr, category: cat };
        recentCrisesGroups[key].count++;
      }
    }
  });
  const activeCrises = Object.values(recentCrisesGroups).filter(g => g.count >= crisisLimitCount);

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
            resolvedPct: total > 0 ? parseFloat(((resolved / total) * 100).toFixed(1)) : 0,
            avgResolutionHours,
            topCategory,
            topNeighborhood: topNbr,
            topDepartment: topDept,
            departmentName: deptName,
            satisfaction: avgSat || undefined,
            topNeighborhoods: rankedNbrs,
            topCategories: rankedCats,
            topDepartments: rankedDepts,
            awaitingCitizen,
            highPriorityOpen,
            inReview,
            foreignTotal,
            foreignResolved,
            foreignSatisfaction,
          },
          role: primaryRole as any,
        },
      }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          isBaskanOrAdmin
            ? `Hoş geldiniz, ${primaryRole === "baskan" ? "Başkanım" : profile?.full_name || "Yönetici"}`
            : isZabitaMemuru
            ? `Saha Operasyon Paneli — ${profile?.full_name || "Zabıta Memuru"}`
            : `Hoş geldiniz, ${profile?.full_name || "Kullanıcı"}`
        }
        description={`Rolünüz: ${ROLE_LABELS[primaryRole] ?? primaryRole} — ${deptName ? deptName + " — " : ""}Belediye AI Modülü`}
      />

      {/* Alerts */}
      {canSeeAnalytics && (activeCrises.length > 0 || escalatedComplaints.length > 0) && (
        <div className="space-y-3">
          {activeCrises.map((crisis, i) => (
            <div key={`crisis-${i}`} className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg flex items-start gap-3 shadow-lg shadow-red-500/5">
              <div className="bg-red-500/20 p-2 rounded-full shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-500" />
              </div>
              <div>
                <h4 className="font-bold text-red-800 dark:text-red-400">BÖLGESEL KRİZ UYARISI</h4>
                <p className="text-sm mt-1 text-red-950 dark:text-red-200">
                  {crisis.neighborhood} mahallesinde son {crisisLimitHours} saat içinde {crisis.count} adet açık <strong>{crisis.category}</strong> şikayeti tespit edildi. Bu şikayetlerin önceliği otomatik olarak "Yüksek" yapıldı.
                </p>
              </div>
            </div>
          ))}
          {escalatedComplaints.map((esc: any) => (
            <div key={`esc-${esc.id}`} className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-orange-500/5">
              <div className="flex items-start gap-3">
                <div className="bg-orange-500/20 p-2 rounded-full shrink-0">
                  <Clock className="h-5 w-5 text-orange-600 dark:text-orange-500" />
                </div>
                <div>
                  <h4 className="font-bold text-orange-800 dark:text-orange-400">SLA İHLALİ (ESKALASYON)</h4>
                  <p className="text-sm mt-1 text-orange-950 dark:text-orange-200">
                    <strong>{esc.id.substring(0,8).toUpperCase()}</strong> takip numaralı Yüksek Öncelikli şikayet ({esc.category}) {slaLimitHours >= 24 ? `${Math.round(slaLimitHours / 24)} günü` : `${slaLimitHours} saati`} aştı ve halen çözülemedi.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-orange-500/30 text-orange-900 dark:text-orange-400 hover:bg-orange-500/20 hover:text-orange-800 dark:hover:text-orange-300 shrink-0" asChild>
                <Link to="/sikayetler/$id" params={{ id: esc.id }}>İncele</Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={isMudurluk ? "Birim Toplam" : "Toplam Şikayet"} value={total} icon={MessageSquare} accent="primary" />
        <KpiCard label={isMudurluk ? "Birim Açık" : "Açık Şikayet"} value={open} icon={Clock} accent="warn" />
        <KpiCard label={isMudurluk ? "Birim Çözülen" : "Çözülen"} value={resolved} icon={CheckCircle2} accent="accent" />
        <KpiCard label="Ort. Çözüm" value={`${avgResolutionHours.toFixed(1)}s`} icon={TrendingUp} />
      </div>

      {/* Zabıta Re-Denetim Takip Paneli (Ana Panelde) */}
      <ZabitaFollowupDashboardWidget />

      <Tabs defaultValue="ozet" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="ozet">Genel Özet</TabsTrigger>
          <TabsTrigger value="harita">Harita Görünümü</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: GENEL ÖZET ── */}
        <TabsContent value="ozet" className="space-y-6">
          {/* ── ANALİZ VE GRAFİKLER BÖLÜMÜ ── */}
          {canSeeAnalytics && (
            <div className="space-y-6">
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
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" stroke="#1e2f5a" fill="url(#trendGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {isBaskanOrAdmin ? (
              <BarChartCard title="Müdürlüğe Göre Şikayetler" data={toComplexChartData(c, (x) => x.departments?.name ?? "—")} colors={CHART_COLORS} />
            ) : (
              <ChartCard title="Duruma Göre Dağılım">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={toComplexChartData(c, (x) => STATUS_LABELS[x.status] ?? x.status)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} label>
                      {toComplexChartData(c, (x) => STATUS_LABELS[x.status] ?? x.status).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {/* Charts Row 2 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Mahalleye Göre Şikayetler (İlk 10)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={toComplexChartData(c, (x) => x.neighborhoods?.name ?? "—").slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(value) => value === 'resolved' ? 'Çözülen Şikayet' : 'Açık Şikayet'} />
                  <Bar dataKey="resolved" stackId="a" fill="#10B981" />
                  <Bar dataKey="open" stackId="a" fill="#1e2f5a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            
            {isBaskanOrAdmin ? (
              <ChartCard title="Duruma Göre Şikayetler">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={toComplexChartData(c, (x) => STATUS_LABELS[x.status] ?? x.status)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100} label>
                      {toComplexChartData(c, (x) => STATUS_LABELS[x.status] ?? x.status).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            ) : (
              <ChartCard title="Kategoriye Göre Dağılım">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={toComplexChartData(c, (x) => x.category ?? "Diğer")}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend formatter={(value) => value === 'resolved' ? 'Çözülen Şikayet' : 'Açık Şikayet'} />
                    <Bar dataKey="resolved" stackId="a" fill="#10B981" />
                    <Bar dataKey="open" stackId="a" fill="#1e2f5a" radius={[4, 4, 0, 0]} />
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
                    <BarChart data={toComplexChartData(c, (x) => x.category ?? "Diğer")}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend formatter={(value) => value === 'resolved' ? 'Çözülen' : 'Açık'} />
                      <Bar dataKey="resolved" stackId="a" fill="#10B981" />
                      <Bar dataKey="open" stackId="a" fill="#1e2f5a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Başkan Yrd. Göre">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={toComplexChartData(c, (x) => x.departments?.deputy_mayors?.full_name ?? "—")} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend formatter={(value) => value === 'resolved' ? 'Çözülen' : 'Açık'} />
                      <Bar dataKey="resolved" stackId="a" fill="#10B981" />
                      <Bar dataKey="open" stackId="a" fill="#1e2f5a" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Şikayet Dili">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={toComplexChartData(c, (x) => x.language ?? "tr")} dataKey="value" nameKey="name" outerRadius={80} label>
                        {toComplexChartData(c, (x) => x.language ?? "tr").map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} /><Legend />
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
        </div>
      )}

          {/* Zabıta Ruhsat Denetim İstatistikleri (Genel Özet altında - Sadece Müdür/Yönetici) */}
          {canSeeAnalytics && <ZabitaInspectionAnalytics />}
        </TabsContent>
        <TabsContent value="harita" className="space-y-6">
          <AlanyaMap complaints={c} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Müdürlüğe Göre Şikayetler için yardımcı bileşen
function BarChartCard({ title, data, colors }: { title: string; data: any[]; colors: string[] }) {
  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(value) => value === 'resolved' ? 'Çözülen Şikayet' : 'Açık Şikayet'} />
          <Bar dataKey="resolved" stackId="a" fill="#10B981" />
          <Bar dataKey="open" stackId="a" fill="#1e2f5a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
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

// Toplam ve Çözülen sayılarını birlikte tutan grafik veri üreticisi
function toComplexChartData(complaints: any[], keySelector: (x: any) => string) {
  const map: Record<string, { name: string; value: number; resolved: number; open: number }> = {};
  
  complaints.forEach((c) => {
    const k = keySelector(c);
    if (!map[k]) {
      map[k] = { name: k, value: 0, resolved: 0, open: 0 };
    }
    map[k].value += 1;
    if (c.status === "cozuldu") {
      map[k].resolved += 1;
    }
  });

  // open değerini hesapla
  Object.values(map).forEach((item) => {
    item.open = item.value - item.resolved;
  });

  return Object.values(map).sort((a, b) => b.value - a.value);
}

// Özel Tooltip Bileşeni
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    // Eğer kompleks veri değilse (örneğin trend analizi) düzgünce fallback et
    const total = data.value !== undefined ? data.value : (data.count !== undefined ? data.count : 0);
    const resolved = data.resolved !== undefined ? data.resolved : 0;
    
    return (
      <div className="rounded-lg border bg-background p-3 shadow-md">
        <p className="font-display font-medium text-sm border-b pb-1.5 mb-1.5">{data.name || data.day}</p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Şikayet Sayısı:</span>
            <span className="font-semibold text-foreground">{total}</span>
          </div>
          {data.resolved !== undefined && (
            <div className="flex items-center justify-between gap-4 text-accent">
              <span>Çözülen Şikayet:</span>
              <span className="font-semibold">{resolved}</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function getLast7DaysTrend(complaints: any[]) {
  const days: { day: string; count: number; resolved: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
    const dailyComplaints = complaints.filter((c: any) => c.created_at?.slice(0, 10) === dateStr);
    const count = dailyComplaints.length;
    const resolved = dailyComplaints.filter((c: any) => c.status === "cozuldu").length;
    days.push({ day: label, count, resolved });
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

/* ─── Zabıta Re-Denetim Takip Widget (Ana Panel) ─── */
function ZabitaFollowupDashboardWidget() {
  const { isZabita } = useAuth();
  // Yalnızca zabıta görebilir; başkan/admin dahil diğer roller görmez.
  const isRelevant = isZabita;

  const followupQuery = useQuery({
    queryKey: ["dashboard-followup-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("*")
        .eq("followup_status", "pending")
        .not("followup_date", "is", null)
        .order("followup_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isRelevant,
    refetchInterval: 60_000,
  });

  if (!isRelevant) return null;

  const items = followupQuery.data ?? [];
  if (items.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdue: typeof items = [];
  const upcoming: typeof items = [];
  const later: typeof items = [];

  items.forEach((item) => {
    const fd = new Date(item.followup_date!);
    fd.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((fd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) overdue.push(item);
    else if (diffDays <= 3) upcoming.push(item);
    else later.push(item);
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  };

  const daysDiff = (iso: string) => {
    const fd = new Date(iso);
    fd.setHours(0, 0, 0, 0);
    return Math.ceil((fd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <Card className="border-orange-300 dark:border-orange-700 overflow-hidden">
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 px-5 py-3 border-b border-orange-200 dark:border-orange-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-orange-500/15 dark:bg-orange-500/25 p-2 rounded-lg">
            <CalendarClock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold text-orange-900 dark:text-orange-200 text-sm">
              Zabıta Re-Denetim Takibi
            </h3>
            <p className="text-[11px] text-orange-700/70 dark:text-orange-400/60">
              İhtar verilen işyerleri otomatik takip
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {overdue.length > 0 && (
            <Badge variant="destructive" className="text-xs animate-pulse">
              {overdue.length} Gecikmiş
            </Badge>
          )}
          {upcoming.length > 0 && (
            <Badge className="text-xs bg-amber-500 text-white">
              {upcoming.length} Yaklaşan
            </Badge>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/40" asChild>
            <Link to="/zabita-denetim">
              <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" />
              Denetim Sayfası
            </Link>
          </Button>
        </div>
      </div>
      <div className="px-4 py-3 max-h-52 overflow-y-auto space-y-1.5">
        {overdue.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3" /> Süresi Dolmuş — Acil Re-Denetim Gerekli
            </p>
            {overdue.map((item) => (
              <Link
                key={item.id}
                to="/zabita-denetim"
                className="block px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm text-red-800 dark:text-red-300 truncate">{item.workplace_name}</span>
                  <Badge variant="destructive" className="text-[10px] shrink-0 ml-2">
                    {Math.abs(daysDiff(item.followup_date!))} gün gecikmiş
                  </Badge>
                </div>
                <p className="text-[10px] text-red-600/70 dark:text-red-400/70 mt-0.5">
                  Süre Bitişi: {formatDate(item.followup_date!)} · Ceza: {item.penalty_points} Puan
                </p>
              </Link>
            ))}
          </div>
        )}
        {upcoming.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3" /> Yaklaşan (3 Gün İçinde)
            </p>
            {upcoming.map((item) => (
              <Link
                key={item.id}
                to="/zabita-denetim"
                className="block px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm text-amber-800 dark:text-amber-300 truncate">{item.workplace_name}</span>
                  <Badge className="text-[10px] bg-amber-500 text-white shrink-0 ml-2">
                    {daysDiff(item.followup_date!)} gün kaldı
                  </Badge>
                </div>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                  Süre Bitişi: {formatDate(item.followup_date!)} · Ceza: {item.penalty_points} Puan
                </p>
              </Link>
            ))}
          </div>
        )}
        {later.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3" /> İlerisi
            </p>
            {later.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="px-3 py-1.5 rounded-md bg-muted/20 border text-muted-foreground"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-xs truncate">{item.workplace_name}</span>
                  <span className="text-[10px] shrink-0 ml-2">{daysDiff(item.followup_date!)} gün</span>
                </div>
              </div>
            ))}
            {later.length > 3 && (
              <p className="text-[10px] text-muted-foreground text-center">
                +{later.length - 3} daha fazla…
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
