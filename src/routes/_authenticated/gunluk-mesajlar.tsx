import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Send, Check, Plus, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gunluk-mesajlar")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Günlük Mesajlar — Belediye AI" }] }),
});

const PRIO_STYLE: Record<string, string> = {
  normal: "bg-status-yeni/15 text-status-yeni",
  onemli: "bg-priority-medium/15 text-priority-medium",
  acil: "bg-destructive/15 text-destructive",
};

function Page() {
  const qc = useQueryClient();
  const { user, primaryRole, profile } = useAuth();

  const { data: messages } = useQuery({
    queryKey: ["mayor-messages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mayor_daily_messages")
        .select("*, targets:mayor_daily_message_targets(id, department_id, is_read, read_at, departments(name))")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["depts"],
    queryFn: async () => (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "", priority: "normal", target: "all" });

  const create = async () => {
    const { data, error } = await supabase.from("mayor_daily_messages").insert({
      title: f.title, body: f.body, priority: f.priority, created_by: user?.id,
    }).select("id").maybeSingle();
    if (error || !data) return toast.error(error?.message ?? "Hata");
    const targets = f.target === "all" ? departments ?? [] : departments?.filter((d) => d.id === f.target) ?? [];
    await supabase.from("mayor_daily_message_targets").insert(targets.map((d) => ({ message_id: data.id, department_id: d.id })));
    toast.success("Mesaj gönderildi");
    setOpen(false); setF({ title: "", body: "", priority: "normal", target: "all" });
    qc.invalidateQueries({ queryKey: ["mayor-messages"] });
  };

  const markRead = async (targetId: string) => {
    await supabase.from("mayor_daily_message_targets").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", targetId);
    qc.invalidateQueries({ queryKey: ["mayor-messages"] });
    toast.success("Okundu olarak işaretlendi");
  };

  const canCreate = primaryRole === "baskan" || primaryRole === "admin";

  return (
    <div>
      <PageHeader
        title="Başkan Günlük Mesajları"
        description="Başkanın müdürlüklere gönderdiği toplu duyurular ve talimatlar."
        actions={
          canCreate && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Yeni Mesaj</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Yeni Günlük Mesaj</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Başlık</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
                  <div><Label>İçerik</Label><Textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Öncelik</Label>
                      <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="onemli">Önemli</SelectItem>
                          <SelectItem value="acil">Acil</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Hedef</Label>
                      <Select value={f.target} onValueChange={(v) => setF({ ...f, target: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tüm Müdürlükler</SelectItem>
                          {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={create} className="w-full"><Send className="h-4 w-4 mr-1" /> Gönder</Button>
                </div>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="space-y-4">
        {!messages || messages.length === 0 ? (
          <EmptyState title="Henüz mesaj yok" description="Başkan yeni bir mesaj gönderdiğinde burada listelenecektir." icon={MessageSquare} />
        ) : messages.map((m: any) => {
          const myTarget = profile?.department_id ? m.targets.find((t: any) => t.department_id === profile.department_id) : null;
          const readCount = m.targets.filter((t: any) => t.is_read).length;
          return (
            <Card key={m.id} className="p-5">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-semibold">{m.title}</h3>
                    <Badge className={PRIO_STYLE[m.priority]}>{m.priority === "acil" ? "Acil" : m.priority === "onemli" ? "Önemli" : "Normal"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString("tr-TR")}</div>
                </div>
                {myTarget && !myTarget.is_read && (
                  <Button size="sm" variant="outline" onClick={() => markRead(myTarget.id)}><Check className="h-3 w-3 mr-1" /> Okundu</Button>
                )}
                {myTarget?.is_read && <Badge variant="secondary">Okundu</Badge>}
              </div>
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              {canCreate && (
                <div className="mt-3 text-xs text-muted-foreground">
                  {readCount}/{m.targets.length} müdürlük okudu
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
