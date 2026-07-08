import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, PriorityBadge, EmptyState } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABELS, CATEGORIES } from "@/lib/turkish";
import { MessageSquare, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/sikayetler")({
  ssr: false,
  component: List,
  head: () => ({ meta: [{ title: "Şikayetler — Belediye AI" }] }),
});

function List() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const { hasAnyRole } = useAuth();

  const { data: complaints, isLoading } = useQuery({
    queryKey: ["complaints", { search, status, category }],
    queryFn: async () => {
      let q = supabase
        .from("complaints")
        .select("id, complaint_text, citizen_name, category, priority, status, created_at, assigned_department_id, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (status !== "all") q = q.eq("status", status);
      if (category !== "all") q = q.eq("category", category);
      if (search) q = q.ilike("complaint_text", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        title="Şikayetler"
        description="Sistemdeki tüm şikayet ve talepleri görüntüleyin."
        actions={
          hasAnyRole("vatandas", "cozum_masasi", "admin") && (
            <Button asChild>
              <Link to="/sikayet-olustur"><Plus className="h-4 w-4 mr-1" /> Yeni Şikayet</Link>
            </Button>
          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Metin ara..." className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Durum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Kategoriler</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : !complaints || complaints.length === 0 ? (
          <EmptyState title="Şikayet bulunamadı" description="Filtrelerinizi değiştirin veya yeni bir şikayet oluşturun." icon={MessageSquare} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vatandaş</TableHead>
                <TableHead>Şikayet</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Müdürlük</TableHead>
                <TableHead>Öncelik</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Tarih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complaints.map((c: any) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link to="/sikayetler/$id" params={{ id: c.id }} className="hover:underline">{c.citizen_name}</Link>
                    <div className="text-xs text-muted-foreground">{c.neighborhoods?.name}</div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-2 text-sm">{c.complaint_text}</p>
                  </TableCell>
                  <TableCell><span className="text-sm">{c.category}</span></TableCell>
                  <TableCell><span className="text-sm">{c.departments?.name}</span></TableCell>
                  <TableCell><PriorityBadge priority={c.priority} /></TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(c.created_at).toLocaleDateString("tr-TR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
