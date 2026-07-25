-- ADIM 1/2 — Genel "personel" (birim görevlisi) rolü
--
-- Neden: 4. seviye rolü birime özel adlandırılmıştı (zabita_memuru). Bu mantıkla her
-- birim için ayrı rol gerekirdi (fen_isleri_memuru, temizlik_memuru, ...) → 33 birim
-- için rol patlaması. Doğru model: rol = KADEME, departman = BİRİM.
--
--   1. baskan             → tüm şehir
--   2. baskan_yardimcisi  → bağlı müdürlükler (deputy_mayor_id)
--   3. mudur              → kendi müdürlüğü (department_id)
--   4. personel           → kendi müdürlüğü (department_id)   ← genel
--
-- NOT: ALTER TYPE ... ADD VALUE aynı işlem içinde kullanılamaz; bu dosya tek başına
-- çalıştırılmalı, modül/RLS değişiklikleri 2. adımda.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'personel';
