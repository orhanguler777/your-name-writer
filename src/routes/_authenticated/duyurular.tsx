import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, EmptyState } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { fetchCitizensData } from "@/lib/ai.functions";
import {
  fetchNeighborhoodSegments,
  fetchPhonesByNeighborhoods,
  type NeighborhoodSegment,
} from "@/lib/citizens.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Megaphone,
  Plus,
  Trash2,
  FileText,
  Calendar,
  Loader2,
  Paperclip,
  Upload,
  X,
  ExternalLink,
  Image as ImageIcon,
  Send,
  CheckCircle2,
  Edit2,
  Video,
  Users,
  Globe,
  Filter,
  Search,
  MapPin,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/duyurular")({
  ssr: false,
  component: DuyurularPage,
  head: () => ({ meta: [{ title: "Duyurular & Reklamlar — Belediye AI" }] }),
});

function DuyurularPage() {
  const { primaryRole } = useAuth();
  const queryClient = useQueryClient();

  // Yetki Kontrolü: Üst yönetim, müdürlükler veya çözüm masası yeni duyuru ekleyebilir/silebilir/yayınlayabilir
  const isAuthorized = [
    "baskan",
    "admin",
    "cozum_masasi",
    "mudur",
    "sef",
    "mudurluk",
    "baskan_yardimcisi",
    "superuser",
  ].includes(primaryRole);

  const [isOpen, setIsOpen] = useState(false);
  const [editingAnn, setEditingAnn] = useState<Record<string, unknown> | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch Announcements
  const { data: announcements, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Create Announcement Mutation
  const createMutation = useMutation({
    mutationFn: async (newAnn: {
      title: string;
      description: string;
      file_url?: string;
      file_type?: string;
      start_date?: string;
      end_date?: string;
    }) => {
      const { data, error } = await supabase.from("announcements").insert([newAnn]).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Duyuru başarıyla yayınlandı.");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error("Duyuru oluşturulamadı: " + error.message);
    },
  });

  // Update Announcement Mutation
  const updateMutation = useMutation({
    mutationFn: async (updatedAnn: {
      id: string;
      title: string;
      description: string;
      file_url?: string;
      file_type?: string;
      start_date?: string;
      end_date?: string;
    }) => {
      const { data, error } = await supabase
        .from("announcements")
        .update({
          title: updatedAnn.title,
          description: updatedAnn.description,
          file_url: updatedAnn.file_url,
          file_type: updatedAnn.file_type,
          start_date: updatedAnn.start_date || null,
          end_date: updatedAnn.end_date || null,
        })
        .eq("id", updatedAnn.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Duyuru başarıyla güncellendi.");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      resetForm();
    },
    onError: (error: Error) => {
      toast.error("Duyuru güncellenemedi: " + error.message);
    },
  });

  // Delete Announcement Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Duyuru silindi.");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (error: Error) => {
      toast.error("Duyuru silinemedi: " + error.message);
    },
  });

  // Broadcast Modal State
  // Yayın diyaloğunda yalnızca bu iki alan kullanılıyor. Record<string, unknown>
  // olarak tutulduğunda title JSX'e konamıyor (unknown) ve id için her yerde
  // cast gerekiyordu.
  const [broadcastAnn, setBroadcastAnn] = useState<{ id: string; title: string } | null>(null);
  const [broadcastTargetMode, setBroadcastTargetMode] = useState<
    "all" | "segment" | "neighborhood" | "custom"
  >("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHoodIds, setSelectedHoodIds] = useState<string[]>([]);
  const [hoodSearch, setHoodSearch] = useState("");

  const getCitizens = useServerFn(fetchCitizensData);
  const getHoodSegments = useServerFn(fetchNeighborhoodSegments);
  const getPhonesByHoods = useServerFn(fetchPhonesByNeighborhoods);

  const { data: citizens = [] } = useQuery({
    queryKey: ["citizens-broadcast-data"],
    queryFn: () => getCitizens({ data: {} }),
    enabled: !!broadcastAnn,
  });

  // Mahalle segmentleri: yalnızca vatandaşı olan mahalleler hedeflenebilir.
  const { data: hoodSegments = [] } = useQuery<NeighborhoodSegment[]>({
    queryKey: ["neighborhood-segments"],
    queryFn: () => getHoodSegments({}),
    enabled: !!broadcastAnn,
  });

  // Seçilen mahallelerin tekilleştirilmiş telefon listesi (aynı vatandaş birden
  // çok mahallede olabilir, sayıyı şişirmemek için sunucudan tekil alıyoruz).
  const { data: hoodPhones, isFetching: hoodPhonesLoading } = useQuery({
    queryKey: ["neighborhood-phones", selectedHoodIds],
    queryFn: () => getPhonesByHoods({ data: { neighborhoodIds: selectedHoodIds } }),
    enabled: broadcastTargetMode === "neighborhood" && selectedHoodIds.length > 0,
  });
  const hoodTargetPhones = hoodPhones?.phones ?? [];

  const filteredHoods = hoodSegments.filter((h) =>
    hoodSearch.trim()
      ? h.name.toLocaleLowerCase("tr").includes(hoodSearch.toLocaleLowerCase("tr"))
      : true,
  );

  // Filtered citizens for modal selection
  const filteredCitizens = citizens.filter((c: Record<string, unknown>) => {
    if (selectedLanguage !== "all" && c.language !== selectedLanguage) return false;
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      const nameMatch = (c.name as string | undefined)?.toLowerCase().includes(s);
      const phoneMatch = (c.phone as string | undefined)?.includes(s);
      return nameMatch || phoneMatch;
    }
    return true;
  });

  // Broadcast Mutation - WhatsApp'ta Yayınla
  const broadcastMutation = useMutation({
    mutationFn: async ({ id, phones }: { id: string; phones?: string[] }) => {
      // 1. sent_at güncelle
      const { error } = await supabase
        .from("announcements")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // 2. Doğrudan bot webhook'una post et
      try {
        await fetch("http://localhost:3001/broadcast-announcement", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ announcementId: id, targetPhones: phones }),
        });
      } catch (err) {
        console.warn(
          "Realtime dışı doğrudan webhook tetikleme başarısız oldu (Sorun değil, bot açıksa realtime ile de alacaktır):",
          err,
        );
      }
    },
    onSuccess: () => {
      toast.success("Duyuru seçilen vatandaşlara WhatsApp üzerinden gönderilmeye başlandı.");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setBroadcastAnn(null);
      setSelectedPhones([]);
    },
    onError: (error: Error) => {
      toast.error("Duyuru gönderilemedi: " + error.message);
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setFile(null);
    setIsOpen(false);
    setEditingAnn(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleEditClick = (ann: Record<string, unknown>) => {
    setEditingAnn(ann);
    setTitle((ann.title as string) || "");
    setDescription((ann.description as string) || "");
    setStartDate((ann.start_date as string) || "");
    setEndDate((ann.end_date as string) || "");
    setIsOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error("Lütfen bir başlık girin.");

    setUploading(true);
    let fileUrl = "";
    let fileType = "";

    try {
      if (file) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        // Upload to storage bucket
        const { error: uploadError } = await supabase.storage
          .from("announcements")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from("announcements")
          .getPublicUrl(filePath);

        fileUrl = publicUrlData.publicUrl;
        fileType = file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
            ? "video"
            : file.type === "application/pdf"
              ? "pdf"
              : "other";
      }

      if (editingAnn) {
        // Update mode
        await updateMutation.mutateAsync({
          id: editingAnn.id as string,
          title,
          description,
          file_url: fileUrl || (editingAnn.file_url as string) || undefined,
          file_type: fileType || (editingAnn.file_type as string) || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
      } else {
        // Create mode
        await createMutation.mutateAsync({
          title,
          description,
          file_url: fileUrl || undefined,
          file_type: fileType || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
      }
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Bilinmeyen hata";
      toast.error("Kaydedilirken hata oluştu: " + msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Duyurular & Reklamlar"
          description="Vatandaşlara duyurulacak etkinlikler, festivaller ve reklam içeriklerini yönetin."
        />
        {isAuthorized && (
          <Button
            onClick={() => setIsOpen((prev) => !prev)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2 self-start sm:self-center"
          >
            {isOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isOpen ? "Kapat" : "Yeni Duyuru Ekle"}
          </Button>
        )}
      </div>

      {/* Creation/Edit form */}
      {isOpen && isAuthorized && (
        <Card className="p-6 border-0 bg-slate-900 text-slate-50 shadow-xl max-w-2xl relative overflow-hidden transition-all duration-300">
          <div className="absolute top-0 right-0 p-12 bg-slate-800/40 rounded-bl-full -mr-6 -mt-6 pointer-events-none" />
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-indigo-400" />
            {editingAnn ? "Duyuruyu Düzenle" : "Yeni Duyuru Yayınla"}
          </h3>
          <form onSubmit={handleUploadAndSave} className="space-y-4 relative z-10">
            <div>
              <Label htmlFor="title" className="text-slate-300">
                Başlık (Zorunlu)
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Festival veya Etkinlik Başlığı"
                className="mt-1 bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-slate-300">
                Açıklama / Detaylar
              </Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Duyuru hakkında detaylı bilgi yazın..."
                rows={4}
                className="w-full mt-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date" className="text-slate-300">
                  Başlangıç Tarihi
                </Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-700 text-white focus:ring-indigo-500"
                />
              </div>
              <div>
                <Label htmlFor="end_date" className="text-slate-300">
                  Bitiş Tarihi
                </Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-700 text-white focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <Label className="text-slate-300">
                Görsel, Video veya Belge Yükle (PDF, JPEG, MP4 vb.)
              </Label>
              {/* Tüm alan tıklanabilir: ikon, yazı ve boşluklar dosya seçiciyi açar. */}
              <label
                htmlFor="file-upload"
                className="group mt-1 flex cursor-pointer justify-center rounded-lg border border-dashed border-slate-700 px-6 py-6 bg-slate-800/40 hover:bg-slate-800/60 hover:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500 transition-colors"
              >
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                  <div className="mt-2 text-sm font-semibold text-indigo-400 group-hover:text-indigo-300">
                    Bir dosya seçin
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Görsel, Video, PDF (maksimum 10MB)</p>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  onChange={handleFileChange}
                  className="sr-only"
                  ref={fileInputRef}
                />
              </label>
              {file && (
                <div className="mt-3 flex items-center justify-between p-2 rounded-md bg-slate-800 text-sm">
                  <div className="flex items-center gap-2 text-slate-200">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4 text-indigo-400" />
                    ) : file.type.startsWith("video/") ? (
                      <Video className="h-4 w-4 text-red-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-orange-400" />
                    )}
                    <span className="truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
                    <span className="text-xs text-slate-400">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-slate-400 hover:text-white hover:bg-slate-700 h-6 w-6"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={resetForm}
                className="text-slate-300 hover:text-white hover:bg-slate-800"
              >
                İptal
              </Button>
              <Button
                type="submit"
                disabled={uploading || createMutation.isPending || updateMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-2"
              >
                {(uploading || createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {uploading
                  ? "Dosya Yükleniyor..."
                  : createMutation.isPending || updateMutation.isPending
                    ? "Kaydediliyor..."
                    : editingAnn
                      ? "Değişiklikleri Kaydet"
                      : "Duyuruyu Yayınla"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Announcements List */}
      {isLoading ? (
        <div className="p-8 text-center text-sm text-slate-400">Duyurular yükleniyor...</div>
      ) : !announcements || announcements.length === 0 ? (
        <EmptyState
          title="Henüz Duyuru Bulunmuyor"
          description="Sistemde kayıtlı aktif bir festival, etkinlik veya duyuru reklamı bulunmamaktadır."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {announcements.map((ann) => (
            <Card
              key={ann.id}
              className="overflow-hidden flex flex-col justify-between border-0 bg-slate-900 text-slate-100 shadow-md"
            >
              <div>
                {/* Media Preview */}
                {ann.file_url ? (
                  <div className="h-48 w-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    {ann.file_type === "image" ? (
                      <img
                        src={ann.file_url}
                        alt={ann.title}
                        className="w-full h-full object-cover"
                      />
                    ) : ann.file_type === "video" ? (
                      <video src={ann.file_url} controls className="w-full h-full object-cover" />
                    ) : ann.file_type === "pdf" ? (
                      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <FileText className="h-12 w-12 text-orange-400" />
                        <span className="text-xs text-slate-300 font-medium">PDF Dökümanı</span>
                        <a
                          href={ann.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-full hover:bg-slate-750 transition-colors"
                        >
                          Görüntüle <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Paperclip className="h-10 w-10 text-slate-400" />
                        <span className="text-xs text-slate-400">Ekli Dosya</span>
                        <a
                          href={ann.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                        >
                          İndir <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-48 w-full bg-slate-950/60 flex flex-col items-center justify-center text-slate-500 border-b border-slate-800">
                    <Megaphone className="h-12 w-12 text-slate-700 mb-2" />
                    <span className="text-xs">Görsel bulunmuyor</span>
                  </div>
                )}

                {/* Content */}
                <div className="p-5 space-y-3">
                  <h4 className="font-bold text-lg leading-snug line-clamp-2">{ann.title}</h4>

                  {ann.description && (
                    <p className="text-sm text-slate-300 line-clamp-4 whitespace-pre-line leading-relaxed">
                      {ann.description}
                    </p>
                  )}

                  {/* Dates */}
                  {(ann.start_date || ann.end_date) && (
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/40 p-2 rounded-md border border-slate-800">
                      <Calendar className="h-3.5 w-3.5 text-indigo-400" />
                      <span>
                        {ann.start_date
                          ? new Date(ann.start_date).toLocaleDateString("tr-TR")
                          : "—"}
                        {" / "}
                        {ann.end_date ? new Date(ann.end_date).toLocaleDateString("tr-TR") : "—"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              {isAuthorized && (
                <div className="p-5 pt-0 flex justify-between items-center border-t border-slate-800/60 mt-4 flex-wrap gap-2">
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setBroadcastAnn(ann);
                        setBroadcastTargetMode("all");
                        setSelectedLanguage("all");
                        setSelectedPhones([]);
                        setSearchTerm("");
                      }}
                      disabled={broadcastMutation.isPending}
                      className="text-emerald-400 hover:text-white hover:bg-emerald-500/20 text-xs flex items-center gap-1 px-2.5"
                    >
                      {broadcastMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : ann.sent_at ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {ann.sent_at ? "Tekrar Gönder" : "WhatsApp'ta Yayınla"}
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => handleEditClick(ann)}
                      className="text-indigo-400 hover:text-white hover:bg-indigo-500/20 text-xs flex items-center gap-1 px-2.5"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Düzenle
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm("Bu duyuruyu silmek istediğinize emin misiniz?")) {
                        deleteMutation.mutate(ann.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-red-400 hover:text-white hover:bg-red-500/20 text-xs flex items-center gap-1 px-2.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Sil
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Broadcast Recipient Selection Modal */}
      <Dialog open={!!broadcastAnn} onOpenChange={(open) => !open && setBroadcastAnn(null)}>
        <DialogContent className="sm:max-w-xl bg-slate-900 text-slate-100 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-emerald-400">
              <Send className="h-5 w-5" />
              WhatsApp Yayın Alıcı Seçimi
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              "{broadcastAnn?.title}" başlıklı duyurunun gönderileceği hedef vatandaş grubunu veya
              kişileri belirleyin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Mode selection cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setBroadcastTargetMode("all")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  broadcastTargetMode === "all"
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                    : "border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <Users className="h-3.5 w-3.5" /> Tüm Vatandaşlar
                </div>
                <div className="text-[11px] opacity-75">Tüm kayıtlı rehbere yayınla</div>
              </button>

              <button
                type="button"
                onClick={() => setBroadcastTargetMode("segment")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  broadcastTargetMode === "segment"
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                    : "border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <Globe className="h-3.5 w-3.5" /> Dil / Segment
                </div>
                <div className="text-[11px] opacity-75">Belli dildeki vatandaşlara</div>
              </button>

              <button
                type="button"
                onClick={() => setBroadcastTargetMode("neighborhood")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  broadcastTargetMode === "neighborhood"
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                    : "border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <MapPin className="h-3.5 w-3.5" /> Mahalle
                </div>
                <div className="text-[11px] opacity-75">Seçilen mahallelere</div>
              </button>

              <button
                type="button"
                onClick={() => setBroadcastTargetMode("custom")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  broadcastTargetMode === "custom"
                    ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                    : "border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                  <Filter className="h-3.5 w-3.5" /> Seçmeli Vatandaş
                </div>
                <div className="text-[11px] opacity-75">Listededen tek tek seç</div>
              </button>
            </div>

            {/* Segment Filtering */}
            {broadcastTargetMode === "segment" && (
              <div className="space-y-2 p-3 bg-slate-800/50 rounded-lg border border-slate-800">
                <Label className="text-xs text-slate-300">Hedef Dil Segmenti Seçin:</Label>
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white text-xs">
                    <SelectValue placeholder="Dil Seçiniz" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                    <SelectItem value="all">Tüm Diller</SelectItem>
                    <SelectItem value="tr">🇹🇷 Türkçe</SelectItem>
                    <SelectItem value="ru">🇷🇺 Rusça (Русский)</SelectItem>
                    <SelectItem value="en">🇬🇧 İngilizce (English)</SelectItem>
                    <SelectItem value="de">🇩🇪 Almanca (Deutsch)</SelectItem>
                    <SelectItem value="ar">🇦🇪 Arapça (العربية)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">
                  Bu kritere uyan toplam{" "}
                  <strong className="text-emerald-400">{filteredCitizens.length}</strong> vatandaş
                  hedeflenecek.
                </p>
              </div>
            )}

            {/* Neighborhood Selection */}
            {broadcastTargetMode === "neighborhood" && (
              <div className="space-y-2 p-3 bg-slate-800/50 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-slate-300">Hedef Mahalleleri Seçin:</Label>
                  {selectedHoodIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedHoodIds([])}
                      className="text-[11px] text-slate-400 hover:text-white underline"
                    >
                      Seçimi temizle
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                  <Input
                    placeholder="Mahalle ara... (örn. Kadıpaşa)"
                    value={hoodSearch}
                    onChange={(e) => setHoodSearch(e.target.value)}
                    className="pl-8 bg-slate-900 border-slate-700 text-xs text-white"
                  />
                </div>

                <div className="max-h-52 overflow-y-auto rounded-md border border-slate-800 divide-y divide-slate-800/70">
                  {filteredHoods.length === 0 && (
                    <div className="p-3 text-[11px] text-slate-500">Mahalle bulunamadı.</div>
                  )}
                  {filteredHoods.map((h) => {
                    const checked = selectedHoodIds.includes(h.id);
                    const empty = h.citizenCount === 0;
                    return (
                      <label
                        key={h.id}
                        className={`flex items-center gap-2 px-2.5 py-2 text-xs ${
                          empty
                            ? "opacity-45 cursor-not-allowed"
                            : "cursor-pointer hover:bg-slate-800/60"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={empty}
                          onCheckedChange={(v) =>
                            setSelectedHoodIds((prev) =>
                              v ? [...prev, h.id] : prev.filter((id) => id !== h.id),
                            )
                          }
                        />
                        <span className="flex-1 text-slate-200">{h.name}</span>
                        <span
                          className={`text-[10px] ${empty ? "text-slate-600" : "text-emerald-400"}`}
                        >
                          {empty ? "kayıtlı vatandaş yok" : `${h.citizenCount} vatandaş`}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <p className="text-[11px] text-slate-400">
                  {selectedHoodIds.length === 0 ? (
                    "Henüz mahalle seçilmedi."
                  ) : hoodPhonesLoading ? (
                    "Alıcılar hesaplanıyor..."
                  ) : (
                    <>
                      {selectedHoodIds.length} mahalle seçildi, toplam{" "}
                      <strong className="text-emerald-400">{hoodTargetPhones.length}</strong>{" "}
                      vatandaş hedeflenecek. Birden çok mahalleye kayıtlı vatandaşlar tek sayılır.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Custom Individual Selection */}
            {broadcastTargetMode === "custom" && (
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                    <Input
                      placeholder="İsim veya telefon ara..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 bg-slate-800 border-slate-700 text-xs text-white"
                    />
                  </div>
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                    <SelectTrigger className="w-36 bg-slate-800 border-slate-700 text-white text-xs">
                      <SelectValue placeholder="Dil" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                      <SelectItem value="all">Tüm Diller</SelectItem>
                      <SelectItem value="tr">Türkçe</SelectItem>
                      <SelectItem value="ru">Rusça</SelectItem>
                      <SelectItem value="en">İngilizce</SelectItem>
                      <SelectItem value="de">Almanca</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 px-1">
                  <span>
                    Seçilen: <strong className="text-emerald-400">{selectedPhones.length}</strong>{" "}
                    kişi
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPhones(
                          filteredCitizens.map((c: Record<string, unknown>) => c.phone as string),
                        )
                      }
                      className="text-indigo-400 hover:underline text-[11px]"
                    >
                      Tümünü Seç
                    </button>
                    <span>|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPhones([])}
                      className="text-slate-400 hover:underline text-[11px]"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 rounded-md border border-slate-800 bg-slate-950/50 p-2">
                  {filteredCitizens.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-4">
                      Vatandaş bulunamadı.
                    </div>
                  ) : (
                    filteredCitizens.map((c: Record<string, unknown>) => {
                      const phone = c.phone as string;
                      const name = c.name as string;
                      const language = (c.language as string) || "tr";
                      const isSelected = selectedPhones.includes(phone);
                      return (
                        <label
                          key={phone}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors text-xs ${
                            isSelected
                              ? "bg-emerald-950/40 border border-emerald-800/60"
                              : "hover:bg-slate-800/60"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedPhones((prev) => [...prev, phone]);
                                } else {
                                  setSelectedPhones((prev) => prev.filter((p) => p !== phone));
                                }
                              }}
                            />
                            <div>
                              <div className="font-medium text-slate-200">{name}</div>
                              <div className="text-[11px] text-slate-400">{phone}</div>
                            </div>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                            {language}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBroadcastAnn(null)}
              className="text-slate-400 hover:text-white text-xs"
            >
              İptal
            </Button>
            <Button
              type="button"
              disabled={
                broadcastMutation.isPending ||
                (broadcastTargetMode === "custom" && selectedPhones.length === 0) ||
                (broadcastTargetMode === "neighborhood" &&
                  (hoodPhonesLoading || hoodTargetPhones.length === 0))
              }
              onClick={() => {
                // Diyalog yalnızca broadcastAnn doluyken açık, ama tip düzeyinde
                // garanti değil; erken çıkışla null erişimi kapatıyoruz.
                if (!broadcastAnn) return;
                let targetPhonesToSubmit: string[] | undefined = undefined;

                if (broadcastTargetMode === "segment") {
                  targetPhonesToSubmit = filteredCitizens.map(
                    (c: Record<string, unknown>) => c.phone as string,
                  );
                } else if (broadcastTargetMode === "neighborhood") {
                  targetPhonesToSubmit = hoodTargetPhones;
                } else if (broadcastTargetMode === "custom") {
                  targetPhonesToSubmit = selectedPhones;
                }

                broadcastMutation.mutate({
                  id: broadcastAnn.id,
                  phones: targetPhonesToSubmit,
                });
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5"
            >
              {broadcastMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {broadcastTargetMode === "all"
                ? "Tüm Vatandaşlara Gönder"
                : broadcastTargetMode === "segment"
                  ? `${filteredCitizens.length} Vatandaşa Gönder`
                  : broadcastTargetMode === "neighborhood"
                    ? `${hoodTargetPhones.length} Vatandaşa Gönder`
                    : `${selectedPhones.length} Kişiye Gönder`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
