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
import {
  Megaphone, Plus, Trash2, FileText, Calendar, Loader2,
  Paperclip, Upload, X, ExternalLink, Image as ImageIcon, Send, CheckCircle2, Edit2
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/duyurular")({
  ssr: false,
  component: DuyurularPage,
  head: () => ({ meta: [{ title: "Duyurular & Reklamlar — Belediye AI" }] }),
});

function DuyurularPage() {
  const { primaryRole } = useAuth();
  const queryClient = useQueryClient();
  
  // Yetki Kontrolü: Başkan, Admin veya Çözüm Masası yeni duyuru ekleyebilir/silebilir
  const isAuthorized = ["baskan", "admin", "cozum_masasi"].includes(primaryRole);

  const [isOpen, setIsOpen] = useState(false);
  const [editingAnn, setEditingAnn] = useState<any | null>(null);
  
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
      const { data, error } = await supabase
        .from("announcements")
        .insert([newAnn])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Duyuru başarıyla yayınlandı.");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      resetForm();
    },
    onError: (error: any) => {
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
    onError: (error: any) => {
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
    onError: (error: any) => {
      toast.error("Duyuru silinemedi: " + error.message);
    },
  });

  // Broadcast Mutation - WhatsApp'ta Yayınla
  const broadcastMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. sent_at güncelle
      const { error } = await supabase
        .from("announcements")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // 2. Doğrudan bot webhook'una post et (fallback/anında gönderim)
      try {
        await fetch("http://localhost:3001/broadcast-announcement", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ announcementId: id }),
        });
      } catch (err) {
        console.warn("Realtime dışı doğrudan webhook tetikleme başarısız oldu (Sorun değil, bot açıksa realtime ile de alacaktır):", err);
      }
    },
    onSuccess: () => {
      toast.success("Duyuru WhatsApp üzerinden tüm vatandaşlara gönderilmeye başlandı.");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (error: any) => {
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

  const handleEditClick = (ann: any) => {
    setEditingAnn(ann);
    setTitle(ann.title || "");
    setDescription(ann.description || "");
    setStartDate(ann.start_date || "");
    setEndDate(ann.end_date || "");
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
        fileType = file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "pdf" : "other";
      }

      if (editingAnn) {
        // Update mode
        await updateMutation.mutateAsync({
          id: editingAnn.id,
          title,
          description,
          file_url: fileUrl || editingAnn.file_url || undefined,
          file_type: fileType || editingAnn.file_type || undefined,
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

    } catch (error: any) {
      console.error(error);
      toast.error("Kaydedilirken hata oluştu: " + error.message);
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
              <Label htmlFor="title" className="text-slate-300">Başlık (Zorunlu)</Label>
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
              <Label htmlFor="description" className="text-slate-300">Açıklama / Detaylar</Label>
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
                <Label htmlFor="start_date" className="text-slate-300">Başlangıç Tarihi</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 bg-slate-800 border-slate-700 text-white focus:ring-indigo-500"
                />
              </div>
              <div>
                <Label htmlFor="end_date" className="text-slate-300">Bitiş Tarihi</Label>
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
              <Label className="text-slate-300">Görsel veya Belge Yükle (PDF, JPEG, PNG vb.)</Label>
              <div className="mt-1 flex justify-center rounded-lg border border-dashed border-slate-700 px-6 py-6 bg-slate-800/40 hover:bg-slate-800/60 transition-colors">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-slate-400" />
                  <div className="mt-2 flex text-sm text-slate-300">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md font-semibold text-indigo-400 hover:text-indigo-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500"
                    >
                      <span>Bir dosya seçin</span>
                      <input
                        id="file-upload"
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        className="sr-only"
                        ref={fileInputRef}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG, PDF (maksimum 10MB)</p>
                </div>
              </div>
              {file && (
                <div className="mt-3 flex items-center justify-between p-2 rounded-md bg-slate-800 text-sm">
                  <div className="flex items-center gap-2 text-slate-200">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-4 w-4 text-indigo-400" />
                    ) : (
                      <FileText className="h-4 w-4 text-orange-400" />
                    )}
                    <span className="truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
                    <span className="text-xs text-slate-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
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
                {(uploading || createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {uploading ? "Dosya Yükleniyor..." : (createMutation.isPending || updateMutation.isPending) ? "Kaydediliyor..." : editingAnn ? "Değişiklikleri Kaydet" : "Duyuruyu Yayınla"}
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
            <Card key={ann.id} className="overflow-hidden flex flex-col justify-between border-0 bg-slate-900 text-slate-100 shadow-md">
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
                        {ann.start_date ? new Date(ann.start_date).toLocaleDateString("tr-TR") : "—"}
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
                        if (confirm(ann.sent_at ? "Bu duyuruyu WhatsApp üzerinden tekrar göndermek istediğinize emin misiniz?" : "Bu duyuruyu WhatsApp üzerinden tüm vatandaşlara göndermek istediğinize emin misiniz?")) {
                          broadcastMutation.mutate(ann.id);
                        }
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
    </div>
  );
}
