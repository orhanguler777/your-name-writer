import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, PriorityBadge } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_LABELS, LANGUAGES } from "@/lib/turkish";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bot, MapPin, Phone, Mail, User, Check, ArrowRightLeft, Send, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/sikayetler/$id")({
  ssr: false,
  component: Detail,
  head: () => ({ meta: [{ title: "Şikayet Detayı — Belediye AI" }] }),
});

function Detail() {
  const { id } = useParams({ from: "/_authenticated/sikayetler/$id" });
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();

  const { data: c, isLoading } = useQuery({
    queryKey: ["complaint", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("*, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name, id), ai_dept:departments!complaints_ai_department_id_fkey(name, id)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });

  const { data: responses } = useQuery({
    queryKey: ["responses", id],
    queryFn: async () => (await supabase.from("complaint_responses").select("*").eq("complaint_id", id).order("created_at")).data ?? [],
  });

  const [response, setResponse] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const canManage = hasAnyRole("admin", "baskan", "cozum_masasi", "mudurluk");

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from("complaints").update({ status, resolved_at: status === "cozuldu" ? new Date().toISOString() : null }).eq("id", id);
    if (error) return toast.error("Güncellenemedi", { description: error.message });
    toast.success("Durum güncellendi");
    qc.invalidateQueries({ queryKey: ["complaint", id] });
  };

  const acceptAiSuggestion = async () => {
    if (!c?.ai_department_id) return;
    const { error } = await supabase.from("complaints").update({ assigned_department_id: c.ai_department_id, status: "incelemede" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("AI önerisi kabul edildi ve müdürlüğe atandı");
    qc.invalidateQueries({ queryKey: ["complaint", id] });
  };

  const transferDepartment = async () => {
    if (!newDept) return;
    const oldDept = c?.assigned_department_id;
    const { error } = await supabase.from("complaints").update({ assigned_department_id: newDept }).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("complaint_assignment_feedback").insert({
      complaint_id: id, old_department_id: oldDept, new_department_id: newDept,
      corrected_by: user?.id, reason: "Manuel müdürlük değişikliği",
    });
    toast.success("Bu düzeltme, yapay zeka yönlendirme modelini iyileştirmek için kaydedildi.");
    qc.invalidateQueries({ queryKey: ["complaint", id] });
    setNewDept("");
  };

  const sendResponse = async () => {
    if (!response.trim()) return;
    const { error } = await supabase.from("complaint_responses").insert({
      complaint_id: id, response_text: response, responder_id: user?.id, response_type: "manuel",
    });
    if (error) return toast.error(error.message);
    toast.success("Cevap gönderildi");
    setResponse("");
    qc.invalidateQueries({ queryKey: ["responses", id] });
  };

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor...</div>;
  if (!c) return <div className="p-8 text-center">Şikayet bulunamadı.</div>;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to="/sikayetler"><ArrowLeft className="h-4 w-4 mr-1" /> Şikayetler</Link>
      </Button>

      <PageHeader
        title={`Şikayet #${(c.id as string).slice(0, 8)}`}
        description={`${(c as any).neighborhoods?.name ?? "—"} · ${new Date(c.created_at as string).toLocaleString("tr-TR")}`}
        actions={<><StatusBadge status={c.status as string} /><PriorityBadge priority={c.priority as string} /></>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-2 font-semibold">Şikayet Metni</h3>
            <p className="whitespace-pre-wrap text-sm">{c.complaint_text}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-2 py-1">Kategori: {c.category}</span>
              <span className="rounded bg-muted px-2 py-1">Kaynak: {c.source}</span>
              <span className="rounded bg-muted px-2 py-1">Dil: {LANGUAGES[c.language as string] ?? c.language}</span>
            </div>
          </Card>

          {/* AI Classification Card */}
          <Card className="p-5 border-accent/40 bg-accent/5">
            <div className="mb-3 flex items-center gap-2">
              <Bot className="h-5 w-5 text-accent" />
              <h3 className="font-display font-semibold">Yapay Zeka Sınıflandırma Sonucu</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><div className="text-xs text-muted-foreground">Tespit Edilen Kategori</div><div className="font-medium">{c.ai_category ?? c.category}</div></div>
              <div><div className="text-xs text-muted-foreground">Önerilen Müdürlük</div><div className="font-medium">{(c as any).ai_dept?.name ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Güven Skoru</div><div className="font-medium">%{Math.round((Number(c.ai_confidence_score) || 0) * 100)}</div></div>
              <div><div className="text-xs text-muted-foreground">Öncelik</div><PriorityBadge priority={c.priority as string} /></div>
            </div>
            {canManage && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={acceptAiSuggestion}><Check className="h-4 w-4 mr-1" /> AI Önerisini Kabul Et</Button>
                <Select value={newDept} onValueChange={setNewDept}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Müdürlüğü değiştir..." /></SelectTrigger>
                  <SelectContent>{departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={transferDepartment} disabled={!newDept}>
                  <ArrowRightLeft className="h-4 w-4 mr-1" /> Aktar
                </Button>
              </div>
            )}
          </Card>

          {/* Responses */}
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Cevaplar ve Notlar</h3>
            <div className="space-y-3">
              {responses?.map((r) => (
                <div key={r.id} className="rounded-md border bg-muted/30 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{r.response_type === "otomatik" ? "AI Otomatik Cevap" : "Belediye"}</span>
                    <span>{new Date(r.created_at).toLocaleString("tr-TR")}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{r.response_text}</p>
                </div>
              ))}
              {(!responses || responses.length === 0) && <p className="text-sm text-muted-foreground">Henüz cevap yok.</p>}
            </div>
            {canManage && (
              <div className="mt-4 space-y-2">
                <Textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Vatandaşa cevap yazın..." />
                <Button size="sm" onClick={sendResponse}><Send className="h-4 w-4 mr-1" /> Cevap Gönder</Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Vatandaş Bilgileri</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />{c.citizen_name}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{c.citizen_phone ?? "—"}</div>
              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{c.citizen_email ?? "—"}</div>
              <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" /><span>{c.address}</span></div>
              {(c.wants_human_representative as boolean) && (
                <div className="rounded-md bg-priority-medium/10 border border-priority-medium/30 p-2 text-priority-medium text-xs">
                  Vatandaş gerçek temsilci ile görüşmek istiyor.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Atama & Durum</h3>
            <div className="space-y-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Atanan Müdürlük</div><div className="font-medium">{(c as any).departments?.name ?? "—"}</div></div>
              {canManage && (
                <div className="space-y-2">
                  <Select value={newStatus} onValueChange={(v) => { setNewStatus(v); updateStatus(v); }}>
                    <SelectTrigger><SelectValue placeholder="Durum güncelle..." /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
