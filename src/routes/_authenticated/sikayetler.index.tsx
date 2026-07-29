import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, PriorityBadge, EmptyState } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_LABELS, CATEGORIES } from "@/lib/turkish";
import { MessageSquare, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/sikayetler/")({
  ssr: false,
  component: List,
  head: () => ({ meta: [{ title: "Şikayetler — Belediye AI" }] }),
});

function List() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [neighborhood, setNeighborhood] = useState<string>("all");
  const { hasAnyRole, primaryRole, profile } = useAuth();
  const navigate = useNavigate();

  const isMudurluk = primaryRole === "mudurluk";
  const deptId = profile?.department_id;

  // Mahalle listesini getir
  const { data: neighborhoods } = useQuery({
    queryKey: ["neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("neighborhoods").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const searchString = typeof window !== "undefined" ? window.location.search : "";

  // URL Arama parametrelerini yükle
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qSearch = params.get("search") || "";
    const qStatus = params.get("status") || "all";
    const qNeighborhood = params.get("neighborhood") || "all";
    const qCategory = params.get("category") || "all";

    setSearch(qSearch);
    setStatus(qStatus);
    setCategory(qCategory);

    if (qNeighborhood && qNeighborhood !== "all") {
      if (neighborhoods && neighborhoods.length > 0) {
        const cleanStr = (s: string) =>
          (s || "")
            .toLowerCase()
            .replace(/ı/g, "i")
            .replace(/ğ/g, "g")
            .replace(/ü/g, "u")
            .replace(/ş/g, "s")
            .replace(/ö/g, "o")
            .replace(/ç/g, "c")
            .trim();

        const found = neighborhoods.find(
          (n: any) =>
            n.id === qNeighborhood ||
            cleanStr(n.name) === cleanStr(qNeighborhood) ||
            cleanStr(n.id) === cleanStr(qNeighborhood),
        );
        if (found) {
          setNeighborhood(found.id);
        } else {
          setNeighborhood(qNeighborhood);
        }
      } else {
        // Dropdown henüz yüklenmediyse geçici olarak doğrudan set et
        setNeighborhood(qNeighborhood);
      }
    } else {
      setNeighborhood("all");
    }
  }, [neighborhoods, searchString]);

  const { data: complaints, isLoading } = useQuery({
    queryKey: ["complaints", { search, status, category, neighborhood, isMudurluk, deptId }],
    queryFn: async () => {
      let q = supabase
        .from("complaints")
        .select(
          "id, complaint_text, citizen_name, category, priority, status, created_at, assigned_department_id, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name)",
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (status === "active") {
        q = q.neq("status", "cozuldu").neq("status", "iptal");
      } else if (status !== "all") {
        q = q.eq("status", status);
      }

      if (category !== "all") q = q.eq("category", category);

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        neighborhood,
      );
      if (neighborhood !== "all" && isUuid) {
        q = q.eq("neighborhood_id", neighborhood);
      }

      if (search) q = q.ilike("complaint_text", `%${search}%`);
      if (isMudurluk && deptId) q = q.eq("assigned_department_id", deptId);

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
          // "superuser" da dahil — bkz. sikayetler.$id.tsx'teki aynı not.
          hasAnyRole("vatandas", "cozum_masasi", "admin", "superuser") && (
            <Button asChild>
              <Link to="/sikayet-olustur">
                <Plus className="h-4 w-4 mr-1" /> Yeni Şikayet
              </Link>
            </Button>
          )
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Metin ara..."
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="active">Aktif Şikayetler</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Kategoriler</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={neighborhood} onValueChange={setNeighborhood}>
            <SelectTrigger>
              <SelectValue placeholder="Mahalle Seçin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Mahalleler</SelectItem>
              {neighborhoods?.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : !complaints || complaints.length === 0 ? (
          <EmptyState
            title="Şikayet bulunamadı"
            description="Filtrelerinizi değiştirin veya yeni bir şikayet oluşturun."
            icon={MessageSquare}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Şikayet No</TableHead>
                <TableHead>Vatandaş</TableHead>
                <TableHead>Şikayet</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Müdürlük</TableHead>
                <TableHead>Öncelik</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complaints.map((c: any) => (
                <TableRow
                  key={c.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={(e) => {
                    // Ignore if clicked on a button or link inside the row
                    if ((e.target as HTMLElement).closest("a, button")) return;
                    navigate({ to: "/sikayetler/$id", params: { id: String(c.id) } });
                  }}
                >
                  <TableCell className="font-mono text-xs font-semibold whitespace-nowrap uppercase">
                    {String(c.id).substring(0, 8).toUpperCase()}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      to="/sikayetler/$id"
                      params={{ id: String(c.id) }}
                      className="hover:underline text-primary font-semibold"
                    >
                      {c.citizen_name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.neighborhoods?.name}</div>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-2 text-sm">{c.complaint_text}</p>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{c.category}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{c.departments?.name}</span>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={c.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    <div>{new Date(c.created_at).toLocaleDateString("tr-TR")}</div>
                    <div className="font-semibold text-foreground/80">
                      {new Date(c.created_at).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/sikayetler/$id" params={{ id: String(c.id) }}>
                        İncele
                      </Link>
                    </Button>
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
