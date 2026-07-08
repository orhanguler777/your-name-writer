# Belediye AI Modülü V1 — Uygulama Planı

Tamamen Türkçe, kurumsal SaaS görünümlü, Supabase (Lovable Cloud) destekli, rol bazlı yetkilendirmeli belediye yönetim paneli.

## 1. Backend (Lovable Cloud / Supabase)

**Enable Lovable Cloud** — kimlik doğrulama, veritabanı, storage.

### Tablolar (14 adet, tam şema)
`profiles`, `departments`, `deputy_mayors`, `neighborhoods`, `complaints`, `complaint_attachments`, `complaint_responses`, `complaint_assignment_feedback`, `mayor_daily_messages`, `mayor_daily_message_targets`, `vehicles`, `personnel`, `personnel_attendance`, `ai_bot_logs`.

Ayrıca:
- `app_role` enum: `vatandas`, `cozum_masasi`, `mudurluk`, `baskan`, `admin`
- `user_roles` tablosu (rol ayrı tabloda — güvenlik)
- `has_role()` security definer fonksiyonu

### RLS Politikaları
- admin/baskan → tüm veriler
- cozum_masasi → tüm şikayetler (SELECT/UPDATE)
- mudurluk → sadece kendi `department_id` şikayetleri
- vatandas → sadece kendi `citizen_user_id` şikayetleri
- mesajlar/araç/personel → role göre

### Indexler
Belirtilen tüm indexler oluşturulacak.

### Storage
`complaint-attachments` bucket (public read, authenticated write).

### Seed Data
- 5 başkan yardımcısı, 20 mahalle, 12 müdürlük
- 40 personel, 25 araç, 200 devam kaydı
- 100 şikayet, 50 cevap, 20 AI düzeltme
- 10 başkan mesajı
- Demo kullanıcı profilleri (auth kullanıcıları migration ile oluşturulamaz; onboarding sırasında rol atanır — demo için hazır profiller seed edilir, kullanıcı `/auth`'tan kayıt olur ve admin rol atar; ya da signup sonrası trigger ile otomatik rol)

## 2. Kimlik Doğrulama
- `/auth` sayfası (giriş + kayıt, email/şifre)
- `_authenticated` layout (integration-managed)
- Signup trigger → `profiles` + varsayılan `vatandas` rolü
- Rol bazlı yönlendirme

## 3. Sayfa Yapısı (TanStack Route)

```
/                          → Landing / giriş yönlendirme
/auth                      → Giriş / Kayıt
/_authenticated/
  dashboard                → Ana Panel (role göre özet)
  sikayetler               → Şikayet listesi (rol filtreli)
  sikayetler/$id           → Şikayet detay + AI kartı
  sikayet-olustur          → Vatandaş şikayet formu
  cozum-masasi             → Çözüm Masası paneli
  mudurluk                 → Müdürlük paneli
  baskan                   → Başkan KPI + grafik paneli
  baskan-ai-bot            → AI sohbet
  whatsapp                 → WhatsApp simülasyonu
  gunluk-mesajlar          → Başkan mesajları
  arac-bakim               → Araç takip
  personel-analizi         → Devam analizi
  ayarlar                  → Profil / ayarlar
```

Sol menü + üst kullanıcı barı ortak layout.

## 4. AI Katmanı (Lovable AI Gateway)

`google/gemini-3-flash-preview` üzerinden server function'lar:
- `classifyComplaint` — kategori/müdürlük/öncelik/dil + güven skoru + otomatik Türkçe cevap. Anahtar kelime eşleştirmesi + LLM.
- `mayorBotQuery` — başkanın doğal dil sorularına Supabase verisiyle Türkçe cevap (özet/bulgu/aksiyon/kayıtlar formatında).
- `attendanceInsight` — personel devam AI içgörüsü.
- `dailySummary` — başkan günlük özeti.

Fallback: AI hatasında anahtar kelime tabanlı yerel sınıflandırma.

## 5. Frontend Bileşenleri

- `AppShell` (sol menü + top bar, rol bazlı menü)
- `KpiCard`, `StatusBadge`, `PriorityBadge`
- `ComplaintTable`, `ComplaintFilters`, `ComplaintDetail`
- `AiClassificationCard` (kabul et / müdürlüğü değiştir)
- `WhatsAppSimulator`
- `MayorCharts` (recharts: bar/pie/line)
- `MayorAiChat`
- `VehicleTable` + uyarı etiketleri (7/15 gün)
- `AttendanceDashboard`
- Tüm formlar zod validation, tüm metinler Türkçe.

## 6. Tasarım Sistemi

`src/styles.css` içinde tokenlar:
- Lacivert `--primary` (oklch), belediye yeşili `--accent`
- Beyaz/açık gri yüzeyler
- Durum renkleri: mavi/turuncu/mor/yeşil/kırmızı (semantic tokens)
- Öncelik renkleri
- Font: Inter yerine belediye kurumsallığına uygun `Manrope` (başlık) + `Inter` (gövde) → `__root.tsx` `<link>` ile
- Shadow/gradient tokenları

Kart tabanlı düzen, geniş boşluklar, kurumsal his.

## 7. Teknik Notlar

- TanStack Start server functions (RPC) — AI çağrıları, ağır sorgular
- TanStack Query — veri fetch (loader + `useSuspenseQuery`)
- Recharts — grafikler
- Tüm route'larda `errorComponent` + `notFoundComponent`
- Her sayfa `head()` metadata (Türkçe title/description)
- `date-fns` Türkçe locale (`tr`)

## 8. Uygulama Sırası (aynı turda)

1. Cloud enable + tam SQL migration (tablolar + RLS + roles + indexes + storage)
2. Seed data migration
3. Auth trigger (signup → profile + varsayılan rol)
4. Auth sayfası + `_authenticated` doğrulama
5. AppShell + sol menü + design tokens
6. Ana panel + rol yönlendirme
7. Şikayet modülü (liste, detay, oluştur) + AI sınıflandırma server fn
8. Çözüm Masası + Müdürlük panelleri
9. Başkan paneli + grafikler
10. Başkan AI Bot server fn + UI
11. WhatsApp simülatörü
12. Günlük mesajlar
13. Araç bakım
14. Personel analizi
15. Final polish

## Onay

Bu çok geniş bir sistem — tek turda tam olarak bitmesi olası değil. Öneri: yukarıdaki sırayla üretiyorum, her modül bittiğinde çalışan bir kesit teslim ederim. **V1 için**: 1–7 (çekirdek şikayet akışı + AI + auth + design system) ilk turda; kalanı takip eden turlarda. Onaylıyor musunuz, yoksa öncelik değişsin mi?
