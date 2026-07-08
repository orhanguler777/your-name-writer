import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { classifyComplaint } from "@/lib/ai.functions";
import { PageHeader } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CATEGORIES } from "@/lib/turkish";
import { toast } from "sonner";
import { Loader2, Bot } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/sikayet-olustur")({
  ssr: false,
  component: Create,
  head: () => ({ meta: [{ title: "Şikayet Oluştur — Belediye AI" }] }),
});

function Create() {
  const nav = useNavigate();
  const { user, profile } = useAuth();
  const classify = useServerFn(classifyComplaint);

  const { data: neighborhoods } = useQuery({
    queryKey: ["neighborhoods"],
    queryFn: async () => (await supabase.from("neighborhoods").select("id, name").order("name")).data ?? [],
  });
  const { data: departments } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });

  const [form, setForm] = useState({
    citizen_name: profile?.full_name ?? "",
    citizen_phone: profile?.phone ?? "",
    citizen_email: profile?.email ?? "",
    neighborhood_id: "",
    address: "",
    category: "",
    complaint_text: "",
    language: "tr",
    wants_human_representative: false,
  });
  const [aiResult, setAiResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const runClassify = async () => {
    if (form.complaint_text.trim().length < 10) return toast.error("Lütfen daha detaylı bir şikayet metni girin.");
    setLoading(true);
    try {
      const r = await classify({ data: { text: form.complaint_text } });
      setAiResult(r);
      if (!form.category) setForm({ ...form, category: r.category });
    } catch (e: any) {
      toast.error("Sınıflandırma yapılamadı", { description: e.message });
    } finally { setLoading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    let ai = aiResult;
    if (!ai) {
      try { ai = await classify({ data: { text: form.complaint_text } }); } catch {}
    }
    const aiDept = ai?.department ? departments?.find((d) => d.name === ai.department)?.id ?? null : null;
    const { data, error } = await supabase.from("complaints").insert({
      ...form,
      citizen_user_id: user?.id ?? null,
      neighborhood_id: form.neighborhood_id || null,
      category: form.category || ai?.category || "Diğer",
      ai_category: ai?.category,
      ai_department_id: aiDept,
      assigned_department_id: aiDept,
      ai_confidence_score: ai?.confidence,
      priority: ai?.priority ?? "orta",
      source: "web",
      status: "yeni",
    }).select("id").maybeSingle();
    if (error) { setSubmitting(false); return toast.error("Şikayet oluşturulamadı", { description: error.message }); }
    if (ai?.auto_response && data?.id) {
      await supabase.from("complaint_responses").insert({
        complaint_id: data.id, response_text: ai.auto_response, response_type: "otomatik",
      });
    }
    setSubmitting(false);
    toast.success("Şikayetiniz kaydedildi!");
    if (data?.id) nav({ to: "/sikayetler/$id", params: { id: data.id } });
  };

  return (
    <div>
      <PageHeader title="Yeni Şikayet Oluştur" description="Şikayet veya talebinizi iletin, yapay zeka otomatik sınıflandırma yapacaktır." />

      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Ad Soyad</Label><Input required value={form.citizen_name} onChange={(e) => setForm({ ...form, citizen_name: e.target.value })} /></div>
            <div><Label>Telefon</Label><Input value={form.citizen_phone} onChange={(e) => setForm({ ...form, citizen_phone: e.target.value })} /></div>
            <div><Label>E-posta</Label><Input type="email" value={form.citizen_email} onChange={(e) => setForm({ ...form, citizen_email: e.target.value })} /></div>
            <div>
              <Label>Mahalle</Label>
              <Select value={form.neighborhood_id} onValueChange={(v) => setForm({ ...form, neighborhood_id: v })}>
                <SelectTrigger><SelectValue placeholder="Mahalle seçin" /></SelectTrigger>
                <SelectContent>{neighborhoods?.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Adres</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Sokak, no, daire..." /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Kategori (opsiyonel — AI önerir)</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Otomatik" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dil</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tr">Türkçe</SelectItem>
                  <SelectItem value="en">İngilizce</SelectItem>
                  <SelectItem value="ar">Arapça</SelectItem>
                  <SelectItem value="de">Almanca</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Şikayet Metni</Label>
            <Textarea required rows={6} value={form.complaint_text} onChange={(e) => setForm({ ...form, complaint_text: e.target.value })}
              placeholder="Şikayetinizi detaylı bir şekilde anlatın..." />
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={runClassify} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Bot className="h-4 w-4 mr-1" />}
              AI ile Ön Sınıflandır
            </Button>
          </div>
          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch checked={form.wants_human_representative}
              onCheckedChange={(v) => setForm({ ...form, wants_human_representative: v })} />
            <Label>Gerçek temsilci ile görüşmek istiyorum</Label>
          </div>
          <Button type="submit" size="lg" disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Şikayeti Gönder"}
          </Button>
        </Card>

        <Card className="p-5 h-fit">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="h-5 w-5 text-accent" />
            <h3 className="font-display font-semibold">AI Önerisi</h3>
          </div>
          {!aiResult ? (
            <p className="text-sm text-muted-foreground">
              Şikayet metnini yazdıktan sonra "AI ile Ön Sınıflandır" butonuna basın; kategori, öncelik ve önerilen müdürlük burada görünecek.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Kategori</div><div className="font-medium">{aiResult.category}</div></div>
              <div><div className="text-xs text-muted-foreground">Önerilen Müdürlük</div><div className="font-medium">{aiResult.department}</div></div>
              <div><div className="text-xs text-muted-foreground">Öncelik</div><div className="font-medium">{aiResult.priority}</div></div>
              <div><div className="text-xs text-muted-foreground">Güven Skoru</div><div className="font-medium">%{Math.round((aiResult.confidence || 0) * 100)}</div></div>
              <div className="rounded-md bg-muted p-3 text-xs">
                <div className="mb-1 font-medium">Vatandaşa Otomatik Cevap:</div>
                <p>{aiResult.auto_response}</p>
              </div>
            </div>
          )}
        </Card>
      </form>
    </div>
  );
}
