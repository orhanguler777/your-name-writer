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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Send, Check, Plus, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { createMayorMessageServer } from "@/lib/adminMessages.functions";
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
  const createMessageFn = useServerFn(createMayorMessageServer);

  const { data: messages } = useQuery({
    queryKey: ["mayor-messages"],
    queryFn: async () => {
      const [{ data: msgs }, { data: profiles }, { data: userRoles }, { data: departments }] =
        await Promise.all([
          supabase
            .from("mayor_daily_messages")
            .select(
              "*, targets:mayor_daily_message_targets(id, department_id, is_read, read_at, departments(name))",
            )
            .order("created_at", { ascending: false }),
          supabase.from("profiles").select("id, full_name, email"),
          supabase.from("user_roles").select("user_id, role"),
          supabase.from("departments").select("id, name"),
        ]);

      const deptMap = new Map((departments ?? []).map((d) => [d.id, d.name]));

      // A user can have multiple roles in user_roles. Map user_id to their list of roles.
      const userRolesMap = new Map<string, string[]>();
      (userRoles ?? []).forEach((r) => {
        if (!userRolesMap.has(r.user_id)) {
          userRolesMap.set(r.user_id, []);
        }
        userRolesMap.get(r.user_id)!.push(r.role);
      });

      const profileMap = new Map(
        (profiles ?? []).map((p) => {
          const rolesList = userRolesMap.get(p.id) || ["vatandas"];

          // Prioritize roles: superuser/admin > baskan > mudur > zabita/zabita_memuru > cozum_masasi > vatandas
          let uRole = "vatandas";
          if (rolesList.includes("admin") || rolesList.includes("superuser")) {
            uRole = "superuser";
          } else if (rolesList.includes("baskan")) {
            uRole = "baskan";
          } else if (rolesList.includes("mudur") || rolesList.includes("mudurluk")) {
            uRole = "mudur";
          } else if (rolesList.includes("zabita") || rolesList.includes("zabita_memuru")) {
            uRole = "zabita_memuru";
          } else if (rolesList.includes("cozum_masasi")) {
            uRole = "cozum_masasi";
          }

          const roleLabel =
            uRole === "superuser"
              ? "Sistem Yöneticisi"
              : uRole === "baskan"
                ? "Belediye Başkanı"
                : uRole === "mudur"
                  ? "Zabıta Müdürü"
                  : uRole === "zabita_memuru"
                    ? "Zabıta Memuru"
                    : uRole === "cozum_masasi"
                      ? "Çözüm Masası Yetkilisi"
                      : "Vatandaş";

          return [p.id, { ...p, roleLabel }];
        }),
      );

      return (msgs ?? []).map((m) => ({
        ...m,
        sender: m.created_by ? profileMap.get(m.created_by) : null,
      }));
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["depts"],
    queryFn: async () =>
      (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "", priority: "normal", target: "all" });

  const create = async () => {
    if (!user?.id) return;
    try {
      const res = await createMessageFn({
        data: {
          title: f.title,
          body: f.body,
          priority: f.priority,
          createdBy: user.id,
          target: f.target,
        },
      });

      if (!res.success) {
        // Fallback to client-side insert if service role key is not configured or fails
        const { data: dataMsg, error: errorMsg } = await supabase
          .from("mayor_daily_messages")
          .insert({
            title: f.title,
            body: f.body,
            priority: f.priority,
            created_by: user.id,
          })
          .select("id")
          .maybeSingle();

        if (errorMsg || !dataMsg) throw new Error(errorMsg?.message || "Mesaj oluşturulamadı.");

        const targets =
          f.target === "all"
            ? (departments ?? [])
            : (departments?.filter((d) => d.id === f.target) ?? []);
        const { error: errorTar } = await supabase
          .from("mayor_daily_message_targets")
          .insert(targets.map((d) => ({ message_id: dataMsg.id, department_id: d.id })));

        if (errorTar) throw errorTar;
      }

      toast.success("Mesaj / Talimat başarıyla gönderildi");
      setOpen(false);
      setF({ title: "", body: "", priority: "normal", target: "all" });
      qc.invalidateQueries({ queryKey: ["mayor-messages"] });
    } catch (e: any) {
      toast.error("Hata oluştu: " + (e.message || e));
    }
  };

  const markRead = async (targetId: string) => {
    await supabase
      .from("mayor_daily_message_targets")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", targetId);
    qc.invalidateQueries({ queryKey: ["mayor-messages"] });
    toast.success("Okundu olarak işaretlendi");
  };

  // Can create message: SuperUser, Baskan, Baskan Yardımcısı, Admin or Department Managers (Müdür)
  // Not: "admin" rolü useAuth içinde "superuser"a normalize edilir, ayrıca aranmaz.
  const isManager = primaryRole === "mudur" || primaryRole === "mudurluk";
  const isExecutive =
    primaryRole === "baskan" || primaryRole === "baskan_yardimcisi" || primaryRole === "superuser";
  const canCreate = isExecutive || isManager;

  return (
    <div>
      <PageHeader
        title={
          isExecutive
            ? "Başkanlık & Yönetim Günlük Mesajları"
            : "Birim İçi Görev Talimatları & Mesajlar"
        }
        description={
          isExecutive
            ? "Müdürlüklere ve tüm ekiplere gönderilen toplu duyurular, genelgeler ve talimatlar."
            : "Birim amirlerinin saha personeline ve ekiplerine ilettiği anlık görev talimatları."
        }
        actions={
          canCreate && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />{" "}
                  {isExecutive ? "Yeni Genelge / Mesaj" : "Saha Görev Talimatı Ver"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {isExecutive
                      ? "Yeni Başkanlık / Yönetim Mesajı"
                      : "Birim İçi Görev Talimatı Oluştur"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Talimat / Mesaj Başlığı</Label>
                    <Input
                      value={f.title}
                      onChange={(e) => setF({ ...f, title: e.target.value })}
                      placeholder="Örn: Hafta Sonu Sahil Denetimi"
                    />
                  </div>
                  <div>
                    <Label>Detaylı Açıklama & Talimatlar</Label>
                    <Textarea
                      rows={4}
                      value={f.body}
                      onChange={(e) => setF({ ...f, body: e.target.value })}
                      placeholder="Saha personelinin yapması gereken işlemler..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Öncelik</Label>
                      <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="onemli">Önemli</SelectItem>
                          <SelectItem value="acil">🚨 Acil Görev</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Hedef Birim / Ekip</Label>
                      <Select value={f.target} onValueChange={(v) => setF({ ...f, target: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {isExecutive ? (
                            <>
                              <SelectItem value="all">Tüm Müdürlükler & Ekipler</SelectItem>
                              {departments?.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </>
                          ) : (
                            <>
                              <SelectItem value="all">
                                Tüm Birim Personelleri (Saha Ekipleri)
                              </SelectItem>
                              {profile?.department_id &&
                                departments
                                  ?.filter((d) => d.id === profile.department_id)
                                  .map((d) => (
                                    <SelectItem key={d.id} value={d.id}>
                                      {d.name} (Kendi Birimim)
                                    </SelectItem>
                                  ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={create} className="w-full">
                    <Send className="h-4 w-4 mr-1" /> Talimatı Gönder
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="space-y-4">
        {(() => {
          // Managers & Executives can see all messages.
          // Field workers (like zabita_memuru) should only see messages that target their department.
          const filteredMessages =
            messages?.filter((m: any) => {
              if (isExecutive || isManager) return true;
              if (!profile?.department_id) return false;
              return m.targets.some((t: any) => t.department_id === profile.department_id);
            }) || [];

          if (filteredMessages.length === 0) {
            return (
              <EmptyState
                title="Henüz mesaj veya talimat yok"
                description="Yöneticiniz veya amiriniz yeni bir talimat gönderdiğinde burada listelenecektir."
                icon={MessageSquare}
              />
            );
          }

          return filteredMessages.map((m: any) => {
            const myTarget = profile?.department_id
              ? m.targets.find((t: any) => t.department_id === profile.department_id)
              : null;
            const readCount = m.targets.filter((t: any) => t.is_read).length;
            const displayName = m.sender?.full_name || m.sender?.email || "Yönetim/Sistem";
            const roleSuffix = m.sender?.roleLabel ? ` (${m.sender.roleLabel})` : "";
            const senderNameWithRole = `${displayName}${roleSuffix}`;
            return (
              <Card key={m.id} className="p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display font-semibold text-base">{m.title}</h3>
                      <Badge className={PRIO_STYLE[m.priority]}>
                        {m.priority === "acil"
                          ? "🚨 Acil"
                          : m.priority === "onemli"
                            ? "Önemli"
                            : "Normal"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-primary/80">
                        Gönderen: {senderNameWithRole}
                      </span>
                      <span className="text-muted-foreground/60">•</span>
                      <span>{new Date(m.created_at).toLocaleString("tr-TR")}</span>
                    </div>
                  </div>
                  {myTarget && !myTarget.is_read && (
                    <Button size="sm" variant="outline" onClick={() => markRead(myTarget.id)}>
                      <Check className="h-3 w-3 mr-1" /> Görevi Al / Okundu
                    </Button>
                  )}
                  {myTarget?.is_read && (
                    <Badge
                      variant="secondary"
                      className="bg-emerald-500/15 text-emerald-600 font-semibold"
                    >
                      ✓ Görev Alındı
                    </Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap text-foreground/90 my-3">{m.body}</p>
                {canCreate && (
                  <div className="mt-3 text-xs text-muted-foreground font-medium flex items-center gap-2">
                    <span>Okunma Durumu:</span>
                    <span className="font-bold text-foreground">
                      {readCount}/{m.targets.length} Birim / Personel
                    </span>
                  </div>
                )}
              </Card>
            );
          });
        })()}
      </div>
    </div>
  );
}
