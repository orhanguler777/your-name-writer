import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, KpiCard } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Smile, Frown, Users, Star, Award, MapPin, Building2, Calendar } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend, AreaChart, Area
} from "recharts";

export const Route = createFileRoute("/_authenticated/memnuniyet")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Memnuniyet Analizi — Belediye AI" }] }),
});

const COLORS = ["#3fa87a", "#3aa4d0", "#e08a3c", "#c4574f", "#7c4dff"];
const SCORE_TEXTS = ["Çok Kötü", "Kötü", "Orta", "İyi", "Çok İyi"];

function Page() {
  const { data, isLoading } = useQuery({
    queryKey: ["satisfaction-analytics"],
    queryFn: async () => {
      const { data: complaints, error } = await supabase
        .from("complaints")
        .select(`
          id,
          satisfaction_score,
          category,
          created_at,
          neighborhoods(name),
          departments!complaints_assigned_department_id_fkey(name)
        `);

      if (error) throw error;
      return complaints || [];
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Analizler yükleniyor...</div>;
  }

  const complaints = data || [];
  const ratedComplaints = complaints.filter(c => c.satisfaction_score !== null && c.satisfaction_score !== undefined);
  const totalRated = ratedComplaints.length;

  // Ortalama Skor hesaplama
  const totalScore = ratedComplaints.reduce((acc, c) => acc + (c.satisfaction_score || 0), 0);
  const averageScore = totalRated > 0 ? (totalScore / totalRated) : 0;
  const satisfactionRate = totalRated > 0 ? (ratedComplaints.filter(c => (c.satisfaction_score || 0) >= 4).length / totalRated) * 100 : 0;

  // Skor dağılımı (1-5)
  const distributionMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratedComplaints.forEach(c => {
    const score = c.satisfaction_score as 1 | 2 | 3 | 4 | 5;
    if (distributionMap[score] !== undefined) {
      distributionMap[score]++;
    }
  });

  const distributionData = [
    { name: "5 Yıldız (Çok İyi)", value: distributionMap[5], percent: totalRated > 0 ? (distributionMap[5] / totalRated) * 100 : 0 },
    { name: "4 Yıldız (İyi)", value: distributionMap[4], percent: totalRated > 0 ? (distributionMap[4] / totalRated) * 100 : 0 },
    { name: "3 Yıldız (Orta)", value: distributionMap[3], percent: totalRated > 0 ? (distributionMap[3] / totalRated) * 100 : 0 },
    { name: "2 Yıldız (Kötü)", value: distributionMap[2], percent: totalRated > 0 ? (distributionMap[2] / totalRated) * 100 : 0 },
    { name: "1 Yıldız (Çok Kötü)", value: distributionMap[1], percent: totalRated > 0 ? (distributionMap[1] / totalRated) * 100 : 0 },
  ];

  // Mahallelere göre memnuniyet (Sadece yeterli puanı alanlar)
  const nbrScores: Record<string, { total: number; count: number }> = {};
  ratedComplaints.forEach(c => {
    const nbrName = c.neighborhoods?.name || "Belirtilmemiş";
    if (!nbrScores[nbrName]) nbrScores[nbrName] = { total: 0, count: 0 };
    nbrScores[nbrName].total += c.satisfaction_score || 0;
    nbrScores[nbrName].count++;
  });

  const neighborhoodData = Object.entries(nbrScores)
    .map(([name, stat]) => ({
      name,
      avg: parseFloat((stat.total / stat.count).toFixed(2)),
      count: stat.count
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10); // En yüksek puanlı 10 mahalle

  // Müdürlüklere göre memnuniyet
  const deptScores: Record<string, { total: number; count: number }> = {};
  ratedComplaints.forEach(c => {
    const deptName = c.departments?.name || "Atanmamış";
    if (!deptScores[deptName]) deptScores[deptName] = { total: 0, count: 0 };
    deptScores[deptName].total += c.satisfaction_score || 0;
    deptScores[deptName].count++;
  });

  const departmentData = Object.entries(deptScores)
    .map(([name, stat]) => ({
      name,
      avg: parseFloat((stat.total / stat.count).toFixed(2)),
      count: stat.count
    }))
    .sort((a, b) => b.avg - a.avg);

  // Zaman içindeki trend (Son 7 gün / hafta)
  const timeScores: Record<string, { total: number; count: number }> = {};
  ratedComplaints.forEach(c => {
    if (!c.created_at) return;
    const dateStr = new Date(c.created_at).toLocaleDateString("tr-TR", { month: "short", day: "numeric" });
    if (!timeScores[dateStr]) timeScores[dateStr] = { total: 0, count: 0 };
    timeScores[dateStr].total += c.satisfaction_score || 0;
    timeScores[dateStr].count++;
  });

  const trendData = Object.entries(timeScores)
    .map(([date, stat]) => ({
      date,
      avg: parseFloat((stat.total / stat.count).toFixed(2))
    }))
    .slice(-10); // Son 10 gün/periyot trendi

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vatandaş Memnuniyeti Analiz Paneli"
        description="Çözülen şikayetlerin ardından WhatsApp üzerinden toplanan memnuniyet anketlerinin detaylı analiz raporları."
      />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Ortalama Puan" value={`${averageScore.toFixed(2)} / 5.0`} icon={Star} accent="accent" />
        <KpiCard label="Mutlu Vatandaş Oranı" value={`%${satisfactionRate.toFixed(1)}`} icon={Smile} accent="primary" />
        <KpiCard label="Toplam Değerlendirme" value={totalRated} icon={Users} />
        <KpiCard label="Memnuniyet Seviyesi" value={averageScore >= 4 ? "Çok İyi" : averageScore >= 3 ? "Orta" : "Zayıf"} icon={Award} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Puan Dağılımı Grafiği (Pie Chart) */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <Smile className="h-5 w-5 text-primary" /> Puan Dağılım Oranları
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent).toFixed(1)}%)`}
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} Oy`, "Katılım"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Zaman İçindeki Memnuniyet Trendi (Area Chart) */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Günlük Memnuniyet Trendi
          </h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3fa87a" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3fa87a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[1, 5]} />
                <Tooltip />
                <Area type="monotone" dataKey="avg" stroke="#3fa87a" fillOpacity={1} fill="url(#colorAvg)" name="Ortalama Skor" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Müdürlüklere Göre Memnuniyet Skoru (Bar Chart) */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Müdürlüklerin Memnuniyet Ortalaması
          </h3>
          <div className="h-80">
            {departmentData.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground pt-32">Henüz puanlanmış bir müdürlük yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentData} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[1, 5]} />
                  <YAxis dataKey="name" type="category" width={120} style={{ fontSize: "12px" }} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="#1e2f5a" radius={[0, 4, 4, 0]} name="Ortalama Puan" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Mahallelere Göre Memnuniyet Skoru (Bar Chart) */}
        <Card className="p-5">
          <h3 className="font-display font-semibold mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Mahallelere Göre Memnuniyet Ortalaması (İlk 10)
          </h3>
          <div className="h-80">
            {neighborhoodData.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground pt-32">Henüz puanlanmış bir mahalle yok.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={neighborhoodData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" style={{ fontSize: "11px" }} />
                  <YAxis domain={[1, 5]} />
                  <Tooltip />
                  <Bar dataKey="avg" fill="#3aa4d0" radius={[4, 4, 0, 0]} name="Ortalama Puan" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
