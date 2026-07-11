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
import { ArrowLeft, Bot, MapPin, Phone, Mail, User, Check, ArrowRightLeft, Send, MessageSquare, Clock } from "lucide-react";
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
  const [newPriority, setNewPriority] = useState("");

  const canManage = hasAnyRole("admin", "baskan", "cozum_masasi", "mudurluk");

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from("complaints").update({ status, resolved_at: status === "cozuldu" ? new Date().toISOString() : null }).eq("id", id);
    if (error) return toast.error("Güncellenemedi", { description: error.message });
    toast.success("Durum güncellendi");
    
    // Şikayet çözüldü yapıldıysa, botun express sunucusuna webhook fırlat
    if (status === "cozuldu") {
      fetch("http://localhost:3001/webhook/resolved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId: id })
      }).catch(err => {
        console.warn("Otomatik WhatsApp bildirim webhook hatası (bot açık olmayabilir):", err);
      });
    }

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

  const updatePriority = async () => {
    if (!newPriority) return;
    const oldPrio = c?.priority;
    const { error } = await supabase.from("complaints").update({ priority: newPriority }).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("complaint_assignment_feedback").insert({
      complaint_id: id, corrected_by: user?.id, reason: `Öncelik değişimi: ${oldPrio} -> ${newPriority}`,
    });
    toast.success("Öncelik güncellendi ve AI eğitimi için kaydedildi.");
    qc.invalidateQueries({ queryKey: ["complaint", id] });
    setNewPriority("");
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

      {/* ── Timeline Bar ── */}
      <TimelineBar complaint={c} responses={responses ?? []} />

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

          {/* AI Classification & Actions Card */}
          <Card className="p-5">
            <div className="relative">
              <div className="mb-4 flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-display font-semibold">Yapay Zeka Sınıflandırma ve Aktarım</h3>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 mb-4">
                <div className="bg-background/60 p-3 rounded-md border"><div className="text-xs text-muted-foreground mb-1">Tespit Edilen Kategori</div><div className="font-medium">{c.ai_category ?? c.category}</div></div>
                <div className="bg-background/60 p-3 rounded-md border"><div className="text-xs text-muted-foreground mb-1">Önerilen Müdürlük</div><div className="font-medium">{(c as any).ai_dept?.name ?? "—"}</div></div>
                <div className="bg-background/60 p-3 rounded-md border"><div className="text-xs text-muted-foreground mb-1">Güven Skoru</div><div className="font-medium">%{Math.round((Number(c.ai_confidence_score) || 0) * 100)}</div></div>
                <div className="bg-background/60 p-3 rounded-md border"><div className="text-xs text-muted-foreground mb-1">Öncelik Seviyesi</div><PriorityBadge priority={c.priority as string} /></div>
              </div>
              
              {canManage && (
                <div className="flex flex-col gap-3 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={acceptAiSuggestion} className="bg-green-600 hover:bg-green-700 text-white">
                      <Check className="h-4 w-4 mr-1" /> AI Atamasını Onayla
                    </Button>
                  </div>
                  
                  <div className="grid sm:grid-cols-2 gap-3 mt-2">
                    <div className="flex gap-2 p-3 bg-background/80 rounded-md border">
                      <Select value={newDept} onValueChange={setNewDept}>
                        <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Farklı Birime Aktar..." /></SelectTrigger>
                        <SelectContent>{departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={transferDepartment} disabled={!newDept}>
                        Aktar
                      </Button>
                    </div>
                    
                    <div className="flex gap-2 p-3 bg-background/80 rounded-md border">
                      <Select value={newPriority} onValueChange={setNewPriority}>
                        <SelectTrigger className="w-full bg-background"><SelectValue placeholder="Önceliği Değiştir..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Yüksek">Yüksek</SelectItem>
                          <SelectItem value="Orta">Orta</SelectItem>
                          <SelectItem value="Düşük">Düşük</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" onClick={updatePriority} disabled={!newPriority}>
                        Kaydet
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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

          <Card className="p-6 border-0 bg-slate-900 text-slate-50 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 bg-slate-800/50 rounded-bl-full -mr-4 -mt-4" />
            <div className="relative">
              <h3 className="mb-4 font-display font-semibold text-lg flex items-center gap-2 text-white">
                <Check className="h-5 w-5" /> Atama & Durum Aksiyonu
              </h3>
              <div className="space-y-4 text-sm">
                <div className="bg-white p-3 rounded-md shadow-sm">
                  <div className="text-xs text-slate-500 mb-1">Şu An Atanan Müdürlük</div>
                  <div className="font-semibold text-slate-900">{(c as any).departments?.name ?? "—"}</div>
                </div>
                {canManage && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-medium text-slate-300">Durumu Güncelle</div>
                    <div className="flex gap-2">
                      <Select value={newStatus} onValueChange={setNewStatus}>
                        <SelectTrigger className="w-full bg-white border-transparent text-slate-900 h-10 shadow-sm"><SelectValue placeholder="Yeni durumu seçin..." /></SelectTrigger>
                        <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="font-medium">{v}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button onClick={() => updateStatus(newStatus)} disabled={!newStatus} className="bg-white hover:bg-slate-100 text-slate-900 shadow-sm shrink-0 font-medium">
                        Kaydet
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineBar({ complaint, responses }: { complaint: any; responses: any[] }) {
  const created = new Date(complaint.created_at);
  const isResolved = complaint.status === "cozuldu";
  const resolvedAt = complaint.resolved_at ? new Date(complaint.resolved_at) : null;

  // Build timeline events
  const events: { label: string; date: Date; type: "created" | "response" | "resolved" | "status" }[] = [
    { label: "Şikayet Oluşturuldu", date: created, type: "created" },
  ];

  responses.forEach((r) => {
    events.push({
      label: r.response_type === "otomatik" ? "AI Otomatik Cevap" : "Belediye Yanıtı",
      date: new Date(r.created_at),
      type: "response",
    });
  });

  if (isResolved && resolvedAt) {
    events.push({ label: "Çözüldü", date: resolvedAt, type: "resolved" });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  const totalElapsed = (resolvedAt ?? new Date()).getTime() - created.getTime();
  const totalLabel = formatDuration(totalElapsed);

  const dotColor: Record<string, string> = {
    created: "bg-primary",
    response: "bg-accent",
    resolved: "bg-green-500",
    status: "bg-priority-medium",
  };

  return (
    <Card className="p-4 mb-4 overflow-x-auto">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Şikayet Zaman Çizelgesi</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          Toplam Süre: <span className="font-semibold text-foreground">{totalLabel}</span>
          {!isResolved && " (devam ediyor)"}
        </span>
      </div>

      <div className="relative flex items-start gap-0 min-w-max">
        {events.map((ev, i) => {
          const elapsed = i > 0 ? ev.date.getTime() - events[i - 1].date.getTime() : 0;
          return (
            <div key={i} className="flex items-start">
              {/* connector line */}
              {i > 0 && (
                <div className="flex flex-col items-center mt-2 mx-1">
                  <div className="h-0.5 w-12 bg-border" />
                  <span className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">{formatDuration(elapsed)}</span>
                </div>
              )}
              {/* dot + label */}
              <div className="flex flex-col items-center min-w-[90px]">
                <div className={`h-4 w-4 rounded-full ${dotColor[ev.type]} border-2 border-background shadow-sm shrink-0`} />
                <div className="mt-1 text-center">
                  <div className="text-[11px] font-medium leading-tight whitespace-nowrap">{ev.label}</div>
                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {ev.date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })}{" "}
                    {ev.date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* current status if not resolved */}
        {!isResolved && (
          <div className="flex items-start">
            <div className="flex flex-col items-center mt-2 mx-1">
              <div className="h-0.5 w-12 bg-border border-dashed" />
            </div>
            <div className="flex flex-col items-center min-w-[90px]">
              <div className="h-4 w-4 rounded-full bg-priority-medium border-2 border-background shadow-sm animate-pulse shrink-0" />
              <div className="mt-1 text-center">
                <div className="text-[11px] font-medium leading-tight whitespace-nowrap text-priority-medium">
                  {STATUS_LABELS[complaint.status] ?? complaint.status}
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">Şu an</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}s ${minutes % 60}dk`;
  const days = Math.floor(hours / 24);
  return `${days}g ${hours % 24}s`;
}
