import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/panel-primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PieChart, Plus, Trash2, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/anketler/")({
  ssr: false,
  component: PollsList,
  head: () => ({ meta: [{ title: "Anketler — Belediye AI" }] }),
});

function PollsList() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const { data: polls, isLoading } = useQuery({
    queryKey: ["polls-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polls")
        .select("*, poll_votes(count), poll_options(count)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createPoll = useMutation({
    mutationFn: async () => {
      let imageUrl = null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("attachments")
          .upload(`polls/${fileName}`, imageFile);
          
        if (uploadError) throw uploadError;
        
        const { data: publicUrlData } = supabase.storage
          .from("attachments")
          .getPublicUrl(`polls/${fileName}`);
          
        imageUrl = publicUrlData.publicUrl;
      }

      // 1. Create Poll
      const { data: pollData, error: pollError } = await supabase
        .from("polls")
        .insert({
          title,
          question,
          image_url: imageUrl,
          created_by: profile?.id,
          status: "active",
          sent_to_whatsapp: false,
        })
        .select("id")
        .single();

      if (pollError) throw pollError;

      // 2. Create Options
      const validOptions = options.filter(o => o.trim() !== "");
      if (validOptions.length < 2) throw new Error("En az 2 şık girmelisiniz.");

      const optionsData = validOptions.map(opt => ({
        poll_id: pollData.id,
        option_text: opt.trim(),
      }));

      const { error: optError } = await supabase
        .from("poll_options")
        .insert(optionsData);

      if (optError) throw optError;

      return pollData.id;
    },
    onSuccess: () => {
      toast.success("Anket başarıyla oluşturuldu! Listeden 'Gönder' butonuna basarak WhatsApp'a iletebilirsiniz.");
      setIsDialogOpen(false);
      setTitle("");
      setQuestion("");
      setOptions(["", ""]);
      setImageFile(null);
      queryClient.invalidateQueries({ queryKey: ["polls-list"] });
    },
    onError: (error: any) => {
      toast.error("Hata: " + error.message);
    },
  });

  const sendPollAgain = useMutation({
    mutationFn: async (pollId: string) => {
      const response = await fetch("http://localhost:3001/send-poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId }),
      });
      if (!response.ok) {
        throw new Error("Bot sunucusuna ulaşılamadı.");
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success("Anket gönderim isteği bota iletildi!");
    },
    onError: (error: any) => {
      toast.error("Gönderim Hatası: " + error.message);
    }
  });

  const handleAddOption = () => {
    setOptions([...options, ""]);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
  };

  const handleOptionChange = (index: number, val: string) => {
    const newOptions = [...options];
    newOptions[index] = val;
    setOptions(newOptions);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Anketler"
          description="Vatandaşlara gönderilen WhatsApp anketlerini buradan yönetebilirsiniz."
          icon={PieChart}
        />
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Yeni Anket Oluştur
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Yeni Anket Oluştur</DialogTitle>
              <DialogDescription>
                Anket başlığını, sorusunu ve şıklarını belirleyin. Anket kaydedildiğinde WhatsApp üzerinden kullanıcılara gönderilecektir.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Resim (İsteğe Bağlı)</label>
                <div className="flex items-center gap-3">
                  <Input 
                    id="poll-image-upload"
                    type="file" 
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                  <label 
                    htmlFor="poll-image-upload"
                    className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
                  >
                    Resim Seç
                  </label>
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                    {imageFile ? imageFile.name : "Henüz resim seçilmedi"}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Anket Başlığı (WhatsApp'ta kalın görünür)</label>
                <Input 
                  placeholder="Örn: Eski Belediye Binası" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Soru</label>
                <Input 
                  placeholder="Eski belediye binasını ne yapalım?" 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Şıklar (En az 2)</label>
                {options.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input 
                      placeholder={`Şık ${i + 1}`}
                      value={opt}
                      onChange={(e) => handleOptionChange(i, e.target.value)}
                    />
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={() => handleRemoveOption(i)}
                      disabled={options.length <= 2}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={handleAddOption} className="w-full mt-2">
                  <Plus className="h-4 w-4 mr-2" /> Şık Ekle
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={createPoll.isPending} onClick={() => createPoll.mutate()}>
                {createPoll.isPending ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-hidden border-sidebar-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>
        ) : polls?.length === 0 ? (
          <EmptyState
            icon={PieChart}
            title="Henüz anket yok"
            description="Vatandaşların fikrini almak için yeni bir anket oluşturun."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Başlık</TableHead>
                <TableHead>Soru</TableHead>
                <TableHead>Tarih</TableHead>
                <TableHead>Toplam Oy</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="text-right">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {polls?.map((poll) => {
                const totalVotes = poll.poll_votes[0]?.count || 0;
                return (
                  <TableRow key={poll.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="font-medium">{poll.title}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{poll.question}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(poll.created_at).toLocaleDateString("tr-TR")}
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {totalVotes} oy
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                        {poll.status === "active" ? (
                          <span className="text-green-500">Aktif</span>
                        ) : (
                          <span className="text-muted-foreground">Tamamlandı</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-2">
                      <Button 
                        variant={poll.sent_to_whatsapp ? "outline" : "default"} 
                        size="sm" 
                        onClick={() => sendPollAgain.mutate(poll.id)}
                        disabled={sendPollAgain.isPending}
                      >
                        {sendPollAgain.isPending ? "İşleniyor..." : (poll.sent_to_whatsapp ? "Tekrar Gönder" : "Gönder")}
                      </Button>
                      <Link to="/anketler/$id" params={{ id: poll.id }}>
                        <Button variant="ghost" size="sm">
                          Sonuçları Gör
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
