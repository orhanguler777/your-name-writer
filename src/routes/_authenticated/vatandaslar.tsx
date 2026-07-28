import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
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
import {
  fetchCitizenNeighborhoodMap,
  fetchNeighborhoodCitizens,
  fetchNeighborhoodOverview,
  fetchNeighborhoodSegments,
  setCitizenNeighborhoods,
  type NeighborhoodCitizen,
  type NeighborhoodOverview,
  type NeighborhoodSegment,
} from "@/lib/citizens.functions";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [viewMode, setViewMode] = useState<"liste" | "mahalle">("liste");

  const [selectedCitizen, setSelectedCitizen] = useState<any | null>(null);
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [campaignSegment, setCampaignSegment] = useState("ru");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");

  const getCitizens = useServerFn(fetchCitizensData);
  const getHoodMap = useServerFn(fetchCitizenNeighborhoodMap);
  const getHoodSegments = useServerFn(fetchNeighborhoodSegments);
  const saveHoods = useServerFn(setCitizenNeighborhoods);

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

  // Telefon → bağlı olduğu mahalleler. Duyuru segmentasyonunun kaynağı budur.
  const { data: hoodMap = {}, refetch: refetchHoodMap } = useQuery({
    queryKey: ["citizen-neighborhood-map"],
    queryFn: () => getHoodMap({}),
  });

  // Mahalle düzenleme modalı
  const [editingHoodsFor, setEditingHoodsFor] = useState<any | null>(null);
  const [draftHoodIds, setDraftHoodIds] = useState<string[]>([]);
  const [hoodSearch, setHoodSearch] = useState("");
  const [savingHoods, setSavingHoods] = useState(false);

  const { data: allHoods = [] } = useQuery<NeighborhoodSegment[]>({
    queryKey: ["neighborhood-segments"],
    queryFn: () => getHoodSegments({}),
    enabled: !!editingHoodsFor,
  });

  const openHoodEditor = (citizen: any) => {
    setDraftHoodIds((hoodMap[citizen.phone] ?? []).map((h) => h.id));
    setHoodSearch("");
    setEditingHoodsFor(citizen);
  };

  const commitHoods = async () => {
    if (!editingHoodsFor) return;
    setSavingHoods(true);
    try {
      const r = await saveHoods({
        data: { phone: editingHoodsFor.phone, neighborhoodIds: draftHoodIds },
      });
      if (!r.ok) throw new Error(r.error || "Kaydedilemedi");
      toast.success("Vatandaşın mahalleleri güncellendi.");
      setEditingHoodsFor(null);
      await refetchHoodMap();
    } catch (e: any) {
      toast.error("Mahalleler kaydedilemedi: " + e.message);
    } finally {
      setSavingHoods(false);
    }
  };

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

      {/* Görünüm Seçimi */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "liste" | "mahalle")}>
        <TabsList className="h-9 text-xs">
          <TabsTrigger value="liste">
            <Users className="mr-1.5 h-3.5 w-3.5" /> Vatandaş Listesi
          </TabsTrigger>
          <TabsTrigger value="mahalle">
            <MapPin className="mr-1.5 h-3.5 w-3.5" /> Mahalleye Göre
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {viewMode === "mahalle" ? (
        <NeighborhoodView />
      ) : (
        <>
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
                    <TableHead>Mahalle (Duyuru Segmenti)</TableHead>
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
                          <div className="flex flex-wrap items-center gap-1 max-w-[260px]">
                            {(hoodMap[citizen.phone] ?? []).length === 0 ? (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            ) : (
                              (hoodMap[citizen.phone] ?? []).map((h) => (
                                <Badge
                                  key={h.id}
                                  variant="outline"
                                  className="text-[10px] font-normal bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300"
                                >
                                  {h.name}
                                </Badge>
                              ))
                            )}
                            <button
                              type="button"
                              onClick={() => openHoodEditor(citizen)}
                              className="text-[10px] text-muted-foreground hover:text-foreground underline ml-0.5"
                              title="Bu vatandaşın mahallelerini düzenle"
                            >
                              düzenle
                            </button>
                          </div>
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
        </>
      )}

      {/* Mahalle Düzenleme Modalı */}
      <Dialog open={!!editingHoodsFor} onOpenChange={(o) => !o && setEditingHoodsFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-sky-600" />
              Mahalle Bağları
            </DialogTitle>
            <DialogDescription>
              {editingHoodsFor?.name} ({formatPhoneNumber(editingHoodsFor?.phone ?? "")}) bu
              mahallelere gönderilen duyuruları alır. Şikayetlerden otomatik gelen yanlış bağları
              buradan kaldırabilirsiniz.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
              <Input
                placeholder="Mahalle ara..."
                value={hoodSearch}
                onChange={(e) => setHoodSearch(e.target.value)}
                className="pl-8 text-sm"
              />
            </div>

            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {allHoods
                .filter((h) =>
                  hoodSearch.trim()
                    ? h.name.toLocaleLowerCase("tr").includes(hoodSearch.toLocaleLowerCase("tr"))
                    : true,
                )
                .map((h) => (
                  <label
                    key={h.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={draftHoodIds.includes(h.id)}
                      onCheckedChange={(v) =>
                        setDraftHoodIds((prev) =>
                          v ? [...prev, h.id] : prev.filter((id) => id !== h.id),
                        )
                      }
                    />
                    <span className="flex-1">{h.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {h.citizenCount} vatandaş
                    </span>
                  </label>
                ))}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {draftHoodIds.length} mahalle seçili.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingHoodsFor(null)}>
              İptal
            </Button>
            <Button onClick={commitHoods} disabled={savingHoods}>
              {savingHoods ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

/**
 * Mahalle kırılımı görünümü.
 *
 * Duyuru segmentasyonunun kaynağı olan citizen_neighborhoods bağlarını mahalle
 * mahalle gösterir; satır açıldığında o mahalleye kayıtlı vatandaşlar listelenir.
 */
function NeighborhoodView() {
  const getOverview = useServerFn(fetchNeighborhoodOverview);
  const getHoodCitizens = useServerFn(fetchNeighborhoodCitizens);

  const [hoodSearch, setHoodSearch] = useState("");
  const [onlyWithCitizens, setOnlyWithCitizens] = useState(true);
  const [openHoodId, setOpenHoodId] = useState<string | null>(null);

  const { data: hoods = [], isLoading } = useQuery<NeighborhoodOverview[]>({
    queryKey: ["neighborhood-overview"],
    queryFn: () => getOverview({}),
  });

  const { data: hoodCitizens = [], isFetching: citizensLoading } = useQuery<NeighborhoodCitizen[]>({
    queryKey: ["neighborhood-citizens", openHoodId],
    queryFn: () => getHoodCitizens({ data: { neighborhoodId: openHoodId as string } }),
    enabled: !!openHoodId,
  });

  const visible = hoods.filter((h) => {
    if (onlyWithCitizens && h.citizenCount === 0 && h.complaintCount === 0) return false;
    if (!hoodSearch.trim()) return true;
    return h.name.toLocaleLowerCase("tr").includes(hoodSearch.toLocaleLowerCase("tr"));
  });

  const kayitliMahalle = hoods.filter((h) => h.citizenCount > 0).length;
  const toplamSikayet = hoods.reduce((a, h) => a + h.complaintCount, 0);
  const toplamAcik = hoods.reduce((a, h) => a + h.openComplaintCount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-sky-500">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
            <MapPin className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{hoods.length}</div>
            <div className="text-xs text-muted-foreground">Toplam Mahalle</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-emerald-500">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{kayitliMahalle}</div>
            <div className="text-xs text-muted-foreground">Kayıtlı Vatandaşı Olan Mahalle</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-amber-500">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{toplamAcik}</div>
            <div className="text-xs text-muted-foreground">Açık Şikayet</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3 border-l-4 border-l-primary">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-bold">{toplamSikayet}</div>
            <div className="text-xs text-muted-foreground">Toplam Şikayet</div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Mahalle ara... (örn. Kadıpaşa)"
              value={hoodSearch}
              onChange={(e) => setHoodSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
            <Checkbox
              checked={onlyWithCitizens}
              onCheckedChange={(v) => setOnlyWithCitizens(!!v)}
            />
            Sadece kaydı olan mahalleler
          </label>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor...</div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Mahalle bulunamadı.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mahalle</TableHead>
                <TableHead>Muhtar</TableHead>
                <TableHead className="text-right">Nüfus</TableHead>
                <TableHead className="text-right">Vatandaş</TableHead>
                <TableHead className="text-right">Şikayet</TableHead>
                <TableHead className="text-right">Açık</TableHead>
                <TableHead className="text-right">Memnuniyet</TableHead>
                <TableHead className="text-right">İşlem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((h) => {
                const acik = openHoodId === h.id;
                return (
                  <Fragment key={h.id}>
                    <TableRow
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => setOpenHoodId(acik ? null : h.id)}
                    >
                      <TableCell className="font-semibold">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
                          <div>
                            <div>{h.name}</div>
                            {h.district && (
                              <div className="text-[11px] text-muted-foreground font-normal">
                                {h.district}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {h.mukhtarName ? (
                          <div>
                            <div>{h.mukhtarName}</div>
                            {h.mukhtarPhone && (
                              <a
                                href={`https://wa.me/${h.mukhtarPhone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] text-emerald-600 hover:underline"
                              >
                                {h.mukhtarPhone}
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {h.population ? h.population.toLocaleString("tr-TR") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={h.citizenCount ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {h.citizenCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs">{h.complaintCount}</TableCell>
                      <TableCell className="text-right">
                        {h.openComplaintCount > 0 ? (
                          <Badge
                            variant="outline"
                            className="text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                          >
                            {h.openComplaintCount}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {h.avgSatisfaction !== null ? `${h.avgSatisfaction} / 5` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs">
                          {acik ? "Kapat" : "Vatandaşlar"}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {acik && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="p-4">
                          {citizensLoading ? (
                            <div className="text-xs text-muted-foreground">
                              Vatandaşlar yükleniyor...
                            </div>
                          ) : hoodCitizens.length === 0 ? (
                            <div className="text-xs text-muted-foreground">
                              Bu mahallede kayıtlı vatandaş yok. Buraya bir şikayet geldiğinde
                              otomatik eklenir.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-muted-foreground">
                                {h.name} mahallesine kayıtlı {hoodCitizens.length} vatandaş — duyuru
                                bu kişilere gider
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {hoodCitizens.map((c) => (
                                  <div
                                    key={c.phone}
                                    className="rounded-lg border bg-background p-3 space-y-1"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold text-sm truncate">
                                        {c.name || "Vatandaş"}
                                      </span>
                                      {c.isManual && (
                                        <Badge variant="outline" className="text-[9px]">
                                          elle
                                        </Badge>
                                      )}
                                    </div>
                                    <a
                                      href={`https://wa.me/${c.phone}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1 text-xs text-emerald-600 hover:underline font-mono"
                                    >
                                      <Phone className="h-3 w-3" /> {formatPhoneNumber(c.phone)}
                                    </a>
                                    <div className="flex flex-wrap gap-1 pt-0.5">
                                      <Badge variant="secondary" className="text-[10px]">
                                        {c.language.toUpperCase()}
                                      </Badge>
                                      <Badge variant="secondary" className="text-[10px]">
                                        bu mahallede {c.complaintsHere} şikayet
                                      </Badge>
                                      {c.kvkkAccepted ? (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        >
                                          KVKK ✓
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                                        >
                                          KVKK bekliyor
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
