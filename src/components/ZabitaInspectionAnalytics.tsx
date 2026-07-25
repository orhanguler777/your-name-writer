import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/panel-primitives";
import { ClipboardCheck, ShieldCheck, AlertTriangle, Stamp, Loader2 } from "lucide-react";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, AreaChart, Area,
} from "recharts";

const COLORS = ["#1e2f5a", "#3fa87a", "#e08a3c", "#7c4dff", "#3aa4d0", "#c4574f", "#607d8b", "#8bc34a", "#ff7043"];

const typeTitle = (id: string) => ZABITA_CHECKLISTS.find((c) => c.id === id)?.title || id;

// Adresin ilk kelimesinden mahalle çıkarımı (SARAY MAH. → SARAY, İskele Caddesi → İSKELE)
function mahalleOf(address?: string | null): string {
  const first = String(address ?? "").trim().split(/[\s,.]+/)[0] || "";
  return first ? first.toLocaleUpperCase("tr-TR") : "—";
}

// Yaptırımı uyum seviyesine göre kovala + renk
const ACTION_META: { match: (a: string) => boolean; label: string; color: string }[] = [
  { match: (a) => a === "Uygun" || a === "", label: "Temiz / Uygun", color: "#16a34a" },
  { match: (a) => a.includes("Uyarı"), label: "Sözlü / Yazılı Uyarı", color: "#eab308" },
  { match: (a) => a.includes("İhtar"), label: "İhtar", color: "#f59e0b" },
  { match: (a) => a.includes("Para"), label: "İdari Para Cezası", color: "#ea580c" },
  { match: (a) => a.includes("Men") || a.includes("Mühür"), label: "Mühürleme", color: "#dc2626" },
];
const actionBucket = (a?: string | null) =>
  ACTION_META.find((m) => m.match(String(a ?? "")))?.label ?? "Diğer";
const bucketColor = (label: string) => ACTION_META.find((m) => m.label === label)?.color ?? "#607d8b";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow">
      <div className="font-semibold mb-0.5">{label ?? payload[0]?.name}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || p.fill }}>{p.name}: <b>{p.value}</b></div>
      ))}
    </div>
  );
}

export function ZabitaInspectionAnalytics() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["zabita-inspection-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workplace_inspections")
        .select("inspection_type, address, penalty_points, recommended_action, checklist, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const a = useMemo(() => {
    const total = rows.length;
    const clean = rows.filter((r: any) => (r.penalty_points ?? 0) === 0).length;
    const sealed = rows.filter((r: any) => actionBucket(r.recommended_action) === "Mühürleme").length;
    const avgPenalty = total ? Math.round(rows.reduce((s: number, r: any) => s + (r.penalty_points ?? 0), 0) / total) : 0;
    const cleanRate = total ? Math.round((clean / total) * 100) : 0;

    // Sektöre / türe göre
    const byTypeMap: Record<string, number> = {};
    rows.forEach((r: any) => { const k = typeTitle(r.inspection_type); byTypeMap[k] = (byTypeMap[k] ?? 0) + 1; });
    const byType = Object.entries(byTypeMap).map(([name, value]) => ({ name, value })).sort((x, y) => y.value - x.value);

    // Uyuma / yaptırıma göre
    const byActionMap: Record<string, number> = {};
    rows.forEach((r: any) => { const k = actionBucket(r.recommended_action); byActionMap[k] = (byActionMap[k] ?? 0) + 1; });
    const byAction = ACTION_META.map((m) => m.label).filter((l) => byActionMap[l])
      .map((name) => ({ name, value: byActionMap[name] }));

    // Mahalleye göre (ilk 10)
    const byHoodMap: Record<string, { total: number; penalized: number }> = {};
    rows.forEach((r: any) => {
      const k = mahalleOf(r.address);
      byHoodMap[k] = byHoodMap[k] ?? { total: 0, penalized: 0 };
      byHoodMap[k].total += 1;
      if ((r.penalty_points ?? 0) > 0) byHoodMap[k].penalized += 1;
    });
    const byHood = Object.entries(byHoodMap)
      .map(([name, v]) => ({ name, Denetim: v.total, Cezalı: v.penalized }))
      .sort((x, y) => y.Denetim - x.Denetim)
      .slice(0, 10);

    // Son 30 gün trend
    const days: { name: string; value: number }[] = [];
    const byDay: Record<string, number> = {};
    rows.forEach((r: any) => {
      const d = new Date(r.created_at);
      const key = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      byDay[key] = (byDay[key] ?? 0) + 1;
    });
    // son 30 günü sırayla üret (created_at bazlı basit dolum)
    const uniqueDays = Object.keys(byDay).sort((x, y) => {
      const [dx, mx] = x.split(".").map(Number); const [dy, my] = y.split(".").map(Number);
      return mx - my || dx - dy;
    });
    uniqueDays.forEach((k) => days.push({ name: k, value: byDay[k] }));

    // En sık eksik maddeler (ilk 8) — her denetimin türüne göre işaretlenmeyen maddeler
    const violMap: Record<string, number> = {};
    rows.forEach((r: any) => {
      const cat = ZABITA_CHECKLISTS.find((c) => c.id === r.inspection_type);
      if (!cat) return;
      const cl = (r.checklist ?? {}) as Record<string, boolean>;
      cat.items.forEach((it) => {
        if (cl[it.id] !== true && !/mevzuat/i.test(it.label)) {
          violMap[it.label] = (violMap[it.label] ?? 0) + 1;
        }
      });
    });
    const topViolations = Object.entries(violMap)
      .map(([name, value]) => ({ name, value }))
      .sort((x, y) => y.value - x.value)
      .slice(0, 8);

    return { total, cleanRate, avgPenalty, sealed, byType, byAction, byHood, days, topViolations };
  }, [rows]);

  if (isLoading) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </Card>
    );
  }
  if (a.total === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Ruhsat Denetim İstatistikleri</h2>
      </div>

      {/* KPI */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Toplam Denetim" value={a.total} icon={ClipboardCheck} accent="primary" />
        <KpiCard label="Temiz Oranı" value={`%${a.cleanRate}`} icon={ShieldCheck} accent="accent" />
        <KpiCard label="Ort. Ceza Puanı" value={a.avgPenalty} icon={AlertTriangle} accent="warn" />
        <KpiCard label="Mühürlenen" value={a.sealed} icon={Stamp} accent="destructive" />
      </div>

      {/* Grafikler */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-display font-semibold">Sektöre / Türe Göre Denetim</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={a.byType}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={90} interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Denetim" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {a.byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display font-semibold">Uyum / Yaptırım Dağılımı</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={a.byAction} dataKey="value" nameKey="name" innerRadius={55} outerRadius={100} label>
                {a.byAction.map((d, i) => <Cell key={i} fill={bucketColor(d.name)} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-1">
            {a.byAction.map((d) => (
              <span key={d.name} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: bucketColor(d.name) }} />
                {d.name} ({d.value})
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display font-semibold">Mahalleye Göre Denetim (İlk 10)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={a.byHood}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={80} interval={0} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Denetim" stackId="a" fill="#1e2f5a" isAnimationActive={false} />
              <Bar dataKey="Cezalı" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-display font-semibold">Son Dönem Denetim Trendi</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={a.days}>
              <defs>
                <linearGradient id="zabitaTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3fa87a" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#3fa87a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" name="Denetim" stroke="#3fa87a" strokeWidth={2} fill="url(#zabitaTrend)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {a.topViolations.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-1 font-display font-semibold">En Sık Karşılaşılan Eksikler</h3>
          <p className="text-xs text-muted-foreground mb-3">Denetimlerde en çok "YOK" işaretlenen maddeler — sahada en yaygın uygunsuzluklar.</p>
          <ResponsiveContainer width="100%" height={Math.max(220, a.topViolations.length * 34)}>
            <BarChart data={a.topViolations} layout="vertical" margin={{ left: 12, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={260} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Eksik Sayısı" fill="#c4574f" radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
