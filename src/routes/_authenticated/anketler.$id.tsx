import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/panel-primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PieChart as PieChartIcon } from "lucide-react";
import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/anketler/$id")({
  ssr: false,
  component: PollDetails,
  head: () => ({ meta: [{ title: "Anket Sonuçları — Belediye AI" }] }),
});

const CHART_COLORS = [
  "#3fa87a",
  "#e08a3c",
  "#7c4dff",
  "#3aa4d0",
  "#c4574f",
  "#607d8b",
  "#8bc34a",
  "#ff7043",
];

const RADIAN = Math.PI / 180;
const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name,
  value,
}: any) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  if (percent < 0.05) return null; // Çok küçük dilimlerde label gösterme

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight="bold"
    >
      {`%${(percent * 100).toFixed(0)}`}
    </text>
  );
};

function PollDetails() {
  const { id } = Route.useParams();

  const { data: pollData, isLoading } = useQuery({
    queryKey: ["poll-details", id],
    queryFn: async () => {
      // Fetch poll details
      const { data: poll, error: pollError } = await supabase
        .from("polls")
        .select("*")
        .eq("id", id)
        .single();
      if (pollError) throw pollError;

      // Fetch options and votes
      const { data: options, error: optionsError } = await supabase
        .from("poll_options")
        .select("*, poll_votes(count)")
        .eq("poll_id", id);
      if (optionsError) throw optionsError;

      return { poll, options };
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>;
  }

  if (!pollData || !pollData.poll) {
    return <div className="p-8 text-center text-red-500">Anket bulunamadı.</div>;
  }

  const { poll, options } = pollData;
  const totalVotes = options.reduce((sum, opt) => sum + (opt.poll_votes[0]?.count || 0), 0);

  const chartData = options.map((opt) => {
    const votes = opt.poll_votes[0]?.count || 0;
    return {
      name: opt.option_text,
      votes: votes,
      percentage: totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : "0",
    };
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/anketler">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title="Anket Detayı"
          description={`${poll.title} anketi sonuçları ve detayları.`}
          icon={PieChartIcon}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Anket Bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Başlık</p>
              <p className="text-base font-semibold">{poll.title}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Soru</p>
              <p className="text-base">{poll.question}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Durum</p>
              <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mt-1">
                {poll.status === "active" ? (
                  <span className="text-green-500">Aktif</span>
                ) : (
                  <span className="text-muted-foreground">Tamamlandı</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Oluşturulma Tarihi</p>
              <p className="text-base">{new Date(poll.created_at).toLocaleString("tr-TR")}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Toplam Oy</p>
              <p className="text-2xl font-bold text-primary">{totalVotes}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sonuçlar Grafiği</CardTitle>
          </CardHeader>
          <CardContent>
            {totalVotes === 0 ? (
              <div className="flex h-72 items-center justify-center text-muted-foreground">
                Henüz oy kullanılmamış.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomizedLabel}
                      outerRadius={100}
                      dataKey="votes"
                      animationBegin={0}
                      animationDuration={800}
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string, props: any) => [
                        `${value} Oy (%${props.payload.percentage})`,
                        props.payload.name,
                      ]}
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "13px",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value, entry: any) => {
                        const item = chartData.find((d) => d.name === value);
                        return `${value} (${item?.votes || 0} oy)`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Şık Dağılımı Detayı</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {chartData.map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">
                    {item.votes} Oy (%{item.percentage})
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
