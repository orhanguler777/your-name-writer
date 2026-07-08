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
      </div>
    </div>
  );
}
