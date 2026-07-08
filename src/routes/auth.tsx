import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/panel" });
  },
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Giriş / Kayıt — Belediye AI Modülü" },
      { name: "description", content: "Belediye AI Modülü'ne giriş yapın veya yeni hesap oluşturun." },
    ],
  }),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [signUp, setSignUp] = useState({ fullName: "", email: "", password: "", phone: "" });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: signIn.email, password: signIn.password });
    setLoading(false);
    if (error) return toast.error("Giriş başarısız", { description: error.message });
    toast.success("Hoş geldiniz!");
    navigate({ to: "/panel" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signUp.email,
      password: signUp.password,
      options: {
        emailRedirectTo: `${window.location.origin}/panel`,
        data: { full_name: signUp.fullName, phone: signUp.phone },
      },
    });
    setLoading(false);
    if (error) return toast.error("Kayıt başarısız", { description: error.message });
    toast.success("Hesap oluşturuldu!", { description: "Giriş yapıldı." });
    navigate({ to: "/panel" });
  };

  return (
    <div className="flex min-h-screen">
      {/* Left brand */}
      <div className="hidden flex-1 flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display text-xl font-bold">Belediye AI Modülü</div>
            <div className="text-xs uppercase tracking-widest text-primary-foreground/70">Yönetim Paneli · V1</div>
          </div>
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Belediyenizi yapay zeka ile yönetin.
          </h1>
          <p className="text-primary-foreground/80">
            Vatandaş şikayetlerini otomatik sınıflandırın, doğru müdürlüğe yönlendirin, çözüm süresini kısaltın
            ve başkanlık için gerçek zamanlı analitikler elde edin.
          </p>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li className="flex gap-2"><span className="text-accent">●</span> AI destekli şikayet sınıflandırma</li>
            <li className="flex gap-2"><span className="text-accent">●</span> Rol bazlı müdürlük panelleri</li>
            <li className="flex gap-2"><span className="text-accent">●</span> Başkan için doğal dil sorguları</li>
            <li className="flex gap-2"><span className="text-accent">●</span> WhatsApp belge hattı simülasyonu</li>
          </ul>
        </div>
        <div className="text-xs text-primary-foreground/60">© Belediye AI Modülü — Demo Sürümü</div>
      </div>

      {/* Right form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">B</div>
              <span className="font-display font-bold">Belediye AI Modülü</span>
            </div>
          </div>
          <Tabs defaultValue="giris" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="giris">Giriş Yap</TabsTrigger>
              <TabsTrigger value="kayit">Kayıt Ol</TabsTrigger>
            </TabsList>

            <TabsContent value="giris">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="in-email">E-posta</Label>
                  <Input id="in-email" type="email" required value={signIn.email}
                    onChange={(e) => setSignIn({ ...signIn, email: e.target.value })} placeholder="ornek@belediye.gov.tr" />
                </div>
                <div>
                  <Label htmlFor="in-pass">Şifre</Label>
                  <Input id="in-pass" type="password" required value={signIn.password}
                    onChange={(e) => setSignIn({ ...signIn, password: e.target.value })} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Giriş Yap"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="kayit">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="up-name">Ad Soyad</Label>
                  <Input id="up-name" required value={signUp.fullName}
                    onChange={(e) => setSignUp({ ...signUp, fullName: e.target.value })} placeholder="Ahmet Yılmaz" />
                </div>
                <div>
                  <Label htmlFor="up-email">E-posta</Label>
                  <Input id="up-email" type="email" required value={signUp.email}
                    onChange={(e) => setSignUp({ ...signUp, email: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="up-phone">Telefon (opsiyonel)</Label>
                  <Input id="up-phone" value={signUp.phone}
                    onChange={(e) => setSignUp({ ...signUp, phone: e.target.value })} placeholder="0555 000 00 00" />
                </div>
                <div>
                  <Label htmlFor="up-pass">Şifre</Label>
                  <Input id="up-pass" type="password" required minLength={6} value={signUp.password}
                    onChange={(e) => setSignUp({ ...signUp, password: e.target.value })} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kayıt Ol"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Kayıt olan kullanıcılara varsayılan olarak Vatandaş rolü atanır. Rol yükseltmesi için sistem yöneticinize başvurun.
                </p>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">← Ana sayfaya dön</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
