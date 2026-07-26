import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, EmptyState } from "@/components/panel-primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  ShieldCheck,
  Globe,
  Search,
  Send,
  MessageSquare,
  Phone,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Filter,
  PieChart,
} from "lucide-react";
import { fetchCitizensData } from "@/lib/ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vatandaslar")({
  ssr: false,
  component: VatandaslarPage,
  head: () => ({ meta: [{ title: "Vatandaşlar & Segmentasyon — Belediye AI" }] }),
});

const LANGUAGE_LABELS: Record<string, { label: string; flag: string; bg: string }> = {
  tr: {
    label: "Türkçe",
    flag: "🇹🇷",
    bg: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  },
  ru: {
    label: "Русский (Rusça)",
    flag: "🇷🇺",
    bg: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  en: {
    label: "English (İngilizce)",
    flag: "🇬🇧",
    bg: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  },
  de: {
    label: "Deutsch (Almanca)",
    flag: "🇩🇪",
    bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  ar: {
    label: "العربية (Arapça)",
    flag: "🇦🇪",
    bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
};

function formatPhoneNumber(phone: string) {
  if (!phone) return "—";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 12 && cleaned.startsWith("90")) {
    return `+90 (${cleaned.slice(2, 5)}) ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10, 12)}`;
  }
  if (cleaned.length >= 13) {
    return `+${cleaned} (LID)`;
  }
  return `+${cleaned}`;
}

function VatandaslarPage() {
  const [search, setSearch] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [kvkkFilter, setKvkkFilter] = useState("all");

  const [selectedCitizen, setSelectedCitizen] = useState<any | null>(null);
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [campaignSegment, setCampaignSegment] = useState("ru");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");

  const getCitizens = useServerFn(fetchCitizensData);

  const {
    data: citizens = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["citizens-data", search, selectedLanguage, kvkkFilter],
    queryFn: () =>
      getCitizens({ data: { search, language: selectedLanguage, kvkkStatus: kvkkFilter } }),
    refetchInterval: 10000,
  });

  // İstatistikler (Tüm liste baz alınarak hesaplanır)
  const totalCount = citizens.length;
  const kvkkApprovedCount = citizens.filter((c) => c.kvkkAccepted).length;

  const langCounts = citizens.reduce((acc: Record<string, number>, c) => {
    const l = c.language || "tr";
    acc[l] = (acc[l] || 0) + 1;
    return acc;
  }, {});

  const russianCount = langCounts["ru"] || 0;
  const englishCount = langCounts["en"] || 0;
  const germanCount = langCounts["de"] || 0;

  const handleSendCampaign = () => {
    if (!campaignTitle.trim() || !campaignMessage.trim()) {
      toast.error("Lütfen kampanya/anket başlığı ve mesaj metnini doldurunuz.");
      return;
    }

    const targetLangName = LANGUAGE_LABELS[campaignSegment]?.label || campaignSegment;
    const targetCount = citizens.filter(
      (c) => campaignSegment === "all" || c.language === campaignSegment,
    ).length;

    toast.success(
      `🎯 "${campaignTitle}" anketi/mesajı ${targetCount} kişilik [${targetLangName}] segmentine başarıyla tanımlandı!`,
    );
    setIsCampaignDialogOpen(false);
    setCampaignTitle("");
    setCampaignMessage("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vatandaşlar & Dil Segmentasyonu"
        description="Sistemde kayıtlı tüm vatandaşların KVKK onay durumları, dillerine göre segmentasyonu ve hedef kitle anket gönderim merkezi."
      />

      {/* KPI Kartları */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-primary">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{totalCount}</div>
            <div className="text-xs text-muted-foreground">Kayıtlı Vatandaş</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-emerald-500">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{kvkkApprovedCount}</div>
            <div className="text-xs text-muted-foreground">KVKK Onaylı (Tam Ad-Soyad)</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-blue-500">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
            <Globe className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{russianCount + englishCount + germanCount}</div>
            <div className="text-xs text-muted-foreground">Yabancı Dilde İletişim (RU/EN/DE)</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-purple-500 bg-purple-50/30 dark:bg-purple-950/10">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <Button
              size="sm"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium shadow-sm"
              onClick={() => setIsCampaignDialogOpen(true)}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Segmente Anket Gönder
            </Button>
          </div>
        </Card>
      </div>

      {/* Filtre ve Arama Çubuğu */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Vatandaş adı, soyadı veya telefon numarası ile ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Dil Segmenti Sekmeleri */}
            <Tabs
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
              className="w-full md:w-auto"
            >
              <TabsList className="grid grid-cols-5 h-9 text-xs">
                <TabsTrigger value="all">Tümü ({totalCount})</TabsTrigger>
                <TabsTrigger value="tr">🇹🇷 TR ({langCounts["tr"] || 0})</TabsTrigger>
                <TabsTrigger value="ru">🇷🇺 RU ({russianCount})</TabsTrigger>
                <TabsTrigger value="en">🇬🇧 EN ({englishCount})</TabsTrigger>
                <TabsTrigger value="de">🇩🇪 DE ({germanCount})</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* KVKK Filtresi */}
            <Select value={kvkkFilter} onValueChange={setKvkkFilter}>
              <SelectTrigger className="w-[170px] h-9 text-xs">
                <SelectValue placeholder="KVKK Durumu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">KVKK: Tümü</SelectItem>
                <SelectItem value="approved">🛡️ KVKK Onaylı</SelectItem>
                <SelectItem value="pending">⚠️ Eksik İsim / Bekliyor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Vatandaş Listesi Tablosu */}
      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">
            Vatandaş listesi yükleniyor...
          </div>
        ) : citizens.length === 0 ? (
          <EmptyState
            title="Vatandaş Bulunamadı"
            description="Arama kriterlerinize uyan vatandaş kaydı bulunmamaktadır."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad ve Soyad</TableHead>
                <TableHead>Telefon Numarası</TableHead>
                <TableHead>Konuşulan Dil</TableHead>
                <TableHead>KVKK Durumu</TableHead>
                <TableHead>Şikayet/Talep</TableHead>
                <TableHead>Son Etkileşim</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {citizens.map((citizen: any) => {
                const langInfo = LANGUAGE_LABELS[citizen.language] || {
                  label: citizen.language?.toUpperCase() || "TR",
                  flag: "🌐",
                  bg: "bg-gray-100 text-gray-800",
                };

                return (
                  <TableRow key={citizen.phone} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-semibold">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                          {citizen.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div>{citizen.name}</div>
                          {citizen.lastAddress && (
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-normal truncate max-w-[200px]">
                              <MapPin className="h-3 w-3 flex-shrink-0" /> {citizen.lastAddress}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      <a
                        href={`https://wa.me/${citizen.phone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                        title="WhatsApp üzerinden sohbet aç"
                      >
                        <Phone className="h-3.5 w-3.5" /> {formatPhoneNumber(citizen.phone)}
                      </a>
                    </TableCell>

                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${langInfo.bg}`}
                      >
                        <span>{langInfo.flag}</span>
                        <span>{langInfo.label}</span>
                      </span>
                    </TableCell>

                    <TableCell>
                      {citizen.kvkkAccepted ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" /> KVKK Onaylı
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                          <AlertCircle className="mr-1 h-3 w-3" /> Onay Bekliyor
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <Badge variant="secondary" className="font-normal text-xs">
                        {citizen.complaintCount} Kayıt
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(citizen.lastActivity).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => setSelectedCitizen(citizen)}
                      >
                        Detaylar & Geçmiş
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Vatandaş Detay Modalı */}
      <Dialog open={!!selectedCitizen} onOpenChange={() => setSelectedCitizen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Vatandaş Profili
            </DialogTitle>
            <DialogDescription>
              Vatandaşın sistemdeki iletişim detayları, dili ve geçmiş başvuruları.
            </DialogDescription>
          </DialogHeader>

          {selectedCitizen && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-muted/40 p-4 rounded-lg">
                <div>
                  <div className="text-xs text-muted-foreground">Ad Soyad</div>
                  <div className="font-bold text-base">{selectedCitizen.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Telefon</div>
                  <div className="font-mono font-medium text-emerald-600 flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> +{selectedCitizen.phone}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tercih Edilen Dil</div>
                  <div className="font-medium mt-0.5">
                    {LANGUAGE_LABELS[selectedCitizen.language]?.flag}{" "}
                    {LANGUAGE_LABELS[selectedCitizen.language]?.label || selectedCitizen.language}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">KVKK Aydınlatma Onayı</div>
                  <div className="mt-0.5">
                    {selectedCitizen.kvkkAccepted ? (
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Tam Onaylı (6698 Sayılı Kanun)
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" /> Eksik İsim / Bekliyor
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-primary" /> Başvuru ve Şikayet Geçmişi (
                  {selectedCitizen.history?.length || 0})
                </h4>
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {selectedCitizen.history?.map((item: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-md text-xs space-y-1 bg-card">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          #{item.id?.substring(0, 8).toUpperCase()}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {item.status}
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground">{item.text}</p>
                      <div className="text-[10px] text-muted-foreground text-right">
                        {new Date(item.date).toLocaleString("tr-TR")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCitizen(null)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hedef Kitle Anket & İletim Gönderim Modalı */}
      <Dialog open={isCampaignDialogOpen} onOpenChange={setIsCampaignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <Sparkles className="h-5 w-5" /> Hedef Kitleye Anket & Mesaj Gönder
            </DialogTitle>
            <DialogDescription>
              Belirli dildeki vatandaş segmentini seçerek özel anket veya etkinlik duyurusu iletin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1 block">Hedef Vatandaş Segmenti</label>
              <Select value={campaignSegment} onValueChange={setCampaignSegment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌍 Tüm Vatandaşlar ({citizens.length} kişi)</SelectItem>
                  <SelectItem value="ru">🇷🇺 Rusça Konuşanlar ({russianCount} kişi)</SelectItem>
                  <SelectItem value="en">🇬🇧 İngilizce Konuşanlar ({englishCount} kişi)</SelectItem>
                  <SelectItem value="de">🇩🇪 Almanca Konuşanlar ({germanCount} kişi)</SelectItem>
                  <SelectItem value="tr">
                    🇹🇷 Türkçe Konuşanlar ({langCounts["tr"] || 0} kişi)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block">Kampanya / Anket Başlığı</label>
              <Input
                placeholder="Örn: Alanya Uluslararası Sanat Festivali Anketi"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold mb-1 block">
                WhatsApp Mesaj İçeriği (Hedef Dilde)
              </label>
              <textarea
                className="w-full h-24 p-2 text-xs border rounded-md focus:ring-1 focus:ring-purple-500 bg-background"
                placeholder="Örn: Sayın Alanya sakini, kentimizde düzenlenecek kültür etkinlikleri hakkındaki fikriniz bizim için önemlidir..."
                value={campaignMessage}
                onChange={(e) => setCampaignMessage(e.target.value)}
              />
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/40 p-3 rounded-lg border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200 flex items-start gap-2">
              <Sparkles className="h-4 w-4 flex-shrink-0 text-purple-600 mt-0.5" />
              <div>
                <strong>Hedef Kitle Erişimi:</strong> Bu mesaj, seçilen segmentteki{" "}
                <span className="font-bold">
                  {
                    citizens.filter(
                      (c) => campaignSegment === "all" || c.language === campaignSegment,
                    ).length
                  }
                </span>{" "}
                vatandaşa WhatsApp botu üzerinden doğrudan gönderilecektir.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCampaignDialogOpen(false)}>
              İptal
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleSendCampaign}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Segmente İlet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
