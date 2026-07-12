import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/turkish";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Switch } from "@/components/ui/switch";
import { getBotSettings, updateBotSettings } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/ayarlar")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Ayarlar — Belediye AI" }] }),
});

function Page() {
  const { profile, primaryRole, roles, user } = useAuth();
  const [full_name, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dept, setDept] = useState<string>("");

  const getSettings = useServerFn(getBotSettings);
  const updateSettings = useServerFn(updateBotSettings);
  const [selfChatOnly, setSelfChatOnly] = useState(true);
  
  const isBaskanOrAdmin = primaryRole === "baskan" || primaryRole === "admin";
  const [slaLimitHours, setSlaLimitHours] = useState(120);
  const [crisisLimitHours, setCrisisLimitHours] = useState(1);
  const [crisisLimitCount, setCrisisLimitCount] = useState(4);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const { data: botSettings, refetch: refetchSettings } = useQuery({
    queryKey: ["bot-settings"],
    queryFn: () => getSettings(),
  });

  useEffect(() => {
    if (botSettings) {
      setSelfChatOnly(botSettings.selfChatOnly ?? true);
      setSlaLimitHours(botSettings.slaLimitHours ?? 120);
      setCrisisLimitHours(botSettings.crisisLimitHours ?? 1);
      setCrisisLimitCount(botSettings.crisisLimitCount ?? 4);
    }
  }, [botSettings]);

  useEffect(() => { if (profile) { setFullName(profile.full_name ?? ""); setPhone(profile.phone ?? ""); setDept(profile.department_id ?? ""); } }, [profile]);

  const { data: departments } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });

  const save = async () => {
    const { error } = await supabase.from("profiles").update({ full_name, phone, department_id: dept || null }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Profil güncellendi");
  };

  const handleBotSettingsChange = async (checked: boolean) => {
    setSelfChatOnly(checked);
    try {
      const res = await updateSettings({ data: { selfChatOnly: checked } });
      if (res.success) {
        toast.success(checked ? "Test Modu Aktif: Bot sadece sizin mesajlarınıza cevap verecek." : "Canlı Mod Aktif: Bot tüm vatandaşların mesajlarına cevap verecek.");
        refetchSettings();
      } else {
        toast.error("Ayarlar kaydedilemedi: " + res.error);
        setSelfChatOnly(!checked);
      }
    } catch (e: any) {
      toast.error("Bir hata oluştu: " + e.message);
      setSelfChatOnly(!checked);
    }
  };

  const handleSaveThresholds = async () => {
    setIsSavingSettings(true);
    try {
      const res = await updateSettings({
        data: {
          slaLimitHours: Number(slaLimitHours),
          crisisLimitHours: Number(crisisLimitHours),
          crisisLimitCount: Number(crisisLimitCount),
        }
      });
      if (res.success) {
        toast.success("SLA ve Kriz eşik değerleri başarıyla güncellendi.");
        refetchSettings();
      } else {
        toast.error("Ayarlar kaydedilemedi: " + res.error);
      }
    } catch (e: any) {
      toast.error("Bir hata oluştu: " + e.message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div>
      <PageHeader title="Ayarlar" description="Profil bilgilerinizi güncelleyin." />
      <div className="grid gap-4 lg:grid-cols-2 max-w-4xl">
        <Card className="p-5 space-y-3">
          <h3 className="font-display font-semibold mb-2">Profil</h3>
          <div><Label>E-posta</Label><Input value={profile?.email ?? ""} disabled /></div>
          <div><Label>Ad Soyad</Label><Input value={full_name} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label>Telefon</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label>Müdürlük (opsiyonel)</Label>
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="">— Seçilmedi —</option>
              {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Müdürlük rolündeyseniz, atandığınız müdürlüğü seçin.</p>
          </div>
          <Button onClick={save}>Kaydet</Button>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-display font-semibold mb-2">Rol Bilgisi</h3>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Ana Rol:</span> <strong>{ROLE_LABELS[primaryRole]}</strong></div>
              <div><span className="text-muted-foreground">Tüm Roller:</span> {roles.map((r) => ROLE_LABELS[r]).join(", ")}</div>
              <p className="text-xs text-muted-foreground mt-3">
                Rol yükseltmesi için sistem yöneticinize başvurun. Roller <code>user_roles</code> tablosunda yönetilir.
              </p>
            </div>
          </Card>

          {isBaskanOrAdmin && (
            <Card className="p-5 space-y-4">
              <h3 className="font-display font-semibold mb-2 text-red-500">SLA & Kriz Eşik Değerleri</h3>
              
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold">SLA İhlal Limiti (Saat)</Label>
                  <Input 
                    type="number" 
                    value={slaLimitHours} 
                    onChange={(e) => setSlaLimitHours(Number(e.target.value))} 
                    className="mt-1"
                    min={1}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Yüksek öncelikli şikayetin kaç saat çözülmeden kalması durumunda SLA ihlali sayılacağını belirler (Örn: 120 saat = 5 gün, 4 saat).
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Bölgesel Kriz Analiz Penceresi (Saat)</Label>
                  <Input 
                    type="number" 
                    value={crisisLimitHours} 
                    onChange={(e) => setCrisisLimitHours(Number(e.target.value))} 
                    className="mt-1"
                    min={1}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Bölgesel kriz analizi için son kaç saatlik şikayetlerin taranacağını belirler (Örn: 1 saat, 4 saat).
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Bölgesel Kriz Şikayet Limit Adeti</Label>
                  <Input 
                    type="number" 
                    value={crisisLimitCount} 
                    onChange={(e) => setCrisisLimitCount(Number(e.target.value))} 
                    className="mt-1"
                    min={1}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Belirlenen analiz penceresinde aynı mahalle ve kategoriden en az kaç açık şikayet olursa kriz ilan edileceğini belirler (Örn: 4 adet).
                  </p>
                </div>

                <Button 
                  onClick={handleSaveThresholds} 
                  disabled={isSavingSettings}
                  className="w-full bg-red-600 hover:bg-red-700 text-white mt-2"
                >
                  {isSavingSettings ? "Kaydediliyor..." : "Limitleri Kaydet"}
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-5 space-y-3">
            <h3 className="font-display font-semibold mb-2 text-red-500">WhatsApp Bot Ayarları</h3>
            <div className="flex items-center justify-between rounded-md border p-3 bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold">Yalnızca Kendime Cevap Ver (Test Modu)</Label>
                <p className="text-xs text-muted-foreground max-w-[280px]">
                  Aktif olduğunda bot sadece sizin numaranızdan gönderilen mesajları işleme alır. Arkadaşlarınızın veya diğer vatandaşların mesajlarına yanıt vermez.
                </p>
              </div>
              <Switch checked={selfChatOnly} onCheckedChange={handleBotSettingsChange} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
