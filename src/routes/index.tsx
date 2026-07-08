import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Building2, ArrowRight, Bot, Crown, MessageSquare, Truck } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/panel" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display font-bold">Belediye AI Modülü</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">V1</div>
            </div>
          </div>
          <Link to="/auth" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Panele Giriş <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Yapay Zeka Destekli Belediye Yönetimi
          </div>
          <h1 className="font-display text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Vatandaş şikayetlerini <span className="text-accent">yapay zeka</span> ile yönlendirin.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Şikayetleri otomatik sınıflandırın, doğru müdürlüğe iletin, çözüm süresini takip edin ve
            başkanlık için gerçek zamanlı analitiklere erişin.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth" className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90">
              Hemen Başla <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: MessageSquare, title: "AI Şikayet Sınıflandırma", desc: "Kategoriyi, önceliği ve müdürlüğü otomatik tespit eder." },
            { icon: Crown, title: "Başkan Paneli", desc: "KPI kartları, grafikler ve günlük yönetim özeti." },
            { icon: Bot, title: "Başkan AI Bot", desc: "Doğal dille belediye verileri hakkında soru sorun." },
            { icon: Truck, title: "Araç & Personel Takibi", desc: "Bakım süreleri, geç girişler ve fazla mesai analizi." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <f.icon className="mb-3 h-6 w-6 text-accent" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
